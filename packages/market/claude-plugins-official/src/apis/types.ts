/**
 * The marketplace index as Claude Code writes it. Every field is read
 * defensively: the index is somebody else's JSON, so a shape this build does
 * not know is a skipped row rather than a broken page.
 */

/** One entry the index may list. */
export interface RawClaudePlugin {
  name?: unknown
  description?: unknown
  author?: unknown
  category?: unknown
  homepage?: unknown
  source?: unknown
}

/** The whole index; `plugins` must be a list for the source to be readable. */
export interface RawClaudeMarketplace {
  plugins?: unknown
}
