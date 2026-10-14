/**
 * One plugin as the page draws it: the fields the two views, the filter bar and
 * the lightbox are built around. A row is a library record read for the screen —
 * the same pack, with its age and its source already worded.
 */

export type PluginSource = "git" | "archive" | "local"

export interface PluginRow {
  /** Stable identity, which the selection and the row keys travel in. */
  id: string
  /** The pack's own name, which is also the directory it lives in. */
  name: string
  version: string
  description: string
  /** The categories the filter bar narrows by; a row may carry several. */
  tags: string[]
  /** Where the pack came from, which the row's provenance line names. */
  source: PluginSource
  /** How long ago it last moved, already worded for the locale it prints in. */
  updated: string
  /** The first asset the hub holds for it, which is the pack's own picture when it shipped one. */
  cover?: string
  /** The last check found the source ahead of this copy. */
  outdated?: boolean
  /** These files differ from the revision they were collected at. */
  modified?: boolean
  /** Whether this pack's source can be asked about at all. */
  hasSource?: boolean
  /** When the source was last asked, empty when it never was. */
  checkedAt?: string
}

/** One entry of a pack's directory listing, as the files panel reads it. */
export interface PluginFileEntry {
  /** The path inside the pack, `/`-separated. */
  path: string
  directory: boolean
  /** The file's text; a directory has none. */
  text?: string
}
