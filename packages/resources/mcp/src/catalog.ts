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
import type { PlaceFiles } from "@context-hub/core/place-files"
import type { ExtensionIcon } from "@context-hub/extensions"
import type { McpCacheEntry } from "./probe.ts"
import { toolTree } from "./schema-tree.ts"

import type {
  McpAgentPlace,
  McpCatalog,
  McpDeclaration,
  McpDetail,
  McpInstall,
  McpMark,
  McpRecord,
  McpScanProblem,
  McpServer,
} from "./types.ts"

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
 * Every provider's every place, in the order the page lists them: global places
 * first, then workspace ones, and inside a group the order the registry holds —
 * the plugins as they registered, and each one's places as it declared them.
 *
 * A place carries no mark of its own. Its provider is named by the extension
 * that registered it, and that extension's manifest already declares the icon —
 * one declaration per client, which is what `iconFor` reads.
 *
 * @param providers — the providers registered right now, in registration order.
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
          client: provider.id,
          icon: iconFor(provider.id),
        },
      })
    }
  }
  /* Stable sort: one rank per scope, so a group keeps the order it arrived in. */
  return places.sort((left, right) => scopeRank(left.place) - scopeRank(right.place))
}

/** Global places before workspace ones. */
function scopeRank(place: McpAgentPlace): number {
  return place.scope === "global" ? 0 : 1
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
 *
 * `checks` is the probe cache as the last compare left it: an entry that still
 * applies is attached to its row, and a server the cache cannot answer for
 * carries none.
 *
 * @param checks — answers by server name; empty when no cache answered.
 */
export function buildCatalog(
  records: readonly McpRecord[],
  scan: McpScan,
  places: readonly ScannedPlace[],
  problems: McpScanProblem[],
  scannedAt: number,
  checks: Readonly<Record<string, McpCacheEntry | null>> = {}
): McpCatalog {
  const names = new Set<string>(records.map((record) => record.name))
  for (const entries of scan.entries.values()) {
    for (const entry of entries) names.add(entry.name)
  }

  const servers = [...names]
    .map((name) =>
      rowOf(name, records.find((record) => record.name === name), scan, places, checks[name] ?? null)
    )
    .sort((left, right) => left.name.localeCompare(right.name))
  return { servers, scannedAt, problems }
}

/** One row: the record's side, the files' side, and what both add up to. */
function rowOf(
  name: string,
  record: McpRecord | undefined,
  scan: McpScan,
  places: readonly ScannedPlace[],
  check: McpCacheEntry | null
): McpServer {
  const installs: McpInstall[] = []
  const declarations: McpDeclaration[] = []
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
    if (entry.declaration === null) unreadable += 1
    else declarations.push(entry.declaration)
  }

  const declaration = record?.declaration ?? declarations[0] ?? null
  const endpoints = new Set(declarations.map(declarationLine))
  /* Two copies that name the same endpoint agree; the count is only a conflict
     when the copies really differ. */
  const conflicts = endpoints.size > 1 ? endpoints.size : 0
  const detail: McpDetail = {
    declaration,
    tags: record?.tags ?? [],
    installs,
    tools: (check?.tools ?? []).map(toolTree),
  }
  /* One verdict for the row: a file that disagrees with another, an entry this
     build cannot read, and a probe that could not connect all mean the same
     thing to whoever reads the pill, and keeping them apart let a row say both
     "ready" and "process failed" at once. */
  const failed = conflicts > 0 || unreadable > 0 || (check !== null && !check.ok)

  return {
    id: name,
    name,
    transport: declaration?.transport ?? "stdio",
    declaration: declaration === null ? "" : declarationLine(declaration),
    description: descriptionOf(record, check),
    ...(conflicts > 0 ? { conflicts } : {}),
    unreadable,
    installed: installs.length,
    stored: record !== undefined,
    status: failed ? "failed" : "ready",
    ...(check === null ? {} : { check }),
    mark: markOf(name, declaration),
    tag: record?.tags[0] ?? "",
    detail,
  }
}

/**
 * What a row says about the server: the sentence the hub recorded, or failing
 * that the server's own words — the description it published, or the
 * instructions it handed the client, which is the only prose many servers
 * write about themselves.
 */
function descriptionOf(record: McpRecord | undefined, check: McpCacheEntry | null): string {
  const written = record?.description
  if (written !== undefined && written !== "") return written
  const described = check?.serverInfo?.description
  if (described !== undefined && described !== "") return described
  return check?.instructions ?? ""
}

/** The brand a server is drawn with, from its name and what it runs. */
function markOf(name: string, declaration: McpDeclaration | null): McpMark {
  const text = `${name} ${declaration === null ? "" : declarationLine(declaration)}`.toLowerCase()
  for (const [mark, needle] of BRANDS) {
    if (text.includes(needle)) return mark
  }
  return "generic"
}
