/** The Codex marketplace index, read defensively; see the Claude source's types. */
export interface RawCodexPlugin {
  name?: unknown
  category?: unknown
  source?: unknown
}

export interface RawCodexMarketplace {
  plugins?: unknown
}
