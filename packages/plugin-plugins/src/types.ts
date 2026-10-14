/**
 * One plugin as the page draws it: the fields the two views, the filter bar and
 * the lightbox are built around. A row is a library record read for the screen —
 * the same pack, with its age and its source already worded — or a pack only an
 * agent holds, which the library has yet to take in.
 */
import type { ExtensionIcon } from "@workspace/extensions"

export type PluginSource = "git" | "archive" | "local"

/** One agent holding a pack, as a row names it. */
export interface PluginHeldBy {
  /** The agent's id, which its installer is registered under. */
  client: string
  /** The agent's own name, as the row shows it. */
  label: string
  /** The mark the agent's own extension declares. */
  icon: ExtensionIcon
  /** The scopes it is in there, in the agent's own words. */
  scopes: readonly string[]
}

export interface PluginRow {
  /** Stable identity, which the selection and the row keys travel in. */
  id: string
  /** The pack's own name, which is also the directory it lives in. */
  name: string
  version: string
  description: string
  /** The categories the filter bar narrows by; a row may carry several. */
  tags: string[]
  /** Where the pack came from. Absent for a pack only an agent holds: the hub took this one from nowhere itself. */
  source?: PluginSource
  /** How long ago it last moved, already worded for the locale it prints in. */
  updated: string
  /** The pack's own mark, as a URL the row draws beside its name. */
  icon?: string
  /** A picture to show the pack by, as a URL: the first picture the hub holds for it. */
  cover?: string
  /** The last check found the source ahead of this copy. */
  outdated?: boolean
  /** These files differ from the revision they were collected at. */
  modified?: boolean
  /** Whether this pack's source can be asked about at all. */
  hasSource?: boolean
  /** When the source was last asked, empty when it never was. */
  checkedAt?: string
  /** Whether the library holds the pack's files. A row an agent holds alone carries false, and adopting it is what that row offers. */
  stored: boolean
  /** The agents holding the pack, in the order they were read; empty while none does. */
  held: readonly PluginHeldBy[]
}

/** One entry of a pack's directory listing, as the files panel reads it. */
export interface PluginFileEntry {
  /** The path inside the pack, `/`-separated. */
  path: string
  directory: boolean
  /** The file's text; a directory has none. */
  text?: string
}
