/**
 * One plugin as the page draws it: the fields the two views, the filter bar and
 * the lightbox are built around. A row is a library record read for the screen —
 * the same pack, with its age and its source already worded — or a pack only an
 * agent holds, which the library has yet to take in.
 */
import type { AssetScope } from "@workspace/core/place-files"
import type { ExtensionIcon } from "@workspace/extensions"

/**
 * Where a pack came from, in the word a row shows.
 *
 * The words are the screen's rather than the record's: a stored source says
 * `url` where a row says the repository it is, so a person reads what a pack is
 * rather than the name of a field. A pack only an agent holds is a directory on
 * this machine — the agent's own copy of it — and is worded as one.
 */
export type PluginSource = "repo" | "subdir" | "archive" | "local"

/** One place a client holds a pack in, and that place's own record of it. */
export interface PluginHeldPlace {
  /** The client's own word for the place, as its records spell it. */
  scope: string
  /**
   * The group that place belongs to, as the client declared it when it
   * registered its places. Read from that declaration rather than matched
   * against a word this hub knows, so an agent naming its scopes its own way
   * still lands in the right group.
   */
  group: AssetScope
  /** Whether the file that records this place switches the pack on there. */
  enabled: boolean
}

export interface PluginHeldBy {
  /** The agent's id, which its installer is registered under. */
  client: string
  /** The agent's own name, as the row shows it. */
  label: string
  /** The mark the agent's own extension declares. */
  icon: ExtensionIcon
  /** The places it is in there, in the agent's own words, each with its own record. */
  places: readonly PluginHeldPlace[]
  /**
   * The agent's own answer for the pack, with its whole file chain already
   * resolved into one value.
   *
   * One answer rather than one per file, which is why a place's own value is
   * read from that place's file. This is what a place whose file is silent falls
   * back to: saying nothing there means the chain decides, and this is it.
   */
  enabled: boolean
  /**
   * The agent's own id for the pack, `<name>@<marketplace>`, which is what that
   * agent's own commands take back. It names the marketplace the pack actually
   * came from, so it is the only thing that can remove a pack this hub never
   * delivered — the hub's own name would point at a copy that is not there.
   */
  id: string
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
  /** Where the pack came from. A pack only an agent holds came from a directory on this machine, because that directory is where the agent reads it. */
  source: PluginSource
  /**
   * The address the pack came from, as a person would read it back and open it:
   * a repository, a URL, or a directory on this machine. Empty when the source
   * names nothing to show.
   */
  sourceAddress: string
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
  /** How long ago the source was last asked, already worded; empty when it never was. */
  checkedAge: string
  /** Whether the library holds the pack's files. A row an agent holds alone carries false, and adopting it is what that row offers. */
  stored: boolean
  /**
   * The directory an agent reads the pack in, as that agent named it. Present
   * only for a pack no library record holds: the hub's own copy needs no path,
   * and this is where that pack's files are read from.
   */
  directory?: string
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
