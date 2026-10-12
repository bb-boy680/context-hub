/**
 * What the page shows: the hub's own records, the declarations every client
 * file holds, and the merge of the two.
 *
 * Three things are kept apart on purpose. A **record** is what a person wrote
 * in the hub. A **declaration** is a fact in a client's file, read again on
 * every scan. A **server** is the row both add up to — including a name no
 * record knows, because hiding a server that is installed somewhere would be
 * the hub pretending not to see it.
 */
import type { McpEntry, McpFailure, McpIo, McpProvider } from "./contract.ts"
import { declarationLine, mcpFailure } from "./contract.ts"
import type { PlaceFiles } from "@workspace/core/place-files"
import type { ExtensionIcon } from "@workspace/extensions"

import type {
  McpAgentPlace,
  McpCatalog,
  McpDeclaration,
  McpDetail,
  McpInstall,
  McpMark,
  McpPlaceKind,
  McpRecord,
  McpScanProblem,
  McpServer,
} from "./types.ts"

/** State key the hub's own records live under. */
export const RECORDS_KEY = "mcp"

/** The brands the web form ships artwork for, matched by name. */
const BRANDS: [McpMark, string][] = [
  ["github", "github"],
  ["linear", "linear"],
  ["postgresql", "postgres"],
]

/** One log line a provider may write, as the module passes it through. */
export type McpLog = McpIo["log"]

/** One place, with the provider that knows it. */
export interface ScannedPlace {
  place: McpAgentPlace
  provider: McpProvider
}

/** What one scan produced: what each file holds, and what could not be read. */
export interface McpScan {
  /** Entries by place id; a place whose file could not be read is absent. */
  entries: Map<string, McpEntry[]>
  /** Why a file could not be read, in the words the extension named it with. */
  problems: { place: string; failure: McpFailure }[]
}

/**
 * Read one stored value back as a record, or null when it is not one — a state
 * document is durable JSON, so a reader validates what it finds.
 */
export function recordOf(value: unknown): McpRecord | null {
  if (typeof value !== "object" || value === null) return null
  const held = value as Partial<McpRecord>
  if (typeof held.name !== "string" || held.name === "") return null
  if (typeof held.declaration !== "object" || held.declaration === null) return null
  return {
    name: held.name,
    declaration: held.declaration,
    description: typeof held.description === "string" ? held.description : "",
    tags: Array.isArray(held.tags) ? held.tags.filter((tag) => typeof tag === "string") : [],
  }
}

/** The records a form's stored state holds. */
export function readRecords(stored: unknown): McpRecord[] {
  if (!Array.isArray(stored)) return []
  return stored.map(recordOf).filter((record): record is McpRecord => record !== null)
}

/** The records with one added, replacing the one that carried its name. */
export function upsert(records: readonly McpRecord[], next: McpRecord): McpRecord[] {
  return [...records.filter((record) => record.name !== next.name), next]
}

/**
 * Every provider's every place, in the order the page lists them: global places
 * first, then workspace ones, each group by the rank its extension gave it.
 *
 * A place carries no mark of its own. Its provider is named by the extension
 * that registered it, and that extension's manifest already declares the icon —
 * one declaration per client, which is what `iconFor` reads.
 *
 * @param providers — the providers registered right now.
 * @param iconFor — the mark of the extension with that id.
 */
export function placesOf(
  providers: readonly McpProvider[],
  iconFor: (id: string) => ExtensionIcon
): ScannedPlace[] {
  const places: ScannedPlace[] = []
  for (const provider of providers) {
    for (const place of provider.places) {
      places.push({
        provider,
        place: {
          ...place,
          path: place.scope === "global" ? `~/${place.file}` : place.file,
          switchable: provider.setEnabled !== undefined,
          icon: iconFor(provider.id),
        },
      })
    }
  }
  return places.sort(
    (left, right) =>
      rank(left.place) - rank(right.place) || left.place.id.localeCompare(right.place.id)
  )
}

