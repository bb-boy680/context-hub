/**
 * Browsing the machine's folders: the contract a form and the process that owns
 * the disk share. A browser is told nothing about the folders it cannot reach,
 * so a form that offers a folder tree asks the host one level at a time — the
 * host lists, the form renders, and the person walks down from anywhere.
 *
 * Only folders are listed: every entry can be entered, which is all a picker
 * needs. A link is reported as one, never followed into the listing, so a
 * person sees what is a link and where it leads.
 */

/** Route a form serves folder listings on. */
export const FS_ROUTE = "/hub/fs"

/**
 * One folder inside a listed directory.
 * A link that does not resolve to a folder is left out: it cannot be entered.
 */
export interface BrowseEntry {
  /** The entry's own name, which is its last path segment. */
  name: string
  /** The folder itself, absolute, so a form can ask for it without joining paths. */
  path: string
  /** Where a link points, as it was recorded; absent for a real folder. */
  link?: string
}

/** One step of the path a person walked, for the trail above a listing. */
export interface BrowseCrumb {
  /** The segment as it reads, `~` for the person's home. */
  name: string
  /** The directory this step names, absolute. */
  path: string
}

/** One directory level, described for a folder tree. */
export interface DirectoryListing {
  /** The listed directory, absolute, so a form can ask for it again. */
  path: string
  /** The same path as a person reads it, e.g. `~/work`. */
  display: string
  /** The directory above this one; `null` at a filesystem root. */
  parent: string | null
  /** The path from the person's home (or the filesystem root) down to here. */
  crumbs: BrowseCrumb[]
  entries: BrowseEntry[]
  /** True when the host stopped at its entry cap rather than at the end. */
  truncated: boolean
}
