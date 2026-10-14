/**
 * The catalog as the page draws it: one row per pack, whether this hub holds it
 * or only an agent does.
 *
 * The two are one list on purpose. A pack installed in an agent is real whether
 * or not this hub collected it, and the row is where "not in the library yet"
 * becomes visible — so the merge happens here, once, rather than inside each
 * view.
 *
 * Nothing here reaches a disk or a client: the library's records and the
 * clients' own answers arrive already read. Ages and source words are worded
 * here rather than stored, because a row that carried "2 days ago" would be
 * wrong by the next render.
 */
import { assetRef } from "@workspace/core"
import type { AssetScope, ExtensionIcon } from "@workspace/extensions"

import { installedRevision, type PluginOrigin } from "./contract.ts"
import type { PluginHeld } from "./provider.ts"
import type { PluginRecord } from "./revision.ts"
import type { PluginHeldBy, PluginRow, PluginSource } from "./types.ts"

/** How long a pack has been at its current revision, in the locale's own words. */
function ageOf(iso: string, language: string | undefined, t: (key: string) => string): string {
  if (iso === "") return t("plugins.age.unknown")
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return t("plugins.age.unknown")
  let value = Math.max(0, (Date.now() - then) / 1000)
  const format = new Intl.RelativeTimeFormat(language ?? "en", { numeric: "auto" })
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [30, "day"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ]
  for (const [size, unit] of steps) {
    if (value < size) return format.format(-Math.round(value), unit)
    value /= size
  }
  return t("plugins.age.unknown")
}

/** Where a pack came from, in the word a row shows. */
const SOURCE_WORDS: Record<PluginOrigin["kind"], PluginSource> = {
  url: "repo",
  "git-subdir": "subdir",
  archive: "archive",
  local: "local",
}

/** One record as the row the two views draw. */
export function toRow(
  record: PluginRecord,
  held: readonly PluginHeldBy[],
  language: string | undefined,
  t: (key: string) => string
): PluginRow {
  const installed = installedRevision(record.source)
  const latest = record.checked?.latest
  const current = record.checked?.currentHash
  /* What the card draws large: a picture a person added, or — until there is one
     — the pack's own mark, which fills the space better than a placeholder. */
  const cover = record.assets[0] ?? (record.icon === "" ? undefined : record.icon)
  return {
    id: record.name,
    name: record.name,
    version: record.version,
    description: record.description,
    tags: record.tags,
    source: SOURCE_WORDS[record.source.kind],
    updated: ageOf(record.updatedAt, language, t),
    ...(record.icon === "" ? {} : { icon: assetRef(record.icon) }),
    ...(cover === undefined ? {} : { cover: assetRef(cover) }),
    outdated: installed !== null && latest !== undefined && latest !== installed,
    modified: current !== undefined && current !== record.hash,
    hasSource: installed !== null,
    checkedAt: record.checked?.at ?? "",
    stored: true,
    held,
  }
}

/** One client's answer about the packs it holds. */
export interface ScannedAnswer {
  /** The client's id, which its installer registered under. */
  client: string
  /** The client's own name, as a row shows it. */
  label: string
  /** The mark the client's own extension declares. */
  icon: ExtensionIcon
  /** Every pack it holds, as it reported them. */
  packs: readonly PluginHeld[]
}

/** Packs only agents hold, folded into one entry per pack. */
export interface ScannedPack {
  name: string
  version: string
  /** What the pack says about itself where it sits; empty when it carries no manifest. */
  description: string
  /** The pack's own picture, as a reference into the hub's asset library. */
  icon?: string
  /**
   * Where a client says the pack sits, read as the source recording it would
   * name. One answers for the pack: the clients hold copies of the same pack,
   * and the first one that names a directory is as good as any.
   */
  source?: { kind: "local"; path: string }
  /** The clients holding it, in the order they were read. */
  held: PluginHeldBy[]
}

/** One client's hold on a pack, while the scopes are still being gathered. */
interface HeldBuilder {
  client: string
  label: string
  icon: ExtensionIcon
  scopes: string[]
}

/**
 * Fold every client's answer into one entry per pack.
 *
 * One pack can sit in several clients and in several scopes of one client; the
 * row names them together, because "which agent holds this" is one question
 * rather than one per scope.
 *
 * @param answers — what each client reported, in the order they were asked.
 * @returns one entry per pack, in the order the clients named them.
 */
