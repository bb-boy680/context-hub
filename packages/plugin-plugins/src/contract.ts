/**
 * What a collected plugin is, and what it takes to keep it in step with where
 * it came from. A plugin pack is a whole directory of files — one per coding
 * agent's own layout — so none of this describes what is inside one; that is
 * read from the pack's own manifests when a page needs it.
 *
 * The library keeps one record per pack. The record carries where the pack came
 * from (`origin`), the revision this hub collected (`installedRevision`), and the
 * directory hash of the files as they landed. Everything a person is shown about
 * "is this current?" is derived from those three by the helpers in
 * `./revision.ts` — never stored, so a record cannot contradict itself.
 *
 * This module imports nothing and runs on both sides of the wire.
 */

/** How a plugin pack was obtained, which is also how it is asked about later. */
export type PluginOrigin =
  /** A git repository, at one revision. `ref` is the branch or tag the person named. */
  | { kind: "git"; url: string; ref?: string; revision: string }
  /** A zip or tarball fetched over HTTP; `etag` is the validator the server gave, when it gave one. */
  | { kind: "archive"; url: string; etag?: string }
  /** A directory on this machine. Where it came from is not a question this hub can answer. */
  | { kind: "path"; path: string }

/** Every kind an origin can take, for checks and for what an installer accepts. */
export const ORIGIN_KINDS = ["git", "archive", "path"] as const

/** Where one pack came from, and the state of the copy that landed here. */
export interface PluginUpstream {
  origin: PluginOrigin
  /**
   * Directory hash of the files as this hub collected them, taken with the same
   * algorithm as the skills library's. It is the only thing that answers
   * "have these files been edited since", which nothing upstream knows.
   */
  hash: string
}

/**
 * One check's answer, kept on the record: what the source held when it was
 * asked, and what the files here held at that same moment. Both are a record of
 * that check, not a claim about now, which is why the time travels with them.
 */
export interface PluginCheck {
  /** When the source was asked. */
  at: string
  /** The revision the source held as of then. Absent when the source cannot be asked. */
  latest?: string
  /** The directory hash of the local files as of then. */
  currentHash: string
}

/** The scopes a plugin can be installed into, named the way the agents name them. */
export type PluginInstallScope = "user" | "project" | "local"

/** What one install changed, as the person is told it. */
export interface PluginInstallReport {
  /** One line naming what happened, already worded for the locale it prints in. */
  message: string
  /** Where it landed, for a report that wants to show it. */
  location?: string
  /** What the client itself printed, when it printed anything worth keeping. */
  output?: string
}

/**
 * Read one origin as the revision string a check compares. A source that cannot
 * be asked returns null and is never reported as having moved.
 */
export function installedRevision(origin: PluginOrigin): string | null {
  switch (origin.kind) {
    case "git":
      return origin.revision
    case "archive":
      return origin.etag ?? null
    case "path":
      return null
  }
}

/** Whether a source can be asked about at all. */
export function hasUpstream(origin: PluginOrigin): boolean {
  return origin.kind !== "path"
}

/** The directory under a hub home that holds collected plugin packs. */
export const PLUGIN_LIBRARY_DIR = "plugins"

/** The index inside the library root: one row per collected pack. */
export const PLUGIN_INDEX_FILE = "plugins.json"

/** Where the marketplace index a library root carries lives, so the directory can be added as a marketplace. */
export const PLUGIN_MARKETPLACE_DIR = ".claude-plugin"

/** File name of that index. */
export const PLUGIN_MARKETPLACE_FILE = "marketplace.json"

/** The marketplace name a hub library presents itself under. */
export const PLUGIN_MARKETPLACE_NAME = "context-hub"
