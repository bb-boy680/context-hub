/**
 * The Codex market as one source: its index, cached for a while and shared
 * while it is in flight, read into the page's entries.
 */
import { createMarketCache, type MarketEntry, type MarketSource } from "@context-hub/market-plugins"
import type { NetPort } from "@context-hub/extensions"

import { createJsonReader } from "./apis/client.ts"
import {
  manifestUrl,
  readCodexManifest,
  resolveLogo,
} from "./apis/manifest.ts"
import {
  CODEX_MARKET_INDEX,
  CODEX_MARKET_INDEX_URL,
  CODEX_MARKET_REPO,
  CODEX_SOURCE_ID,
  readCodexMarketplace,
  type MarketLog,
} from "./apis/marketplace.ts"

/** The marketplace's own name, as the extension, the rail and every row show it. */
export const SOURCE_NAME = "openai"

/** The owner's mark, shipped with the package and shared by the extension and the rail. */
export const SOURCE_MARK = new URL("../assets/openai.png", import.meta.url).href

/** Build the source over one form's network. */
export function createCodexPluginsSource(net: NetPort | null, log: MarketLog): MarketSource {
  const read = createJsonReader(net, "Codex market")
  const cache = createMarketCache<MarketEntry[]>()

  return {
    id: CODEX_SOURCE_ID,
    name: SOURCE_NAME,
    mark: SOURCE_MARK,
    repo: CODEX_MARKET_REPO.replace(/^https:\/\//, ""),
    index: CODEX_MARKET_INDEX,

    list: (options) =>
      cache.read(options?.refresh === true, async () =>
        readCodexMarketplace(await read(CODEX_MARKET_INDEX_URL), log)
      ),

    /* The index carries neither a sentence nor a mark, so a visible row asks
       its pack's own manifest. A pack whose manifest cannot be read keeps the
       category mark and says the source has no description. */
    enrich: async (entry) => {
      const url = manifestUrl(entry.install)
      if (url === undefined) return {}
      try {
        const manifest = readCodexManifest(await read(url))
        const icon =
          manifest.logo === undefined
            ? undefined
            : resolveLogo(entry.install, manifest.logo)
        return {
          ...(manifest.description === undefined
            ? {}
            : { description: manifest.description }),
          ...(icon === undefined ? {} : { icon }),
        }
      } catch {
        return {}
      }
    },
  }
}
