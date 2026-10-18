/**
 * The `skills` CLI as the library's way of taking skills from outside.
 *
 * A download runs in a throwaway directory: the CLI only ever writes into an
 * agent directory, so the hub lets it write there, then moves what arrived into
 * its own root. The agent directories a person already has are never touched,
 * and nothing is written to the hub until the CLI reports a skill installed.
 */
import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import type { PackageSkill, SkillImport, SkillUpstream } from "../store.ts"
import { assertSkillName } from "./names.ts"
import { readLockedUpstream } from "./upstream.ts"

/** The agent directory the CLI is asked for: `<cwd>/.agents/skills`. */
const AGENT = "universal"
const INSTALL_DIR = path.join(".agents", "skills")
/** A clone of a large repository, a fetch of a pinned one, and the copy itself. */
const TIMEOUT_MS = 180_000

/** Drop ANSI colours and the cursor control a spinner leaves behind. */
export function stripAnsi(text: string): string {
  /* eslint-disable no-control-regex -- the escape character is what this matches */
  const colour = /\u001b\[[0-9;?]*[A-Za-z]/g
  const charset = /\u001b[()][A-Za-z0-9]/g
  /* eslint-enable no-control-regex */
  return text.replace(colour, "").replace(charset, "")
}

/**
 * Read the rows of `skills add <source> --list`.
 *
 * The CLI refuses `--json` here, so the text is the only report: a group title
 * on its own line, then each skill as `<box>    <name>` followed by
 * `<box>      <description>`. The listing ends at the `Use --skill` footer.
 */
export function parsePackageList(output: string): PackageSkill[] {
  const lines = stripAnsi(output.replace(/\r\n?/g, "\n")).split("\n")
  const start = lines.findIndex((line) => line.includes("Available Skills"))
  if (start < 0) return []
  const skills: PackageSkill[] = []
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("└") || line.includes("Use --skill")) break
    if (!line.startsWith("│")) continue
    const body = line.slice(1)
    if (body.trim() === "") continue
    const indent = body.length - body.trimStart().length
    const text = body.trim()
    if (indent >= 6) {
      /* A description belongs to the skill named on the line above it. */
      const previous = skills[skills.length - 1]
      if (previous !== undefined && previous.description === "") {
        previous.description = text
      }
      continue
    }
    skills.push({ name: text, description: "" })
  }
  return skills
}

/** How to reach npx: the program to spawn and the arguments it takes. */
export interface NpxInvocation {
  file: string
  argv: string[]
}

/** The npm CLI that ships with Node, wherever that installation put it. */
function npxCli(execPath: string, exists: (file: string) => boolean): string | null {
  const dir = path.dirname(execPath)
  const candidates = [
    path.join(dir, "node_modules", "npm", "bin", "npx-cli.js"),
    path.resolve(dir, "..", "lib", "node_modules", "npm", "bin", "npx-cli.js"),
  ]
  return candidates.find((file) => exists(file)) ?? null
}

/**
 * Choose how to start npx.
 *
 * Node ships its own `npx-cli.js`, and running that through `process.execPath`
 * avoids Windows' `.cmd` shim. A compiled hub binary and Electron are not Node,
 * though — `process.execPath` names the app itself — so the only way left is
 * the `npx` on PATH. That one is a `.cmd` on Windows, which `execFile` cannot
 * spawn directly; `cmd.exe /d /s /c` is the standard way in.
 */
export function npxInvocation(
  args: string[],
  options: {
    platform?: NodeJS.Platform
    execPath?: string
    comspec?: string
    exists?: (file: string) => boolean
  } = {}
): NpxInvocation {
  const execPath = options.execPath ?? process.execPath
  const cli = npxCli(execPath, options.exists ?? existsSync)
  if (cli !== null) return { file: execPath, argv: [cli, ...args] }
  if ((options.platform ?? process.platform) === "win32") {
    return {
      file: options.comspec ?? process.env.ComSpec ?? "cmd.exe",
      argv: ["/d", "/s", "/c", "npx", ...args],
    }
  }
  return { file: "npx", argv: args }
}

