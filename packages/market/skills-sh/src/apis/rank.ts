import type { NetPort } from "@context-hub/extensions"

import { finite, record, requestJson, text } from "./http.ts"
import type { MarketRankPage, MarketRankRow, MarketView } from "./types.ts"
import { MARKET_ORIGIN } from "./urls.ts"

const VIEWS: readonly MarketView[] = ["all-time", "trending", "hot"]

/** One ranking page; `page` is 0-based. */
export async function readRank(
  net: NetPort,
  view: MarketView,
  page: number
): Promise<MarketRankPage> {
  if (!VIEWS.includes(view)) throw new Error(`unknown market view: ${view}`)
  if (!Number.isInteger(page) || page < 0) {
    throw new Error("market page must be a whole number")
  }
  const data = await requestJson(net, `${MARKET_ORIGIN}/api/skills/${view}/${String(page)}`)
  if (!record(data) || !Array.isArray(data.skills)) {
    throw new Error("skills.sh rank: the answer has no skills list")
  }
  const rows: MarketRankRow[] = []
  for (const item of data.skills) {
    if (!record(item)) continue
    const source = text(item.source)
    const name = text(item.name)
    const skillId = text(item.skillId) ?? name
    if (source === null || name === null || skillId === null) continue
    const installs = finite(item.installs) ?? 0
    const weekly = Array.isArray(item.weeklyInstalls)
      ? item.weeklyInstalls.filter((point): point is number => finite(point) !== null)
      : []
    rows.push({
      source,
      skillId,
      name,
      installs,
      ...(weekly.length >= 2 ? { weeklyInstalls: weekly.slice(0, 8) } : {}),
      ...(typeof item.isOfficial === "boolean" ? { isOfficial: item.isOfficial } : {}),
    })
  }
  return {
    view,
    page,
    hasMore: data.hasMore === true,
    total: finite(data.total) ?? rows.length,
    rows,
  }
}
