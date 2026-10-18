/**
 * Crash notes a person can find after a dialog closes.
 *
 * Only files matching `crash-*.log` are pruned; the directory also holds
 * whatever else the platform or the application writes there.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"

const KEEP = 10

export interface CrashLogInput {
  dir: string
  source: string
  error: unknown
  version: string
  platform: string
  arch: string
  packaged: boolean
  stdoutTail?: string
  stderrTail?: string
  now?: Date
}

/** A file name whose lexical order is its chronological order. */
export function crashLogName(source: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-")
  const clean =
    source
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown"
  return `crash-${stamp}-${clean}.log`
}

/** The last `maxBytes` UTF-8 bytes of a string. */
export function tailOf(text: string, maxBytes: number): string {
  const bytes = Buffer.from(text, "utf8")
  if (bytes.byteLength <= maxBytes) return text
  return bytes.subarray(bytes.byteLength - maxBytes).toString("utf8")
}

export function appendTail(current: string, chunk: Buffer | string, maxBytes: number): string {
  return tailOf(current + chunk.toString(), maxBytes)
}

/** Delete the oldest crash logs beyond `keep`, leaving other files alone. */
export function pruneCrashLogs(dir: string, keep = KEEP): void {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return
  }
  const logs = names
    .filter((name) => /^crash-.*\.log$/.test(name))
    .sort((left, right) => (left < right ? 1 : left > right ? -1 : 0))
  for (const name of logs.slice(keep)) {
    try {
      rmSync(path.join(dir, name), { force: true })
    } catch {
      /* A log that cannot be removed does not block the next one. */
    }
  }
}

/** Write one crash note and answer its path, or `null` when the write failed. */
export function writeCrashLog(input: CrashLogInput): string | null {
  const now = input.now ?? new Date()
  const file = path.join(input.dir, crashLogName(input.source, now))
  const error = input.error instanceof Error ? input.error : new Error(String(input.error))
  const lines = [
    `time: ${now.toISOString()}`,
    `source: ${input.source}`,
    `version: ${input.version}`,
    `platform: ${input.platform}`,
    `arch: ${input.arch}`,
    `packaged: ${input.packaged}`,
    `message: ${error.message}`,
    ...(error.stack === undefined ? [] : ["stack:", error.stack]),
    ...(input.stdoutTail === undefined || input.stdoutTail === ""
      ? []
      : ["server stdout (last 65536 bytes):", input.stdoutTail]),
    ...(input.stderrTail === undefined || input.stderrTail === ""
      ? []
      : ["server stderr (last 65536 bytes):", input.stderrTail]),
    "",
  ]
  try {
    mkdirSync(input.dir, { recursive: true })
    writeFileSync(file, lines.join("\n"), "utf8")
    pruneCrashLogs(input.dir)
    return file
  } catch {
    return null
  }
}