/**
 * Remove a throwaway directory.
 *
 * Windows can still hold handles on what a just-finished child process wrote,
 * so the first unlink can answer EBUSY. `maxRetries` retries exactly that case;
 * a directory still locked after it belongs to the OS, and failing an install
 * over cleanup would hide whether the install itself worked.
 */
export async function dropWork(work: string): Promise<void> {
  await fs
    .rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    .catch(() => undefined)
}

/** Run the CLI and answer with both streams, whatever its exit code. */
function runCli(
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const invocation = npxInvocation(args)
    execFile(
      invocation.file,
      invocation.argv,
      {
        cwd,
        timeout: TIMEOUT_MS,
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, DISABLE_TELEMETRY: "1", NO_COLOR: "1" },
      },
      (error, stdout, stderr) => {
        if (error !== null && error.killed === true) {
          reject(
            new Error(
              `the skills CLI did not finish in ${TIMEOUT_MS / 1000}s; check the network and the source`
            )
          )
          return
        }
        /* A missing npx is not the CLI failing; name what has to be installed. */
        if (error !== null && error.code === "ENOENT") {
          reject(new Error("npx is not on PATH; install Node.js or add it to PATH"))
          return
        }
        resolve({
          stdout,
          stderr,
          code: typeof error?.code === "number" ? error.code : error === null ? 0 : 1,
        })
      }
    )
  })
}

/** The CLI's own words about a failure, whichever stream carried them. */
function failureText(code: number, ...streams: string[]): string {
  const lines = streams
    .flatMap((stream) => stripAnsi(stream).split("\n"))
    .map((line) => line.replace(/[│◇●◒◐◓◑]/g, "").trim())
    .filter((line) => line !== "")
  const detail = lines.slice(-2).join(" ")
  return detail === "" ? `the skills CLI exited with code ${code}` : detail.slice(0, 400)
}

/** Move one downloaded skill into the library, refusing to replace a name in use. */
async function adopt(from: string, to: string): Promise<void> {
  const source = await fs.stat(from).catch(() => null)
  if (source?.isDirectory() !== true) {
    throw new Error("the CLI reported an install but left no directory")
  }
  const taken = await fs.stat(to).catch(() => null)
  if (taken !== null) throw new Error("a skill with this name is already in the library")
  await fs.cp(from, to, { recursive: true })
}

/** One row of the CLI's `--json` install report. */
interface CliReportEntry {
  name?: string
  status?: string
  error?: string
  reason?: string
}

/** Read the report out of stdout, which npm may have prefixed with its own noise. */
function parseReport(stdout: string): CliReportEntry[] {
  const start = stdout.indexOf("[")
  const end = stdout.lastIndexOf("]")
  if (start < 0 || end < start) return []
  try {
    const parsed: unknown = JSON.parse(stdout.slice(start, end + 1))
    return Array.isArray(parsed) ? (parsed as CliReportEntry[]) : []
  } catch {
    /* A truncated report is no report; the caller reports the CLI's own text. */
    return []
  }
}

/**
 * List the skills a package holds, without writing anything anywhere.
 *
 * @param source — what the CLI accepts as a source: `owner/repo`, a git URL, or
 *   a link to a SKILL.md.
 * @returns the skills the package offers, in the order the CLI lists them.
 */
export async function listPackageSkills(source: string): Promise<PackageSkill[]> {
  const work = await fs.mkdtemp(path.join(tmpdir(), "context-hub-skills-"))
  try {
    const { stdout, stderr, code } = await runCli(["skills", "add", source, "--list"], work)
    const skills = parsePackageList(stdout)
    if (skills.length === 0) throw new Error(failureText(code, stderr, stdout))
    return skills
  } finally {
    await dropWork(work)
  }
}

/** What one source said about a group of skills, without touching the library. */
export interface UpstreamRecords {
  /** The CLI's own record for each skill it installed, keyed by name. */
  records: Map<string, SkillUpstream>
  /** Skills the CLI did not install, each with the reason it gave. */
  failed: Map<string, string>
}

