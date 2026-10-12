/**
 * The probe cache: what each server answered the last time it was probed, kept
 * under `<home>/mcp/cache.json` so a scan probes only what the cache cannot
 * answer. It is derived data — deleting the file costs one round of probes and
 * nothing else — so a document this build cannot read is dropped and rebuilt,
 * never repaired.
 *
 * The fingerprint is what "already known" means: a declaration, a scope or a
 * working directory that changed is a miss and is probed again; an edited
 * comment in a client's file is not. The host is the only writer, every write
 * prunes names the catalog no longer holds, and writes go through one queue so
 * probes running side by side cannot lose each other's answers.
 */
import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"

import { writeFileAtomic } from "@workspace/core/host/atomic"
import { resolveHubHome } from "@workspace/core/host/home"
import type { AssetScope } from "@workspace/core/place-files"

import type { McpDeclaration } from "../declaration.ts"
import { declarationLine } from "../declaration.ts"
import type {
  McpCacheEntry,
  McpProbeError,
  McpProbeErrorKind,
  McpProbeIcon,
  McpProbeReport,
  McpProbeTool,
} from "../probe.ts"

/**
 * The probe implementation's version: raised when a probe collects or reports
 * more than before, which retires every stored answer and re-probes each
 * server once.
 */
export const PROBE_VERSION = 4

/** The document's own format version. */
const CACHE_VERSION = 1

/** Directory under the hub home the cache lives in. */
export const CACHE_DIR = "mcp"

/** One server as the cache is asked about it. */
export interface McpProbeTarget extends McpProbeSubject {
  name: string
}

/**
 * The part of a target that decides whether an answer still applies. The name
 * is a cache key, not a fact about the server, so it stays out of it.
 */
export interface McpProbeSubject {
  declaration: McpDeclaration
  scope: AssetScope
  /** The directory a stdio server would start in; part of what makes two declarations the same one. */
  cwd: string | null
}

/** The cache, as the route uses it. */
export interface McpProbeCache {
  /** For each target: its answer, or null when the cache holds none that applies. */
  compare(targets: readonly McpProbeTarget[]): Promise<Record<string, McpCacheEntry | null>>
  /** Keep one answer, dropping every stored name that is not in `names`. */
  record(name: string, entry: McpCacheEntry, names: readonly string[]): Promise<void>
  /** Where the document lives, for a person reading the host's files. */
  root: string
}

/**
 * What makes one answer apply to one server: its declaration, the scope it is
 * declared in, and the directory a stdio server would start in.
 *
 * @param subject — the server as the catalog currently describes it.
 * @returns a digest a person could compare, prefixed with its algorithm.
 */
export function fingerprintOf(subject: McpProbeSubject): string {
  const text = canonical({
    cwd: subject.cwd,
    declaration: subject.declaration,
    scope: subject.scope,
  })
  return `sha256:${createHash("sha256").update(text).digest("hex")}`
}

/**
 * The entry one report becomes, fingerprinted against the server it answered.
 *
 * @param subject — the server the probe ran for.
 * @param report — what the probe answered.
 * @param at — when it answered, in epoch milliseconds.
 */
export function cacheEntryOf(
  subject: McpProbeSubject,
  report: McpProbeReport,
  at: number
): McpCacheEntry {
  return {
    ...report,
    probe: PROBE_VERSION,
    fingerprint: fingerprintOf(subject),
    target: declarationLine(subject.declaration),
    scope: subject.scope,
    at,
  }
}

/**
 * The cache backed by `<home>/mcp/cache.json`.
 *
 * @param options — `home` overrides the hub home, which the check script uses.
 */
export function createProbeCache(options: { home?: string } = {}): McpProbeCache {
  const root = path.join(resolveHubHome(options.home), CACHE_DIR)
  const file = path.join(root, "cache.json")
  let tail: Promise<unknown> = Promise.resolve()

  /** Run writes one after another: each is a read-modify-write of one document. */
  const run = <T>(work: () => Promise<T>): Promise<T> => {
    const next = tail.then(work, work)
    tail = next.catch(() => undefined)
    return next
  }

  const read = async (): Promise<Record<string, McpCacheEntry>> => {
    const raw = await fs.readFile(file, "utf8").catch(() => null)
    if (raw === null) return {}
    try {
      /* An editor on Windows may save the file with a byte order mark. */
      return entriesOf(JSON.parse(raw.replace(/^\uFEFF/, "")))
    } catch {
      /* Derived data this build cannot read is dropped; probing fills it again. */
      return {}
    }
  }

  return {
    root,

    async compare(targets) {
      const known = await read()
      const answers: Record<string, McpCacheEntry | null> = {}
      for (const target of targets) {
        const entry = known[target.name]
        const applies =
          entry !== undefined &&
          entry.probe === PROBE_VERSION &&
          entry.fingerprint === fingerprintOf(target)
        answers[target.name] = applies ? entry : null
      }
      return answers
    },

    async record(name, entry, names) {
      await run(async () => {
        const known = await read()
        const keep: Record<string, McpCacheEntry> = {}
        for (const held of new Set([...names, name])) {
          const value = held === name ? entry : known[held]
          if (value !== undefined) keep[held] = value
        }
        const document = `${JSON.stringify({ version: CACHE_VERSION, servers: keep }, null, 2)}\n`
        await writeFileAtomic(file, document)
      })
    },
  }
}

/** The entries a stored document holds, dropping everything this build cannot read. */
export function entriesOf(stored: unknown): Record<string, McpCacheEntry> {
  if (typeof stored !== "object" || stored === null) return {}
  const servers = (stored as { servers?: unknown }).servers
  if (typeof servers !== "object" || servers === null) return {}
  const entries: Record<string, McpCacheEntry> = {}
  for (const [name, held] of Object.entries(servers as Record<string, unknown>)) {
    const entry = entryOf(held)
    if (entry !== null) entries[name] = entry
  }
  return entries
}

