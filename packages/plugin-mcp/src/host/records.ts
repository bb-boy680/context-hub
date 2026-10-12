/**
 * The hub's own records, kept at `<home>/mcp/mcp.json`: one entry per server a
 * person declared here, in the shape a client's config file uses — the object
 * under `mcpServers` is what installation writes into a client.
 *
 * A read also carries records over from the state document earlier builds kept
 * them in, once, when the records file is absent: a person's records are
 * theirs, and an upgrade must not lose them. The legacy document is removed
 * only after its records are safe in the new file.
 *
 * The host is the only writer, and writes go through one queue so two changes
 * cannot lose each other.
 */
import { promises as fs } from "node:fs"
import path from "node:path"

import { writeFileAtomic } from "@workspace/core/host/atomic"
import { resolveHubHome } from "@workspace/core/host/home"

import type { McpRecordDocument } from "../records.ts"
import { documentOf, recordsFromState } from "../records.ts"
import { MCP_DIR } from "./cache.ts"

/** The records document's name inside the module's directory. */
export const RECORDS_FILE = "mcp.json"

/** The state document earlier builds kept the records in. */
const LEGACY_DIR = "state"

/** The records file, as the route uses it. */
export interface McpRecordStore {
  /** Where the document lives, for a person reading the host's files. */
  readonly root: string
  /**
   * The stored document, or null when there is none.
   *
   * @throws when the file exists but is not JSON this build can read.
   */
  read(): Promise<unknown>
  /** Replace the document. The caller owns the records' shape; the store writes JSON. */
  save(document: readonly unknown[]): Promise<void>
}

/**
 * The record store backed by `<home>/mcp/mcp.json`.
 *
 * @param options — `home` overrides the hub home, which the check scripts use.
 */
export function createRecordStore(options: { home?: string } = {}): McpRecordStore {
  const home = resolveHubHome(options.home)
  const root = path.join(home, MCP_DIR)
  const file = path.join(root, RECORDS_FILE)
  const legacy = path.join(home, LEGACY_DIR, RECORDS_FILE)
  let tail: Promise<unknown> = Promise.resolve()

  /** Run writes one after another: each is a read-modify-write of one document. */
  const run = <T>(work: () => Promise<T>): Promise<T> => {
    const next = tail.then(work, work)
    tail = next.catch(() => undefined)
    return next
  }

  /** Parse a document, tolerating an editor's byte order mark. */
  const parse = (raw: string): unknown => JSON.parse(raw.replace(/^\uFEFF/, ""))

  /**
   * Carry the state document's records into the records file, once. A document
   * this build cannot read carries nothing over and is left where it is, for
   * whoever knows what it holds.
   */
  const adopt = async (): Promise<unknown> => {
    const raw = await fs.readFile(legacy, "utf8").catch(() => null)
    if (raw === null) return null
    let carried: McpRecordDocument[]
    try {
      carried = recordsFromState(parse(raw)).map(documentOf)
    } catch {
      return null
    }
    if (carried.length === 0) return null
    await writeFileAtomic(file, textOf(carried))
    await fs.rm(legacy, { force: true }).catch(() => undefined)
    return carried
  }

  return {
    root,

    async read() {
      return run(async () => {
        const raw = await fs.readFile(file, "utf8").catch(() => null)
        return raw === null ? await adopt() : parse(raw)
      })
    },

    async save(document) {
      await run(async () => {
        await writeFileAtomic(file, textOf(document))
      })
    },
  }
}

/** One document as the file holds it: two-space JSON, one trailing newline. */
function textOf(document: unknown): string {
  return `${JSON.stringify(document, null, 2)}\n`
}
