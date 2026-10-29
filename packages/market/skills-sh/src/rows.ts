/**
 * The market's derived rows: matching a source to what the library holds, the
 * eight-point sparkline, and the in-memory file tree. None of this touches the
 * network or the disk.
 */
import type { Skill, SkillFileEntry, SkillStore } from "@context-hub/skills"

import type {
  MarketFile,
  MarketRankPage,
  MarketRankRow,
  MarketSearchRow,
} from "./apis/types.ts"

/** The part of the skills page's library a market row needs. */
export interface MarketLibrary {
  store: SkillStore | null
  rows: Skill[]
  reload(): Promise<void>
  update(id: string): Promise<void>
}

/** A row either ranking or search can open. */
export interface MarketRow {
  source: string
  skillId: string
  name: string
  installs: number
  weeklyInstalls?: number[]
  isOfficial?: boolean
}

/** Normalize the forms a recorded source can take before comparing two. */
export function normalizeSource(source: string): string {
  const trimmed = source.trim().replace(/\/+$/, "").replace(/\.git$/i, "")
  const github = /^(?:https?:\/\/)?(?:www\.)?github\.com\/(.+)$/i.exec(trimmed)
  return (github?.[1] ?? trimmed).toLowerCase()
}

/** Whether two source spellings name the same package. */
export function sameSource(left: string, right: string): boolean {
  return normalizeSource(left) !== "" && normalizeSource(left) === normalizeSource(right)
}

/** The library row that is this market skill, if the library holds it. */
export function installedRow(
  rows: readonly Skill[],
  source: string,
  skillId: string
): Skill | undefined {
  return rows.find(
    (row) =>
      row.name.toLowerCase() === skillId.toLowerCase() &&
      row.upstream !== undefined &&
      sameSource(row.upstream.source, source)
  )
}

/**
 * Whether the library holds a different skill under this name. The installer
 * refuses to replace a directory, so this is a block, not an override.
 */
export function nameConflict(
  rows: readonly Skill[],
  source: string,
  skillId: string
): boolean {
  return rows.some(
    (row) =>
      row.name.toLowerCase() === skillId.toLowerCase() &&
      (row.upstream === undefined || !sameSource(row.upstream.source, source))
  )
}

/**
 * The ranking after a background refresh of its first page. Pages the person
 * already loaded stay where they are — a refresh must not page them back to
 * the top — and rows the fresh first page repeats are dropped so the table
 * never shows one skill twice.
 */
export function refreshedRank(
  current: MarketRankPage | null,
  page: MarketRankPage
): MarketRankPage {
  if (current === null || current.view !== page.view || current.page === 0) return page
  const fresh = new Set(page.rows.map((row) => `${row.source}/${row.skillId}`))
  const kept = current.rows
    .slice(page.rows.length)
    .filter((row) => !fresh.has(`${row.source}/${row.skillId}`))
  if (kept.length === 0) return page
  return { ...page, page: current.page, hasMore: current.hasMore, rows: [...page.rows, ...kept] }
}

/** The ranking row as the detail dialog reads it. */
export function rowOfRank(row: MarketRankRow): MarketRow {
  return row
}

/** The search row as the detail dialog reads it; search has no weekly points. */
export function rowOfSearch(row: MarketSearchRow): MarketRow {
  return {
    source: row.source,
    skillId: row.skillId,
    name: row.name,
    installs: row.installs,
  }
}

/**
 * The eight points of a sparkline as `x,y` pairs, or `null` when there is
 * nothing to draw. A flat series becomes a centered line rather than dividing
 * by zero.
 */
export function sparkPoints(
  values: readonly number[] | undefined,
  width: number,
  height: number
): string | null {
  if (values === undefined || values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const step = (width - 8) / (values.length - 1)
  return values
    .map((value, index) => {
      const x = 4 + index * step
      const y = span === 0 ? height / 2 : height - 4 - ((value - min) / span) * (height - 8)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
}

/**
 * Turn the preview endpoint's flat files into the entries the shared tree
 * reads. Directories are added for every parent, bytes are the text length.
 */
export function treeFromFiles(files: readonly MarketFile[]): SkillFileEntry[] {
  const entries = new Map<string, SkillFileEntry>()
  const add = (path: string, directory: boolean, bytes: number) => {
    const cut = path.lastIndexOf("/")
    const depth = cut < 0 ? 0 : path.split("/").length - 1
    const current = entries.get(path)
    if (current !== undefined) {
      if (!directory) entries.set(path, { ...current, directory: false, bytes })
      return
    }
    entries.set(path, { path, depth, directory, bytes })
  }

  for (const file of files) {
    const segments = file.path.split("/")
    for (let index = 1; index < segments.length; index += 1) {
      add(segments.slice(0, index).join("/"), true, 0)
    }
    add(file.path, false, file.contents.length)
  }

  return [...entries.values()].sort((left, right) => {
    const leftDepth = left.path.split("/").length - 1
    const rightDepth = right.path.split("/").length - 1
    if (leftDepth !== rightDepth) return leftDepth - rightDepth
    if (left.directory !== right.directory) return left.directory ? 1 : -1
    return left.path.localeCompare(right.path)
  })
}

/** The SKILL.md in a preview, preferring the root file over a nested one. */
export function skillFile(files: readonly MarketFile[]): MarketFile | undefined {
  const named = files.filter((file) => file.path.split("/").at(-1)?.toLowerCase() === "skill.md")
  return named.sort((left, right) => left.path.split("/").length - right.path.split("/").length)[0]
}
