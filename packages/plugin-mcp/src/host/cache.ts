/**
 * The probe cache: what each server answered the last time it was probed, kept
 * under `<home>/mcp/cache.json` so a scan probes only the servers the cache
 * cannot answer for. It is derived data — deleting the file costs one round of
 * probes and nothing else — so a document this build cannot read is dropped and
 * rebuilt, never repaired.
 *
 * A name is what "already known" means: a server the cache holds an answer for
 * is one the page shows that answer for, whatever its declaration now says. A
 * declaration, a scope or a working directory that changed is not a reason to
 * probe again — the person asks for the next probe, and until then the answer
 * they have is the answer they see. Only a name with no answer at all, or one
 * an older probe wrote, is probed on its own.
 *
 * The host is the only writer, every write prunes names the catalog no longer
 * holds, and writes go through one queue so probes running side by side cannot
 * lose each other's answers.
 */
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
const CACHE_VERSION = 2

/** Directory under the hub home the module's files live in. */
export const MCP_DIR = "mcp"

/** The server an answer describes: the declaration it was probed against, and the scope it was declared in. */
export interface McpProbeSubject {
  declaration: McpDeclaration
  scope: AssetScope
}

/** The cache, as the route uses it. */
export interface McpProbeCache {
  /** For each name: its answer, or null when the cache holds none this build can use. */
  compare(names: readonly string[]): Promise<Record<string, McpCacheEntry | null>>
  /** Keep one answer, dropping every stored name that is not in `names`. */
  record(name: string, entry: McpCacheEntry, names: readonly string[]): Promise<void>
  /** Where the document lives, for a person reading the host's files. */
  root: string
}

/**
 * The entry one report becomes, with the server it answered recorded beside it.
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
  const root = path.join(resolveHubHome(options.home), MCP_DIR)
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

    async compare(names) {
      const known = await read()
      const answers: Record<string, McpCacheEntry | null> = {}
      for (const name of names) {
        const entry = known[name]
        const usable = entry !== undefined && entry.probe === PROBE_VERSION
        answers[name] = usable ? entry : null
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
