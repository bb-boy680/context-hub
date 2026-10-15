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
  | { kind: "url"; url: string; ref?: string; revision: string }
  /**
   * One directory of a git repository, which is how a monorepo ships a pack.
   * `path` is where the pack sits inside the repository, so two packs from one
   * repository are told apart by it.
   */
  | { kind: "git-subdir"; url: string; path: string; ref?: string; revision: string }
  /**
   * A zip or tarball fetched over HTTP. `revision` is the validator the server
   * published for it — an `ETag`, or a `Last-Modified` — which is the only thing
   * a later check can compare; a server that publishes none leaves it absent.
   */
  | { kind: "archive"; url: string; revision?: string }
  /**
   * A directory on this machine: one the hub copied in, or — for a pack the hub
   * never collected — the directory an agent reads it from. Nothing about a
   * directory here answers "what does the source hold now", so none of the three
   * asks a check; `path` is where it sat, and for a pack a person dropped in
   * from a browser it is a label rather than a location.
   */
  | { kind: "local"; path: string }

/** Every kind an origin can take, for checks and for what an installer accepts. */
export const ORIGIN_KINDS = ["url", "git-subdir", "archive", "local"] as const

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
/**
 * Where an agent can be told to keep a pack.
 *
 * Two, not three. Claude Code also names its `local` scope, which is the same
 * repository as `project` but written to a file the person does not share — and
 * this hub has no way to read or write that file, so an install aimed at it
 * would be one nothing here could report on afterwards.
 */
export type PluginInstallScope = "user" | "project"

/**
 * What a pack says about itself in its own directory.
 *
 * This is what reading a directory answers, whether or not this hub collected
 * the pack: an agent's own list names a pack and the folder it sits in, and the
 * pack's manifest is where its description and its picture are written down.
 * The fields are the record's own, so a pack an agent holds reads the same shape
 * as one the library holds — which is what makes the two mergeable.
 */
export interface PackDescription {
  /** The pack's own name from its manifest; empty when the manifest gives none. */
  name: string
  version: string
  description: string
  /**
   * The pack's own picture, as a reference into the hub's asset library.
   *
   * A picture is kept where the hub keeps its files — `<home>/assets/<pack>/` —
   * whether or not the pack itself has been collected, so a row never points
   * into an agent's install directory: that path stops resolving the moment the
   * agent removes the pack. What a row draws is this reference, read back from
   * the library like any other asset.
   */
  icon?: string
}

/**
 * One thing a pack ships that a list shows by its name and its own sentence: a
 * skill, or a command.
 *
 * A pack is the only thing that knows what is inside it — none of this is
 * recorded, and none of it can be derived from the manifest — so both fields are
 * read from the item's own file.
 */
export interface PackContentItem {
  /** What it is called: the name its frontmatter gives, else the directory or file it sits in. */
  title: string
  /** What it says about itself; empty when it says nothing, which reads as a line without one. */
  description: string
}

/**
 * What a pack carries beside its manifest, which is what the detail dialog's
 * tabs are built from: an empty list is what says a tab is not offered at all.
 */
export interface PackContents {
  /** One entry per skill the pack ships, in title order. */
  skills: PackContentItem[]
  /** One entry per command file the pack ships, in title order. */
  commands: PackContentItem[]
  /** The `.mcp.json` at the pack's root as written, or null when it carries none. */
  mcp: string | null
}

/** A pack carrying none of the three — also what a scan that could not read the pack answers. */
export const NO_CONTENTS: PackContents = { skills: [], commands: [], mcp: null }

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
  if (origin.kind === "local") return null
  return origin.revision ?? null
}

/**
 * Whether a source can be asked about at all.
 *
 * A `git-subdir` pack is left out on purpose rather than by omission: the
 * revision it records is the repository's, and what a check would have to ask
 * about is the subdirectory's own last commit. Asking the repository instead
 * would report an update every time somebody touched an unrelated directory, so
 * this build says it cannot answer rather than answering wrongly.
 */
export function hasUpstream(origin: PluginOrigin): boolean {
  return origin.kind === "url" || origin.kind === "archive"
}

/** The directory under a hub home that holds collected plugin packs. */
export const PLUGIN_LIBRARY_DIR = "plugins"

/**
 * The files a pack may name itself in, most specific first.
 *
 * A pack carries whichever one its own agent's convention asks for — Claude Code
 * reads the first, a pack from before that convention reads the second, and a
 * pack built for Codex reads the third — so a pack is a directory carrying any
 * of them. Which one that is also answers "is this directory a pack at all",
 * which is the question a folder full of repositories is scanned with.
 */
export const PLUGIN_MANIFESTS = [
  ".claude-plugin/plugin.json",
  "plugin.json",
  ".codex-plugin/plugin.json",
]

/** The index inside the library root: one row per collected pack. */
export const PLUGIN_INDEX_FILE = "plugins.json"

/** Where the marketplace index a library root carries lives, so the directory can be added as a marketplace. */
export const PLUGIN_MARKETPLACE_DIR = ".claude-plugin"

/** File name of that index. */
export const PLUGIN_MARKETPLACE_FILE = "marketplace.json"

/** The marketplace name a hub library presents itself under. */
export const PLUGIN_MARKETPLACE_NAME = "context-hub"
