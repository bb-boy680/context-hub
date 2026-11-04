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
import { assetRef } from "@context-hub/core"
import type { AssetScope, ExtensionIcon } from "@context-hub/extensions"

import { installedRevision, type PluginOrigin } from "./contract.ts"
import { formatPluginSource, originToSpec } from "./inspect.ts"
import type { PluginHeld, PluginPlace, PluginSwitches } from "./provider.ts"
import type { PluginRecord } from "./revision.ts"
import type { PluginClient } from "./library.ts"
import type { PluginHeldBy, PluginHeldPlace, PluginRow, PluginSource } from "./types.ts"

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
  /* What the card draws large: the first picture a person added, and nothing
     else. The pack's own mark is not one — it is the tile beside the name — so a
     pack without one falls through to the README the card renders instead. A
     video is one of these: the card plays it rather than drawing it still. */
  const cover = record.assets[0]
  return {
    id: record.name,
    name: record.name,
    version: record.version,
    description: record.description,
    tags: record.tags,
    source: SOURCE_WORDS[record.source.kind],
    /* The address as the person typed it back when the pack was collected, which
       is the thing a "where did this come from" question is really asking. */
    sourceAddress: formatPluginSource(originToSpec(record.source)),
    updated: ageOf(record.updatedAt, language, t),
    ...(record.icon === "" ? {} : { icon: assetRef(record.icon) }),
    ...(cover === undefined ? {} : { cover: assetRef(cover) }),
    /* The pictures as the record holds them, as references rather than as URLs: a
       pane that drops one has to name the reference itself, and it resolves one
       to a URL with the same `assetRef` this row draws its cover by. */
    pictures: [...record.assets],
    outdated: installed !== null && latest !== undefined && latest !== installed,
    modified: current !== undefined && current !== record.hash,
    hasSource: installed !== null,
    checkedAt: record.checked?.at ?? "",
    /* A pack nobody has asked about has no age to show; saying "never" would be
       a claim about the source rather than about the asking. */
    checkedAge: record.checked === undefined ? "" : ageOf(record.checked.at, language, t),
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
  /** The places it keeps packs in, as it declared them. */
  places: readonly PluginPlace[]
  /** What its files record about each pack's switch, by place and by pack id. */
  switches: PluginSwitches
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
  /** The first source the client names, including one it reports unavailable. */
  source?: { kind: "local"; path: string }
  /** A readable candidate selected separately from the displayed source. */
  directory?: string
  /** The clients holding it, in the order they were read. */
  held: PluginHeldBy[]
}