/**
 * One stored value read back as an entry, or null when it is not one — the
 * cache is durable JSON, so a reader validates what it finds.
 */
export function entryOf(value: unknown): McpCacheEntry | null {
  if (typeof value !== "object" || value === null) return null
  const held = value as Record<string, unknown>
  if (typeof held.probe !== "number") return null
  if (typeof held.fingerprint !== "string" || held.fingerprint === "") return null
  if (typeof held.target !== "string") return null
  if (held.scope !== "workspace" && held.scope !== "global") return null
  if (typeof held.at !== "number" || typeof held.ms !== "number") return null
  if (typeof held.ok !== "boolean") return null

  const serverInfo = readServerInfo(held.serverInfo)
  const icon = readIcon(held.icon)
  const tools = readTools(held.tools)
  const error = readError(held.error)
  return {
    ok: held.ok,
    ms: held.ms,
    at: held.at,
    probe: held.probe,
    fingerprint: held.fingerprint,
    target: held.target,
    scope: held.scope,
    ...(typeof held.protocolVersion === "string" ? { protocolVersion: held.protocolVersion } : {}),
    ...(serverInfo === undefined ? {} : { serverInfo }),
    ...(icon === undefined ? {} : { icon }),
    ...(typeof held.capabilities === "object" && held.capabilities !== null
      ? { capabilities: held.capabilities as Record<string, unknown> }
      : {}),
    ...(typeof held.instructions === "string" ? { instructions: held.instructions } : {}),
    ...(tools === undefined ? {} : { tools }),
    ...(typeof held.toolsTrimmed === "number" ? { toolsTrimmed: held.toolsTrimmed } : {}),
    ...(error === undefined ? {} : { error }),
    ...(typeof held.stderr === "string" && held.stderr !== "" ? { stderr: held.stderr } : {}),
  }
}

/** A stored serverInfo, with the fields a panel reads. */
function readServerInfo(value: unknown): McpProbeReport["serverInfo"] | undefined {
  if (typeof value !== "object" || value === null) return undefined
  const held = value as Record<string, unknown>
  if (typeof held.name !== "string" || held.name === "") return undefined
  if (typeof held.version !== "string") return undefined
  return {
    name: held.name,
    version: held.version,
    ...(typeof held.title === "string" ? { title: held.title } : {}),
    ...(typeof held.websiteUrl === "string" ? { websiteUrl: held.websiteUrl } : {}),
    ...(typeof held.description === "string" ? { description: held.description } : {}),
  }
}

/** A stored icon, kept only when it still carries a source. */
function readIcon(value: unknown): McpProbeIcon | undefined {
  if (typeof value !== "object" || value === null) return undefined
  const held = value as Record<string, unknown>
  if (typeof held.src !== "string" || held.src === "") return undefined
  return {
    src: held.src,
    ...(typeof held.mimeType === "string" ? { mimeType: held.mimeType } : {}),
    ...(Array.isArray(held.sizes)
      ? { sizes: held.sizes.filter((size): size is string => typeof size === "string") }
      : {}),
    ...(held.theme === "light" || held.theme === "dark" ? { theme: held.theme } : {}),
  }
}

/** Stored tools, keeping every item whose name survived; schemas stay as answered. */
function readTools(value: unknown): McpProbeTool[] | undefined {
  if (!Array.isArray(value)) return undefined
  const tools: McpProbeTool[] = []
  for (const held of value) {
    if (typeof held !== "object" || held === null) continue
    const item = held as Record<string, unknown>
    if (typeof item.name !== "string" || item.name === "") continue
    tools.push({
      name: item.name,
      ...(typeof item.title === "string" ? { title: item.title } : {}),
      ...(typeof item.description === "string" ? { description: item.description } : {}),
      ...("inputSchema" in item ? { inputSchema: item.inputSchema } : {}),
      ...("outputSchema" in item ? { outputSchema: item.outputSchema } : {}),
    })
  }
  return tools
}

const ERROR_KINDS: readonly McpProbeErrorKind[] = [
  "env",
  "spawn",
  "auth",
  "network",
  "timeout",
  "protocol",
  "unknown",
]

/** A stored failure, kept only when its kind is one this build has a sentence for. */
function readError(value: unknown): McpProbeError | undefined {
  if (typeof value !== "object" || value === null) return undefined
  const held = value as Record<string, unknown>
  if (typeof held.kind !== "string" || !ERROR_KINDS.includes(held.kind as McpProbeErrorKind)) {
    return undefined
  }
  if (typeof held.message !== "string") return undefined
  const params = readParams(held.params)
  return {
    kind: held.kind as McpProbeErrorKind,
    message: held.message,
    ...(typeof held.code === "string" ? { code: held.code } : {}),
    ...(params === undefined ? {} : { params }),
  }
}

/** The placeholders one failure carries, all of them strings. */
function readParams(value: unknown): Record<string, string> | undefined {
  if (typeof value !== "object" || value === null) return undefined
  const params: Record<string, string> = {}
  for (const [key, held] of Object.entries(value as Record<string, unknown>)) {
    if (typeof held === "string") params[key] = held
  }
  return Object.keys(params).length === 0 ? undefined : params
}

/** One value as text with its keys in one order, so a digest cannot drift with key order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(",")}]`
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right)
    )
    return `{${entries.map(([key, held]) => `${JSON.stringify(key)}:${canonical(held)}`).join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}
