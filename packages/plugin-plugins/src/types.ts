/**
 * One plugin as the catalog lists it: what the two views and the filter bar
 * draw. Nothing here is read from a bundle's own files yet — the screen this
 * ships first is the interface, and these are the fields it is built around.
 */
export type PluginSource = "marketplace" | "local" | "builtin"

/** What a plugin pack carries, which is what its cover states. */
export interface PluginBundle {
  skills: number
  commands: number
}

export interface PluginRow {
  /** Stable identity, which the selection and the row keys travel in. */
  id: string
  /** The pack's own name, which is also the directory a marketplace gives it. */
  name: string
  version: string
  description: string
  /** The categories the filter bar narrows by; a row may carry several. */
  tags: string[]
  /** Where the pack came from, which the row's provenance line names. */
  source: PluginSource
  /** How long ago it last moved, already worded for the locale it prints in. */
  updated: string
  /** An image the pack ships, drawn at its own ratio; without one the cover
      falls back to what the pack bundles. */
  cover?: string
  bundle: PluginBundle
}

/** One entry of a pack's directory listing, as the files panel reads it. */
export interface PluginFileEntry {
  /** The path inside the pack, `/`-separated. */
  path: string
  directory: boolean
  /** The file's text; a directory has none. */
  text?: string
}