/** One client's hold on a pack, while the places are still being gathered. */
interface HeldBuilder {
  client: string
  label: string
  icon: ExtensionIcon
  /** The client's own id for the pack, which is what its commands take back. */
  id: string
  places: PluginHeldPlace[]
  /** The client's own answer for the pack, its file chain already resolved. */
  enabled: boolean | undefined
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
export function collectScanned(answers: readonly ScannedAnswer[], globalOnly = false): ScannedPack[] {
  const byName = new Map<string, ScannedPack & { at: Map<string, HeldBuilder> }>()
  for (const answer of answers) {
    for (const pack of answer.packs) {
      const declared = answer.places.find((one) => pack.placeId !== undefined ? one.id === pack.placeId : one.scopeWord === pack.scope)
      const group = declared?.scope ?? (pack.scope === "managed" || pack.scope === "user" ? "global" : "workspace")
      if (globalOnly && group !== "global") continue
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
      if (entry.directory === undefined && pack.source !== undefined && pack.sourceAvailable !== false) entry.directory = pack.source.path
      const found: HeldBuilder = entry.at.get(answer.client) ?? {
        client: answer.client,
        label: answer.label,
        icon: answer.icon,
        /* The client's own id for the pack, which is the same in every place it
           holds it in. It is what that client's own commands take back. */
        id: pack.id,
        places: [],
        enabled: pack.enabled,
      }
      /* True wins; false requires every reported value to be false. */
      if (found.places.length > 0) {
        found.enabled = found.enabled === true || pack.enabled === true ? true
          : found.enabled === false && pack.enabled === false ? false : undefined
      }
      /* One entry per place, each with the answer that place itself gives. The
         group comes from the client's own declaration of the place, so an agent
         naming its scopes its own way still lands where it says it does. */
      /* An explicit setting cannot resolve a client's unknown effective state. */
      const here = pack.enabled === undefined ? undefined : answer.switches[pack.scope]?.[pack.id] ?? pack.enabled
      const already = found.places.find((one) => one.scope === pack.scope && one.id === pack.id && one.placeId === pack.placeId)
      if (already === undefined) {
        found.places.push({
          scope: pack.scope,
          ...(pack.placeId === undefined ? {} : { placeId: pack.placeId }),
          group,
          id: pack.id,
          readOnly: pack.readOnly === true || declared === undefined,
          origin: pack.origin,
          sourceAvailable: pack.sourceAvailable,
          source: pack.source,
          enabled: here,
        })
      } else {
        already.readOnly = already.readOnly || pack.readOnly === true || declared === undefined
        already.enabled = already.enabled === undefined || here === undefined ? undefined : here
        already.sourceAvailable = already.sourceAvailable === false || pack.sourceAvailable === false ? false : already.sourceAvailable ?? pack.sourceAvailable
        if (pack.sourceAvailable === false) already.source = pack.source
      }
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
    /* The directory the agent named, which is the only address this side knows —
       and is what adopting it would collect from. */
    sourceAddress: pack.source?.path ?? "",
    ...(pack.directory === undefined ? {} : { directory: pack.directory }),
    updated: "",
    /* Nothing has asked this pack about any source. */
    checkedAge: "",
    /* The pack's own mark, which is the tile beside its name. What a card draws
       large is a picture a person added, and a pack the hub has not taken in has
       no record for one to live in — so its card falls through to its README. */
    ...(pack.icon === undefined ? {} : { icon: assetRef(pack.icon) }),
    pictures: [],
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
 * @returns scanned rows first, followed by records not seen in any client.
 */
export function composeRows(
  records: readonly PluginRecord[],
  scanned: readonly ScannedPack[],
  language: string | undefined,
  t: (key: string) => string
): PluginRow[] {
  const stored = new Map(records.map((record) => [record.name, record]))
  const seen = new Set<string>()
  const rows: PluginRow[] = []
  for (const pack of scanned) {
    if (seen.has(pack.name)) continue
    seen.add(pack.name)
    const record = stored.get(pack.name)
    rows.push(record === undefined ? heldRow(pack) : toRow(record, pack.held, language, t))
  }
  for (const record of records) {
    if (!seen.has(record.name)) rows.push(toRow(record, [], language, t))
  }
  return rows
}

/** Which rows a tab shows. */
export type PluginTab = "all" | "library" | "unstored" | "updates" | "place"

/**
 * The install scopes each grouped tab stands for, in a client's own words.
 *
 * They are the agents' vocabulary rather than this hub's: Claude Code names all
 * three, Codex only the machine-wide one, and a client that invents a fourth is
 * simply one no tab of this page covers. The page reads this as well, so the tab
 * that groups the agents and the rows it then shows cannot drift apart.
 */
/**
 * The two groups a client's places fall into, in the order every screen lists
 * them.
 *
 * Which places belong to which group is not said here: each client declares it
 * on the place itself, so an agent naming its scopes its own way still lands
 * where it says it does. This is only the order the two are read in.
 */
export const SCOPES: readonly AssetScope[] = ["workspace", "global"]

export function installablePlaces(places: readonly PluginPlace[], hasArtifact = true): PluginPlace[] {
  return places.filter((place) => place.installable !== false || (place.initialInstallable === true && !hasArtifact))
}

/**
 * The place a group's action reaches, given the places an agent keeps.
 *
 * A group holding one place acts on that one. An agent that keeps none there
 * has nothing to act on, and one that keeps several is a case no client of this
 * hub makes — the first in the agent's own order answers.
 *
 * @param places — the places the agent installs into, in its own order.
 * @param group — the group whose action is being resolved.
 */
export function placeReached(
  places: readonly PluginPlace[],
  group: AssetScope,
  hasArtifact = true
): PluginPlace | undefined {
  return installablePlaces(places, hasArtifact).find((one) => one.scope === group)
}

/**
 * One place as the status menu offers it: where the pack's switch can be turned,
 * and what that place currently answers.
 */
export interface PluginPlaceStatus {
  /** Key for the menu row: one agent, one place. */
  id: string
  /** The agent's id, which its installer is registered under. */
  client: string
  /** The agent's own name, as the menu row reads. */
  label: string
  /** The mark the agent's own extension declares. */
  icon: ExtensionIcon
  /** The agent's own declaration of this place, which is what says if it may be moved. */
  declared: PluginPlace
  /**
   * What this place's own file says, absent when that file names no key for the
   * pack at all. Absent is not false: a file that says nothing has left the
   * answer to the chain, and only the agent knows what the chain decided.
   */
  recorded: boolean | undefined
  /** What the row shows and what its switch moves: the file's answer, else the agent's. */
  on: boolean | undefined
}

/**
 * The places the status menu offers for one pack, and what each answers.
 *
 * A place is offered where the pack sits, and where its file decides over one
 * the pack sits in. The second is why this is not simply a list of the agent's
 * records: a pack the machine switched on is switched off for one repository by
 * that repository's file, even though nothing is installed there — so a place
 * with no record is still a real switch.
 *
 * `on` and `recorded` are the two answers a row needs and must not mix up. The
 * agent's own answer for the pack is one value with its whole file chain already
 * resolved, so a place this hub just switched off reads as still on wherever a
 * wider place it sits in overrules it — which is why `on` comes from this place's
 * file wherever that file speaks, and only falls back to the agent where it does
 * not.
 */
export function placesShown(
  plugin: PluginRow,
  clients: readonly PluginClient[]
): PluginPlaceStatus[] {
  return plugin.held.flatMap((hold) => {
    const client = clients.find((one) => one.id === hold.client)
    if (client === undefined) return []
    const sits = new Set(hold.places.filter((one) => !one.readOnly).map((one) => one.scope))
    return client.places.flatMap((declared) => {
      const here = sits.has(declared.scopeWord)
      const over = (declared.overrides ?? []).some((one) => sits.has(one))
      if (!here && !over) return []
      const ids = new Set(hold.places.filter((place) => !place.readOnly).map((place) => place.id ?? hold.id))
      if (ids.size !== 1) return []
      const own = hold.places.filter((place) => !place.readOnly && (place.placeId !== undefined ? place.placeId === declared.id : place.scope === declared.scopeWord))
      const affected = own.length > 0 ? own : hold.places.filter((place) => !place.readOnly && (declared.overrides ?? []).includes(place.scope))
      const hasUnknown = affected.some((place) => place.enabled === undefined)
      const recorded = hasUnknown ? undefined
        : affected.some((place) => place.placeId !== undefined)
          ? affected.some((place) => place.enabled === true)
          : client.switches[declared.scopeWord]?.[[...ids][0]!]
      return [
        {
          id: `${hold.client}:${declared.id}`,
          client: hold.client,
          label: client.label,
          icon: client.icon,
          declared,
          recorded,
          on: hasUnknown ? undefined : recorded ?? hold.enabled,
        },
      ]
    })
  })
}

/**
 * The words each scope wears, in this hub's own vocabulary.
 *
 * Only the words live here: which scopes an agent installs into is that agent's
 * own declaration, carried by its installer.
 */
export const SCOPE_LABELS: Record<string, string> = {
  user: "plugins.scope.user",
  project: "plugins.scope.project",
  local: "plugins.scope.local",
}

export function placeSourceNote(places: readonly PluginHeldPlace[], scope: AssetScope, reached: PluginPlace, t: (key: string) => string): string {
  const here = places.filter((place) => place.group === scope && place.scope === reached.scopeWord)
  if (here.some((place) => place.sourceAvailable === false)) return t("plugins.place.sourceUnavailable")
  const declared = here.some((place) => place.origin === "declaration") ? ` · ${t("plugins.place.declared")}` : ""
  return `${scopeWords([reached.scopeWord], t)}${declared}`
}

/**
 * One agent's scopes as a single line, in the order that agent declared them.
 *
 * A scope is often named by a phrase that already contains a wider one — Claude
 * Code's `local` is "this repository, only me" and its `project` is "this
 * repository" — so a word another word in the same line already says is dropped
 * rather than printed twice. Only that: a scope whose word stands on its own is
 * always shown, because which places an agent keeps a pack in is the whole point
 * of the line.
 *
 * @param scopes — the scopes, in the agent's own order.
 * @param t — the active locale's lookup.
 */
export function scopeWords(scopes: readonly string[], t: (key: string) => string): string {
  const words = scopes.map((one) => t(SCOPE_LABELS[one] ?? one))
  return words
    .filter((word) => !words.some((other) => other !== word && other.includes(word)))
    .join(" · ")
}

/** One agent's places within a scope are one option in the filter. */
export interface PluginFilterPlace {
  scope: AssetScope
  client: string
}

/** A stable menu key that distinguishes both the agent and its scope. */
export function pluginPlaceKey(place: PluginFilterPlace): string {
  return JSON.stringify([place.scope, place.client])
}

/** Drop a selection whose agent no longer offers the selected scope. */
export function selectedPluginPlace(
  clients: readonly PluginClient[],
  selected: PluginFilterPlace | null
): PluginFilterPlace | null {
  return selected !== null && clients.some((client) =>
    client.id === selected.client && client.places.some((place) => place.scope === selected.scope)
  )
    ? selected
    : null
}

/** The size of a place's full set, or unknown when its agent could not be read. */
export function pluginPlaceCount(
  rows: readonly PluginRow[],
  client: PluginClient,
  scope: AssetScope
): number | null {
  return client.error === undefined
    ? rowsForTab(rows, "place", { scope, client: client.id }).length
    : null
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
 * @param place — the agent and scope selected in the place menu.
 * @returns the rows the tab shows.
 */
export function rowsForTab(
  rows: readonly PluginRow[],
  value: PluginTab,
  place: PluginFilterPlace | null = null
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
    case "place":
      return place === null
        ? []
        : rows.filter((row) => row.held.some(
          (hold) => hold.client === place.client && hold.places.some((one) => one.group === place.scope)
        ))
  }
}
