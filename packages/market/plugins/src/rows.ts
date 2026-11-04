/**
 * The market's derived rows: merging the sources, narrowing them, grouping
 * them, and answering whether the library already holds one. None of this
 * touches the network or the disk.
 */
import {
  sourceMatches,
  type PackContents,
  type PluginRecord,
} from "@context-hub/plugins"

import { normalizeCategory, type MarketEntry, type MarketSource } from "./contract.ts"

/** One entry with the source it came from. */
export interface MarketRow {
  entry: MarketEntry
  source: MarketSource
}

/** What one source read produced, as the page holds it. */
export interface SourceEntries {
  source: MarketSource
  entries: readonly MarketEntry[]
}

/** One category's rows, in the order the page draws them. */
export interface MarketGroup {
  id: string
  label: string
  rows: MarketRow[]
}

/**
 * Every source's entries as one list, in source order.
 *
 * Entries are keyed by id, which already carries the source, so the same pack
 * listed twice by one index is drawn once.
 */
export function rowsOf(sources: readonly SourceEntries[]): MarketRow[] {
  const seen = new Set<string>()
  const rows: MarketRow[] = []
  for (const { source, entries } of sources) {
    for (const entry of entries) {
      if (seen.has(entry.id)) continue
      seen.add(entry.id)
      rows.push({ entry, source })
    }
  }
  return rows
}

/** Whether one row answers the query; an empty query answers everything. */
function matches(row: MarketRow, needle: string): boolean {
  if (needle === "") return true
  const { entry } = row
  return [entry.name, entry.description, entry.author, entry.category].some(
    (value) => value !== undefined && value.toLowerCase().includes(needle)
  )
}

/**
 * The rows on screen after a source is chosen and a query is typed.
 *
 * The source narrows first: a search never reaches outside the source the
 * person is looking at.
 */
export function visibleRows(
  rows: readonly MarketRow[],
  sourceId: string | null,
  query: string
): MarketRow[] {
  const needle = query.trim().toLowerCase()
  return rows.filter(
    (row) => (sourceId === null || row.source.id === sourceId) && matches(row, needle)
  )
}

/**
 * Rows grouped by normalized category, named through `label`.
 *
 * Groups read in display-name order, with `other` last because it is a place
 * for what neither source categorised rather than a category of its own.
 */
export function groupedRows(
  rows: readonly MarketRow[],
  label: (categoryId: string) => string
): MarketGroup[] {
  const held = new Map<string, MarketRow[]>()
  for (const row of rows) {
    const id = normalizeCategory(row.entry.category)
    const group = held.get(id)
    if (group === undefined) held.set(id, [row])
    else group.push(row)
  }
  return [...held.entries()]
    .map(([id, groupRows]) => ({
      id,
      label: label(id),
      rows: groupRows.sort((left, right) => left.entry.name.localeCompare(right.entry.name)),
    }))
    .sort((left, right) => {
      if (left.id === "other") return 1
      if (right.id === "other") return -1
      return left.label.localeCompare(right.label)
    })
}

/** A repository address without its scheme, which is how a dialog reads it. */
export function repoLabel(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\.git$/, "")
}

/** The pack's directory inside its repository, when it is one of several. */
export function installPath(row: MarketRow): string | undefined {
  return row.entry.install.kind === "git-subdir" ? row.entry.install.path : undefined
}

/** The commit the index pinned, when it published one. */
export function installCommit(row: MarketRow): string | undefined {
  return row.entry.install.sha
}

/** The tabs a market entry's detail can show, in the order it reads them. */
export type DetailTab = "content" | "skills" | "commands" | "mcp"

/**
 * The tabs one previewed entry offers.
 *
 * Content is always there — it is the index's own sentence and the pack's
 * README. The other three only exist when the pack was read and turned out to
 * carry something: a tab whose whole content is "none" is not a tab, and a
 * preview still loading has read nothing yet.
 */
export function offeredTabs(contents: PackContents | null): DetailTab[] {
  const tabs: DetailTab[] = ["content"]
  if (contents === null) return tabs
  if (contents.skills.length > 0) tabs.push("skills")
  if (contents.commands.length > 0) tabs.push("commands")
  if (contents.mcp !== null && contents.mcp.trim() !== "") tabs.push("mcp")
  return tabs
}

/**
 * The library record that is this market entry, if the library holds it.
 *
 * The name is not enough: two markets list packs under the same name, so the
 * address they came from is what tells them apart.
 */
export function installedRecord(
  records: readonly PluginRecord[],
  entry: MarketEntry
): PluginRecord | undefined {
  return records.find(
    (record) => record.name === entry.name && sourceMatches(entry.install, record.source)
  )
}
