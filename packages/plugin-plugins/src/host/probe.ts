/**
 * Asking where a pack came from whether it has moved on.
 *
 * Nothing a client stores answers this: a plugin installed from a marketplace is
 * a copy, and the copy never learns that its source changed. So the hub asks the
 * source itself, at the cheapest level that can answer:
 *
 * 1. A repository is asked with `git ls-remote`, which reads the remote's refs
 *    without downloading any objects — and asks the same ref the pack was taken
 *    at, so a pack pinned to a branch is not reported as behind its `HEAD`.
 * 2. An archive is asked with a `HEAD` request for its validator.
 *
 * A source that cannot be asked — a directory on this machine — is reported as
 * such rather than retried forever.
 *
 * This module runs in the process that owns the disk.
 */
import { execFile } from "node:child_process"
import { tmpdir } from "node:os"

import type { PluginOrigin } from "../contract.ts"
import { hasUpstream, installedRevision } from "../contract.ts"
import type {
  PluginRecord,
  PluginUpdateCheck,
  PluginUpdateSummary,
} from "../revision.ts"
import type { PluginLibrary } from "./library.ts"

/**
 * The check implementation's version. It is raised whenever a check collects or
 * compares something different, which retires every stored answer so no row
 * reports a conclusion an older build reached.
 */
export const CHECK_VERSION = 1

/** How long one question to a source may take. */
const ASK_TIMEOUT_MS = 30_000

/** One resolved revision and what to do about it. */
interface Ask {
  /** The revision the source holds now. */
  latest: string
}

/** Run one command with a deadline, never prompting for credentials. */
function ask(command: string, args: readonly string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      [...args],
      {
        cwd,
        timeout: ASK_TIMEOUT_MS,
        maxBuffer: 2 * 1024 * 1024,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          GIT_ASKPASS: "",
          SSH_ASKPASS: "",
          SSH_ASKPASS_REQUIRE: "never",
          LC_ALL: "C",
        },
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve(String(stdout))
          return
        }
        const detail = `${String(stdout)}${String(stderr)}`.trim().split("\n").slice(-3).join(" · ")
        reject(new Error(`${command} could not answer${detail === "" ? "" : `: ${detail}`}`))
      }
    )
  })
}

/** The revision a remote reports for one ref, which is one round trip and no objects. */
async function remoteRevision(url: string, ref: string | undefined): Promise<string> {
  const output = await ask("git", ["ls-remote", "--", url, ref ?? "HEAD"], tmpdir())
  const line = output.split("\n").find((row) => row.trim() !== "")
  const revision = line?.split(/\s+/)[0] ?? ""
  if (!/^[0-9a-f]{7,40}$/i.test(revision)) throw new Error(`${url} reported no revision`)
  return revision
}

/** What asking one source produced. */
async function askSource(origin: PluginOrigin): Promise<Ask | null> {
  switch (origin.kind) {
    case "url":
      return { latest: await remoteRevision(origin.url, origin.ref) }
    case "archive": {
      const response = await fetch(origin.url, { method: "HEAD", redirect: "follow" })
      if (!response.ok) throw new Error(`${origin.url} answered ${String(response.status)}`)
      const etag = response.headers.get("etag") ?? response.headers.get("last-modified")
      /* A server that publishes no validator cannot be asked; saying so is
         better than reporting a change every time. */
      if (etag === null) throw new Error(`${origin.url} publishes no revision`)
      return { latest: etag }
    }
    /* The revision a subdirectory pack records is the repository's, so the
       answer a check would need is the subdirectory's own last commit. This
       build does not read that yet, and asking the repository instead would
       report an update every time somebody touched an unrelated directory —
       `hasUpstream` keeps these out of the queue rather than answering wrongly. */
    case "git-subdir":
      return null
    case "local":
      return null
  }
}

/** Asking sources about the packs in one library. */
export interface PluginProbe {
  /** Ask about every pack that can be asked; the ones that cannot are listed apart. */
  checkAll(records: readonly PluginRecord[]): Promise<PluginUpdateSummary>
}

/** Create the probe that reads one library's packs. */
export function createPluginProbe(library: PluginLibrary): PluginProbe {
  /** One pack's answer, with the local hash taken at the same moment. */
  const checkOne = async (record: PluginRecord): Promise<PluginUpdateCheck> => {
    const asked = await askSource(record.source)
    if (asked === null) throw new Error("this source cannot be asked about")
    const recorded = installedRevision(record.source)
    const currentHash = await library.hash(record.name)
    return {
      recordedRevision: recorded,
      latestRevision: asked.latest,
      currentHash,
      outdated: recorded !== null && asked.latest !== recorded,
      modified: currentHash !== record.hash,
    }
  }

  return {
    async checkAll(records) {
      const summary: PluginUpdateSummary = {
        checked: 0,
        outdated: 0,
        modified: 0,
        failed: [],
        unanswerable: [],
      }
      const answers = new Map<string, { at: string; latest: string; currentHash: string }>()
      for (const record of records) {
        if (!hasUpstream(record.source)) {
          summary.unanswerable.push(record.name)
          continue
        }
        try {
          const answer = await checkOne(record)
          summary.checked += 1
          if (answer.outdated) summary.outdated += 1
          if (answer.modified) summary.modified += 1
          answers.set(record.name, {
            at: new Date().toISOString(),
            latest: answer.latestRevision,
            currentHash: answer.currentHash,
          })
        } catch (error) {
          summary.failed.push({
            name: record.name,
            reason: error instanceof Error ? error.message : String(error),
          })
        }
      }
      await library.setChecks(answers)
      return summary
    },
  }
}