export function collectScanned(answers: readonly ScannedAnswer[]): ScannedPack[] {
  const byName = new Map<string, ScannedPack & { at: Map<string, HeldBuilder> }>()
  for (const answer of answers) {
    for (const pack of answer.packs) {
      const entry = byName.get(pack.name) ?? {
        name: pack.name,
        version: "",
        description: "",
        held: [],
        at: new Map<string, HeldBuilder>(),
      }
      /* The pack's own version answers when it declares one, and the client's
         reading of it answers otherwise: a version is the pack's, and what an
         agent calls it is that agent's own marker. */
      if (pack.pack.version !== "") entry.version = pack.pack.version
      else if (entry.version === "") entry.version = pack.version
      if (entry.description === "") entry.description = pack.pack.description
      if (entry.icon === undefined && pack.pack.icon !== undefined) entry.icon = pack.pack.icon
      if (entry.source === undefined && pack.source !== undefined) entry.source = pack.source
      const found: HeldBuilder = entry.at.get(answer.client) ?? {
        client: answer.client,
        label: answer.label,
        icon: answer.icon,
        scopes: [],
      }
      if (!found.scopes.includes(pack.scope)) found.scopes.push(pack.scope)
      entry.at.set(answer.client, found)
      byName.set(pack.name, entry)
    }
  }
  return [...byName.values()].map(({ at, ...pack }) => ({ ...pack, held: [...at.values()] }))
}

/** One pack only agents hold, as the row the views draw. */
export function heldRow(pack: ScannedPack): PluginRow {
  return {
    id: pack.name,
    name: pack.name,
    version: pack.version,
    description: pack.description,
    /* The categories are the hub's own — what a person files a pack under once
       it is here — so a pack that is not here carries none. */
    tags: [],
    /* Where this pack is: the directory the agent reads it from, which is on
       this machine. The hub has taken it from nowhere itself. */
    source: "local",
    updated: "",
    /* A pack the hub has not taken in has no picture but its own, so that one
       fills both places: the tile, and the card's own box. Both are read from
       the asset library, which is where the reading of the pack put it. */
    ...(pack.icon === undefined
      ? {}
      : { icon: assetRef(pack.icon), cover: assetRef(pack.icon) }),
    stored: false,
    held: pack.held,
  }
}

/**
 * The library's records and the clients' answers, as one list.
 *
 * A pack both sides know is one row, and the library's record is what it draws:
 * that side holds the files, the description and the checks, and the client's
 * answer only adds the places it is held in.
 *
 * @param records — what the library holds, in its own order.
 * @param scanned — what the clients hold, folded by {@link collectScanned}.
 * @returns the rows, library records first.
 */
export function composeRows(
  records: readonly PluginRecord[],
  scanned: readonly ScannedPack[],
  language: string | undefined,
  t: (key: string) => string
): PluginRow[] {
  const stored = new Set(records.map((record) => record.name))
  const answers = new Map(scanned.map((pack) => [pack.name, pack.held]))
  const rows = records.map((record) => toRow(record, answers.get(record.name) ?? [], language, t))
  for (const pack of scanned) {
    if (stored.has(pack.name)) continue
    rows.push(heldRow(pack))
  }
  return rows
}

/** Which rows a tab shows. */
export type PluginTab = "all" | "library" | "unstored" | "updates" | AssetScope

/**
 * The install scopes each grouped tab stands for, in a client's own words.
 *
 * They are the agents' vocabulary rather than this hub's: Claude Code names all
 * three, Codex only the machine-wide one, and a client that invents a fourth is
 * simply one no tab of this page covers. The page reads this as well, so the tab
 * that groups the agents and the rows it then shows cannot drift apart.
 */
export const SCOPES_OF: Record<AssetScope, readonly string[]> = {
  workspace: ["project", "local"],
  global: ["user"],
}

/** Whether a client — one agent, or any of them — holds the pack in these scopes. */
function holdsIn(row: PluginRow, scopes: readonly string[], place: string | null): boolean {
  return row.held.some(
    (hold) =>
      (place === null || hold.client === place) &&
      hold.scopes.some((scope) => scopes.includes(scope))
  )
}

/**
 * Which rows a tab holds, before the tag filter and the query.
 *
 * The library tab and the unstored one divide the catalog between them: a pack
 * this hub holds the files of, and a pack only a client holds, which is the one
 * thing left to do with it — adopt it.
 *
 * @param rows — the catalog.
 * @param value — the tab on screen.
 * @param place — the one client a scope tab is narrowed to; `null` leaves it whole.
 * @returns the rows the tab shows.
 */
export function rowsForTab(
  rows: readonly PluginRow[],
  value: PluginTab,
  place: string | null = null
): PluginRow[] {
  switch (value) {
    case "all":
      return [...rows]
    case "library":
      return rows.filter((row) => row.stored)
    case "unstored":
      return rows.filter((row) => !row.stored)
    /* Only a pack with a recorded revision can have moved on, which is what
       keeps a pack no client ever fetched out of this set. */
    case "updates":
      return rows.filter((row) => row.outdated === true)
    case "workspace":
    case "global":
      return rows.filter((row) => holdsIn(row, SCOPES_OF[value], place))
  }
}