/** Global places before workspace ones; each group by its own rank. */
function rank(place: McpAgentPlace): number {
  return (place.scope === "global" ? 0 : 1000) + place.order
}

/**
 * Read every place's file once.
 *
 * A place whose file cannot be read becomes a problem and stays out of the
 * entries: the page says which file it could not read instead of showing a
 * server as absent when it is really unreadable.
 */
export async function scanPlaces(
  places: readonly ScannedPlace[],
  files: PlaceFiles,
  log: McpLog
): Promise<McpScan> {
  const entries = new Map<string, McpEntry[]>()
  const problems: McpScan["problems"] = []
  const io: McpIo = { files, log }

  await Promise.all(
    places.map(async ({ place, provider }) => {
      try {
        entries.set(place.id, await provider.read(io, place.id))
      } catch (error) {
        problems.push({ place: place.id, failure: mcpFailure(error, "mcp.error.read") })
      }
    })
  )

  return { entries, problems }
}

/**
 * What the page renders: every record and every declaration, merged by name.
 *
 * A server's declaration is the hub's own when it has a record, and otherwise
 * the first client file that holds a readable one; the copy count, the conflict
 * count and the verdict are derived here rather than stored, so nothing the hub
 * remembers can disagree with the files it just read.
 */
export function buildCatalog(
  records: readonly McpRecord[],
  scan: McpScan,
  places: readonly ScannedPlace[],
  problems: McpScanProblem[],
  scannedAt: number
): McpCatalog {
  const names = new Set<string>(records.map((record) => record.name))
  for (const entries of scan.entries.values()) {
    for (const entry of entries) names.add(entry.name)
  }

  const servers = [...names]
    .map((name) => rowOf(name, records.find((record) => record.name === name), scan, places))
    .sort((left, right) => left.name.localeCompare(right.name))
  return { servers, scannedAt, problems }
}

/** One row: the record's side, the files' side, and what both add up to. */
function rowOf(
  name: string,
  record: McpRecord | undefined,
  scan: McpScan,
  places: readonly ScannedPlace[]
): McpServer {
  const installs: McpInstall[] = []
  const declarations: McpDeclaration[] = []
  const scopes = new Set<McpPlaceKind>()
  let unreadable = 0

  for (const { place } of places) {
    const entry = scan.entries.get(place.id)?.find((held) => held.name === name)
    if (entry === undefined) continue
    installs.push({
      place: place.id,
      installed: true,
      enabled: entry.enabled,
      ...(entry.declaration === null ? { unreadable: true } : {}),
    })
    scopes.add(place.scope)
    if (entry.declaration === null) unreadable += 1
    else declarations.push(entry.declaration)
  }

  const declaration = record?.declaration ?? declarations[0] ?? null
  const endpoints = new Set(declarations.map(declarationLine))
  /* Two copies that name the same endpoint agree; the count is only a conflict
     when the copies really differ. */
  const conflicts = endpoints.size > 1 ? endpoints.size : 0
  const detail: McpDetail = { declaration, tags: record?.tags ?? [], installs, tools: 0 }

  return {
    id: name,
    name,
    transport: declaration?.transport ?? "stdio",
    declaration: declaration === null ? "" : declarationLine(declaration),
    description: record?.description ?? "",
    places: [...scopes],
    ...(conflicts > 0 ? { conflicts } : {}),
    unreadable,
    installed: installs.length,
    status: conflicts > 0 || unreadable > 0 ? "failed" : "ready",
    mark: markOf(name, declaration),
    tag: record?.tags[0] ?? "",
    detail,
  }
}

/** The brand a server is drawn with, from its name and what it runs. */
function markOf(name: string, declaration: McpDeclaration | null): McpMark {
  const text = `${name} ${declaration === null ? "" : declarationLine(declaration)}`.toLowerCase()
  for (const [mark, needle] of BRANDS) {
    if (text.includes(needle)) return mark
  }
  return "generic"
}
