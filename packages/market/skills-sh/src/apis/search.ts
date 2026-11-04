import type { NetPort } from "@context-hub/extensions"

import { finite, record, requestJson, text } from "./http.ts"
import type { MarketSearchPage, MarketSearchRow } from "./types.ts"
import { MARKET_ORIGIN } from "./urls.ts"

/** One search; the API caps the answer at 200 rows and has no offset. */
export async function readSearch(net: NetPort, query: string): Promise<MarketSearchPage> {
  const q = query.trim()
  if (q.length < 2) throw new Error("search needs at least two characters")
  const data = await requestJson(
    net,
    `${MARKET_ORIGIN}/api/search?q=${encodeURIComponent(q)}&limit=200`
  )
  if (!record(data) || !Array.isArray(data.skills)) {
    throw new Error("skills.sh search: the answer has no skills list")
  }
  const rows: MarketSearchRow[] = []
  for (const item of data.skills) {
    if (!record(item)) continue
    const source = text(item.source)
    const name = text(item.name)
    const skillId = text(item.skillId) ?? name
    if (source === null || name === null || skillId === null) continue
    const id = text(item.id) ?? `${source}/${skillId}`
    rows.push({ id, source, skillId, name, installs: finite(item.installs) ?? 0 })
  }
  return { query: q, rows, truncated: rows.length >= 200 }
}
