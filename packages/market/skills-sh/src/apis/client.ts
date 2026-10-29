/**
 * The six skills.sh reads as one facade. Each endpoint lives in its own file
 * under `apis/`; this only wires them to the form's network.
 */
import type { NetPort } from "@context-hub/extensions"

import { readAudit } from "./audit.ts"
import { readDownload } from "./download.ts"
import { readRank } from "./rank.ts"
import { readSearch } from "./search.ts"
import { readSummary } from "./summary.ts"
import type {
  MarketAudit,
  MarketBundle,
  MarketRankPage,
  MarketSearchPage,
  MarketView,
} from "./types.ts"

/** The six reads the market page needs. */
export interface MarketClient {
  rank(view: MarketView, page: number): Promise<MarketRankPage>
  search(query: string): Promise<MarketSearchPage>
  /** `null` means this source has no public file preview (a 404). */
  download(source: string, skill: string): Promise<MarketBundle | null>
  /** `null` means no audit has been published for this skill. */
  audit(source: string, skill: string): Promise<MarketAudit | null>
  /** `null` means the skill's page carries no summary. */
  summary(source: string, skill: string): Promise<string | null>
}

/**
 * Build the reads over one network port.
 *
 * @param net — the form's network, or `null` on a form without one.
 */
export function createMarketClient(net: NetPort): MarketClient {
  return {
    rank: (view, page) => readRank(net, view, page),
    search: (query) => readSearch(net, query),
    download: (source, skill) => readDownload(net, source, skill),
    audit: (source, skill) => readAudit(net, source, skill),
    summary: (source, skill) => readSummary(net, source, skill),
  }
}
