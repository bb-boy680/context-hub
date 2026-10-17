/**
 * The about read: which build this is, and where this machine keeps the hub's
 * files. Both are facts only the host knows, so a browser form asks for them.
 */

/** Route the about read answers on. */
export const ABOUT_ROUTE = "/hub/about"

/** What a form shows about this build and this machine. */
export interface AboutInfo {
  version: string
  /** The hub home as a person reads it, e.g. `~/.context-hub`. */
  home: string
}