/**
 * Read what the CLI records for the source's current revision of several
 * skills at once: the install runs in a throwaway directory and everything it
 * writes is dropped. One run per package is what keeps a batch check at one
 * clone per source rather than one per skill. A skill the CLI refuses lands in
 * `failed` with the CLI's own reason; the rest still arrive.
 *
 * @param source — the package the lock named, in the form the CLI accepts.
 * @param skills — the skills' directory names in the package.
 * @returns the CLI's records, and its own reasons for whatever it refused.
 * @throws when the CLI answered with no report at all — no network, or a
 *   source it could not read — which speaks for every skill in the group.
 */
export async function fetchUpstreamRecords(
  source: string,
  skills: string[]
): Promise<UpstreamRecords> {
  /* Without `--skill` the CLI takes the whole package; there is nothing to
     ask about, and asking would install everything the source holds. */
  if (skills.length === 0) return { records: new Map(), failed: new Map() }
  const work = await fs.mkdtemp(path.join(tmpdir(), "context-hub-skills-"))
  try {
    const args = ["skills", "add", source]
    for (const skill of skills) args.push("--skill", skill)
    args.push("-a", AGENT, "--copy", "-y", "--json")
    const { stdout, stderr, code } = await runCli(args, work)
    const report = parseReport(stdout)
    if (report.length === 0) throw new Error(failureText(code, stderr, stdout))
    const records = new Map<string, SkillUpstream>()
    const failed = new Map<string, string>()
    /* A failure the CLI reports with no skill attached is the package's own —
       a failed clone, say — and it speaks for every skill it never named. */
    let packageFailure: string | null = null
    for (const entry of report) {
      const name = entry.name ?? ""
      const reason =
        entry.error ?? entry.reason ?? `the CLI reported it as ${entry.status}`
      if (name === "") {
        if (entry.status !== "installed") packageFailure ??= reason
        continue
      }
      if (entry.status !== "installed") {
        failed.set(name, reason)
        continue
      }
      const record = await readLockedUpstream(work, name)
      if (record === null) failed.set(name, "the CLI wrote no lock entry for it")
      else records.set(name, record)
    }
    for (const skill of skills) {
      if (records.has(skill) || failed.has(skill)) continue
      /* The lock is the CLI's own record, so a skill it installed but did not
         name in the report is still answered by it. */
      const record = await readLockedUpstream(work, skill)
      if (record !== null) records.set(skill, record)
      else failed.set(skill, packageFailure ?? "the CLI reported nothing for it")
    }
    return { records, failed }
  } finally {
    await dropWork(work)
  }
}

/**
 * Download the named skills into a library root.
 *
 * @param source — the package to fetch.
 * @param skills — skills to take by name; empty takes everything the package holds.
 * @param root — the skills directory the installed folders land in.
 * @returns what arrived and what the CLI or the library refused, by name.
 */
export async function downloadPackageSkills(
  source: string,
  skills: string[],
  root: string
): Promise<SkillImport> {
  const work = await fs.mkdtemp(path.join(tmpdir(), "context-hub-skills-"))
  try {
    const args = ["skills", "add", source]
    for (const skill of skills) args.push("--skill", skill)
    args.push("-a", AGENT, "--copy", "-y", "--json")
    const { stdout, stderr, code } = await runCli(args, work)
    const report = parseReport(stdout)
    if (report.length === 0) throw new Error(failureText(code, stderr, stdout))
    const records: Record<string, SkillUpstream> = {}
    const result: SkillImport = { installed: [], failed: [], records }
    for (const entry of report) {
      const name = entry.name ?? ""
      if (entry.status !== "installed") {
        result.failed.push({
          name,
          reason: entry.error ?? entry.reason ?? `the CLI reported it as ${entry.status}`,
        })
        continue
      }
      try {
        const safe = assertSkillName(name)
        await adopt(path.join(work, INSTALL_DIR, safe), path.join(root, safe))
        result.installed.push(safe)
        /* The CLI's own lock, written beside where it installed, names the
           package and the revision's hash — the record an update needs. */
        const record = await readLockedUpstream(work, safe)
        if (record !== null) records[safe] = record
      } catch (failure) {
        result.failed.push({
          name,
          reason: failure instanceof Error ? failure.message : String(failure),
        })
      }
    }
    return result
  } finally {
    await dropWork(work)
  }
}
