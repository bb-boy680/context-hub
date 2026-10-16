/**
 * Getting one plugin pack onto this machine: a repository at a revision, one
 * directory of a repository, an archive over HTTP, or a directory that is
 * already here.
 *
 * Every form ends in the same place — a staged directory holding the pack's own
 * files and nothing of the transport. A git checkout loses its `.git`, which is
 * what the clients' own caches hold too: a person adding the library to a
 * repository is committing the pack, not a clone of somebody else's history.
 *
 * Nothing here decides what a pack *is*; it only produces the directory. Reading
 * the manifests, hashing, and recording are the library's job.
 *
 * This module runs in the process that owns the disk, and is the only place that
 * starts a subprocess.
 */
import { execFile } from "node:child_process"
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import type { PluginOrigin } from "../contract.ts"
import type { PluginSourceSpec } from "../inspect.ts"
import { assertPackRelative } from "./names.ts"

/** How long any one fetch may take before it is abandoned. */
const FETCH_TIMEOUT_MS = 120_000

/** The largest archive this hub will download. */
const ARCHIVE_LIMIT = 64 * 1024 * 1024

/**
 * A fetch that could not be completed, with what failed rather than why this
 * build thinks it failed.
 */
export class PluginFetchError extends Error {
  /** The tail of what the tool printed, for diagnosing a failure. */
  readonly output: string

  /**
   * @param message — what failed, as one sentence.
   * @param output — the tail of the tool's own output.
   */
  constructor(message: string, output = "") {
    super(message)
    this.name = "PluginFetchError"
    this.output = output
  }
}

/** Run one command, with a deadline and a bounded output. */
function run(
  command: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      [...args],
      {
        cwd,
        timeout: FETCH_TIMEOUT_MS,
        maxBuffer: 4 * 1024 * 1024,
        /* Git reads this machine's configuration but must never prompt: a
           credential dialog has nobody to answer it. */
        env: {
          ...process.env,
          ...env,
          GIT_TERMINAL_PROMPT: "0",
          GIT_ASKPASS: "",
          SSH_ASKPASS: "",
          SSH_ASKPASS_REQUIRE: "never",
          LC_ALL: "C",
        },
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const output = `${String(stdout)}${String(stderr)}`.trim()
        if (error === null) {
          resolve(output)
          return
        }
        const timedOut = (error as { killed?: boolean }).killed === true
        reject(
          new PluginFetchError(
            timedOut ? `${command} did not finish within ${String(FETCH_TIMEOUT_MS / 1000)}s` : `${command} failed`,
            output.split("\n").slice(-8).join("\n")
          )
        )
      }
    )
  })
}

/** A fresh staging directory under the hub's own temp area. */
export async function stagingDir(): Promise<string> {
  return fs.mkdtemp(path.join(tmpdir(), "context-hub-plugins-"))
}

/** The revision a repository is at, read without downloading its objects. */
async function resolveRef(url: string, ref: string | undefined, cwd: string): Promise<string> {
  const output = await run("git", ["ls-remote", "--", url, ref ?? "HEAD"], cwd)
  const first = output.split("\n").find((line) => line.trim() !== "")
  const revision = first?.split(/\s+/)[0] ?? ""
  if (!/^[0-9a-f]{7,40}$/i.test(revision)) {
    throw new PluginFetchError(`no revision at ${ref ?? "HEAD"} of ${url}`, output)
  }
  return revision
}

/**
 * Fetch one source into a staged directory, and report what revision landed.
 *
 * @param spec — the source, already parsed.
 * @param stage — the directory to fill; it must be empty.
 * @param work — a directory the fetch may use and leave behind.
 * @returns what was fetched, as the origin the record stores.
 * @throws {PluginFetchError} when the source could not be read.
 */
