/**
 * The Claude Code market as one source: its index, cached for a while and
 * shared while it is in flight, read into the page's entries.
 */
import { createMarketCache, type MarketEntry, type MarketSource } from "@context-hub/market-plugins"
import type { NetPort } from "@context-hub/extensions"

import { createJsonReader } from "./apis/client.ts"
import {
  CLAUDE_MARKET_INDEX,
  CLAUDE_MARKET_INDEX_URL,
  CLAUDE_MARKET_REPO,
  CLAUDE_SOURCE_ID,
  ownerAvatar,
  readClaudeMarketplace,
  type MarketLog,
} from "./apis/marketplace.ts"

/** The marketplace's own name, as the rail and every row show it. */
const SOURCE_NAME = "claude-plugins-official"

/** Build the source over one form's network. */
export function createClaudePluginsSource(net: NetPort | null, log: MarketLog): MarketSource {
  const read = createJsonReader(net, "Claude Code market")
  const cache = createMarketCache<MarketEntry[]>()

  return {
    id: CLAUDE_SOURCE_ID,
    name: SOURCE_NAME,
    mark: "https://github.com/anthropics.png?size=64",
    repo: CLAUDE_MARKET_REPO.replace(/^https:\/\//, ""),
    index: CLAUDE_MARKET_INDEX,

    list: (options) =>
      cache.read(options?.refresh === true, async () =>
        readClaudeMarketplace(await read(CLAUDE_MARKET_INDEX_URL), log)
      ),

    /* The index carries the sentence; the only thing missing from a row is a
       mark, and the repository's owner is what the index suggests. */
    enrich: async (entry) => {
      const icon = ownerAvatar(entry.install.url)
      return icon === undefined ? {} : { icon }
    },
  }
}
