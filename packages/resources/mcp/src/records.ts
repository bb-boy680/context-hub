/**
 * The hub's own records: one MCP server as a person declared it here — what it
 * is called, the client entry it installs under that name, and the notes
 * around it.
 *
 * The file is `<home>/mcp/mcp.json`, one object per server. The entry sits
 * under `mcpServers` keyed by the record's name, in the shape a client's config
 * file uses, so installing a server is a matter of taking that entry — and a
 * person reading the file sees what installation would write.
 *
 * This module is the format both sides agree on: the page reads and writes the
 * file through it, and the host uses it to carry records over from the state
 * document earlier builds kept them in. It imports no Node built-in.
 */
import type { McpDeclaration } from "./declaration.ts"
import { readDeclaration, writeDeclaration } from "./declaration.ts"
import { callMcp, callMcpGet } from "./probe.ts"
import type { McpRecord } from "./types.ts"

/** One record as the file stores it. */
export interface McpRecordDocument {
  /** The server's name, which is also its key in every client file. */
  name: string
  /** The client entry, keyed by that name; the record installs by exactly this entry. */
  mcpServers: Record<string, unknown>
  description: string
  tags: string[]
}

/**
 * The entry one declaration is stored as: the object a JSON client file holds,
 * with a remote server naming its transport. That name is what keeps an `sse`
 * server from reading back as `http`; a stdio server is the default and
 * carries none.
 */
export function entryOf(declaration: McpDeclaration): Record<string, unknown> {
  const entry: Record<string, unknown> = { ...writeDeclaration(declaration) }
  if (declaration.transport !== "stdio") entry.type = declaration.transport
  return entry
}

/** One record as the file holds it. */
export function documentOf(record: McpRecord): McpRecordDocument {
  return {
    name: record.name,
    mcpServers: { [record.name]: entryOf(record.declaration) },
    description: record.description,
    tags: [...record.tags],
  }
}

/**
 * One stored value read back as a record, or null when it is not one — the file
 * is durable JSON a person may edit, so a reader validates what it finds.
 *
 * The entry must sit under the record's own name, because that name is the key
 * every client file gets: a file that keys the entry differently holds a server
 * this build cannot place.
 */
export function recordOf(value: unknown): McpRecord | null {
  if (typeof value !== "object" || value === null) return null
  const held = value as {
    name?: unknown
    mcpServers?: unknown
    description?: unknown
    tags?: unknown
  }
  if (typeof held.name !== "string" || held.name === "") return null
  if (typeof held.mcpServers !== "object" || held.mcpServers === null) return null
  const entry = (held.mcpServers as Record<string, unknown>)[held.name]
  const declaration = readDeclaration(entry)
  if (declaration === null) return null
  return {
    name: held.name,
    declaration,
    description: typeof held.description === "string" ? held.description : "",
    tags: Array.isArray(held.tags) ? held.tags.filter((tag) => typeof tag === "string") : [],
  }
}

/**
 * The records a stored document holds. A file with one server may be that one
 * object rather than a list holding it.
 */
export function readRecords(stored: unknown): McpRecord[] {
  const list = Array.isArray(stored) ? stored : [stored]
  return list.map(recordOf).filter((record): record is McpRecord => record !== null)
}

/**
 * The records a previous build kept in the state document: the same fields,
 * with the declaration where the file now holds the client entry. A declaration
 * carries the command or URL an entry is built from, so it reads back with
 * {@link readDeclaration} unchanged.
 */
export function recordsFromState(stored: unknown): McpRecord[] {
  if (!Array.isArray(stored)) return []
  const records: McpRecord[] = []
  for (const value of stored) {
    if (typeof value !== "object" || value === null) continue
    const held = value as {
      name?: unknown
      declaration?: unknown
      description?: unknown
      tags?: unknown
    }
    if (typeof held.name !== "string" || held.name === "") continue
    const declaration = readDeclaration(held.declaration)
    if (declaration === null) continue
    records.push({
      name: held.name,
      declaration,
      description: typeof held.description === "string" ? held.description : "",
      tags: Array.isArray(held.tags) ? held.tags.filter((tag) => typeof tag === "string") : [],
    })
  }
  return records
}

/** The records with one added, replacing the one that carried its name. */
export function upsert(records: readonly McpRecord[], next: McpRecord): McpRecord[] {
  return [...records.filter((record) => record.name !== next.name), next]
}

/** What the hub's own records file answers with. */
export interface McpRecordsAnswer {
  /** The stored document, or null when there is no file yet; the caller validates it. */
  document: unknown
  /** The file as a person reads it, which the library's own place names. */
  file: string
}

/** What the page calls to read and write the records file. */
export interface McpRecordsPort {
  read(): Promise<McpRecordsAnswer>
  /** Replace the file with these records. */
  save(document: readonly McpRecordDocument[]): Promise<void>
}

/** The browser's record port: the host owns the file, so both calls go through it. */
export function createRemoteRecords(base = ""): McpRecordsPort {
  return {
    async read() {
      const answer = await callMcpGet<{ value?: unknown; file?: unknown }>(
        "?action=records",
        base
      )
      return {
        document: answer.value ?? null,
        file: typeof answer.file === "string" ? answer.file : "",
      }
    },
    async save(document) {
      await callMcp({ action: "save-records", records: document }, base)
    },
  }
}