export async function fetchPlugin(
  spec: PluginSourceSpec,
  stage: string,
  work: string
): Promise<PluginOrigin> {
  switch (spec.kind) {
    case "url": {
      const revision = await resolveRef(spec.url, spec.ref, work)
      const checkout = path.join(work, "checkout")
      await run(
        "git",
        [
          "clone",
          "--depth",
          "1",
          "--no-tags",
          ...(spec.ref === undefined ? [] : ["--branch", spec.ref]),
          "--",
          spec.url,
          checkout,
        ],
        work
      )
      /* The checkout is only a way to get the files; a pack is the files. */
      await fs.rm(path.join(checkout, ".git"), { recursive: true, force: true })
      await fs.cp(checkout, stage, { recursive: true })
      return {
        kind: "url",
        url: spec.url,
        revision,
        ...(spec.ref === undefined ? {} : { ref: spec.ref }),
      }
    }

    case "git-subdir": {
      const revision = await resolveRef(spec.url, spec.ref, work)
      /* The pack is one directory of a repository, so only that directory is
         asked for: a sparse checkout fetches the trees and the blobs the pack
         needs and leaves the rest of the repository on the server. */
      const inside = assertPackRelative(spec.path)
      const checkout = path.join(work, "checkout")
      await run(
        "git",
        [
          "clone",
          "--depth",
          "1",
          "--no-tags",
          "--filter=blob:none",
          "--sparse",
          ...(spec.ref === undefined ? [] : ["--branch", spec.ref]),
          "--",
          spec.url,
          checkout,
        ],
        work
      )
      await run("git", ["sparse-checkout", "set", "--", inside], checkout)
      const from = path.join(checkout, ...inside.split("/"))
      const stat = await fs.stat(from).catch(() => null)
      if (stat === null || !stat.isDirectory()) {
        throw new PluginFetchError(`${spec.url} holds no ${inside} at ${spec.ref ?? "HEAD"}`)
      }
      await fs.rm(path.join(checkout, ".git"), { recursive: true, force: true })
      await fs.cp(from, stage, { recursive: true })
      return {
        kind: "git-subdir",
        url: spec.url,
        path: inside,
        revision,
        ...(spec.ref === undefined ? {} : { ref: spec.ref }),
      }
    }

    case "archive": {
      const response = await fetch(spec.url, { redirect: "follow" })
      if (!response.ok) {
        throw new PluginFetchError(`the archive did not download: ${response.status} ${response.statusText}`)
      }
      const bytes = Buffer.from(await response.arrayBuffer())
      if (bytes.byteLength > ARCHIVE_LIMIT) {
        throw new PluginFetchError("the archive is larger than this hub will download")
      }
      const file = path.join(work, "pack")
      await fs.writeFile(file, bytes)
      await fs.mkdir(stage, { recursive: true })
      /* bsdtar — the `tar` both Windows and macOS ship — reads zip as well as
         tar, so one call covers every archive a pack is shipped as. */
      await run("tar", ["-xf", file, "-C", stage], work)
      const etag = response.headers.get("etag") ?? response.headers.get("last-modified")
      return { kind: "archive", url: spec.url, ...(etag === null ? {} : { revision: etag }) }
    }

    case "local": {
      const stat = await fs.stat(spec.path).catch(() => null)
      if (stat === null) throw new PluginFetchError(`there is nothing at ${spec.path}`)
      if (!stat.isDirectory()) throw new PluginFetchError(`${spec.path} is not a directory`)
      await fs.cp(spec.path, stage, {
        recursive: true,
        /* A pack stands on its own: its files are copied, not linked to a
           directory that may move or change under the library. */
        dereference: true,
        filter: (source) => !/[/\\](?:\.git|node_modules)(?:[/\\]|$)/.test(source),
      })
      return { kind: "local", path: spec.path }
    }
  }
}

/**
 * The repository the marketplace itself is read from, when a pack arrived
 * through one. Kept apart from {@link fetchPlugin} because resolving it is a
 * marketplace concern; this only names the shape.
 */
export interface MarketplaceSource {
  url: string
  name: string
  entry: string
  pinned?: string
}
