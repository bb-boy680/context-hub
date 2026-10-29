/**
 * The market's disk cache: the last ranking page per view and the last audit
 * per skill, kept in one hub state document. A reload paints from here before
 * the network answers; a failed refresh keeps these values.
 */
import { record } from "./apis/http.ts"
import type { MarketAudit, MarketRankPage, MarketView } from "./apis/types.ts"

export const MARKET_CACHE_DOCUMENT = "market-skills-sh"
export const MARKET_CACHE_VERSION = 1

/** Oldest value still worth showing when the network cannot answer. */
export const MARKET_CACHE_MAX_STALE = 7 * 24 * 60 * 60_000

/** Most audits kept; the oldest are dropped first. */
export const MARKET_AUDIT_CACHE_LIMIT = 50

const VIEWS: readonly MarketView[] = ["all-time", "trending", "hot"]

export interface MarketRankCacheEntry {
  at: number
  page: MarketRankPage
}

export interface MarketAuditCacheEntry {
  at: number
  audit: MarketAudit | null
}

export interface MarketCacheDocument {
  version: 1
  rank: Partial<Record<MarketView, MarketRankCacheEntry>>
  audit: Record<string, MarketAuditCacheEntry>
}

export function emptyMarketCache(): MarketCacheDocument {
  return { version: MARKET_CACHE_VERSION, rank: {}, audit: {} }
}

function isView(value: unknown): value is MarketView {
  return value === "all-time" || value === "trending" || value === "hot"
}

function fresh(value: unknown, now: number): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    now - value <= MARKET_CACHE_MAX_STALE
  )
}

function rankRow(value: unknown): boolean {
  if (!record(value)) return false
  if (typeof value.source !== "string" || typeof value.skillId !== "string") return false
  if (typeof value.name !== "string" || typeof value.installs !== "number") return false
  if (value.weeklyInstalls !== undefined) {
    if (!Array.isArray(value.weeklyInstalls)) return false
    if (!value.weeklyInstalls.every((point) => typeof point === "number")) return false
  }
  return value.isOfficial === undefined || typeof value.isOfficial === "boolean"
}

function rankPage(value: unknown): value is MarketRankPage {
  if (!record(value) || !isView(value.view)) return false
  if (typeof value.page !== "number" || !Number.isInteger(value.page) || value.page < 0) {
    return false
  }
  if (typeof value.hasMore !== "boolean" || typeof value.total !== "number") return false
  return Array.isArray(value.rows) && value.rows.every(rankRow)
}

function auditValue(value: unknown): value is MarketAudit | null {
  if (value === null) return true
  if (!record(value) || !Array.isArray(value.audits)) return false
  if (
    typeof value.id !== "string" ||
    typeof value.source !== "string" ||
    typeof value.slug !== "string"
  ) {
    return false
  }
  return value.audits.every(
    (entry) =>
      record(entry) &&
      typeof entry.provider === "string" &&
      typeof entry.slug === "string" &&
      typeof entry.status === "string" &&
      typeof entry.summary === "string" &&
      typeof entry.auditedAt === "string"
  )
}

function rankEntry(value: unknown, now: number): value is MarketRankCacheEntry {
  return record(value) && fresh(value.at, now) && rankPage(value.page)
}

function auditEntry(value: unknown, now: number): value is MarketAuditCacheEntry {
  return record(value) && fresh(value.at, now) && auditValue(value.audit)
}

/** Read a stored document, dropping anything unusable or older than the limit. */
export function readMarketCache(value: unknown, now = Date.now()): MarketCacheDocument {
  if (!record(value) || value.version !== MARKET_CACHE_VERSION) return emptyMarketCache()
  const cache = emptyMarketCache()
  if (record(value.rank)) {
    for (const view of VIEWS) {
      const entry = value.rank[view]
      if (rankEntry(entry, now)) cache.rank[view] = entry
    }
  }
  if (record(value.audit)) {
    for (const [key, entry] of Object.entries(value.audit)) {
      if (auditEntry(entry, now)) cache.audit[key] = entry
    }
  }
  return pruneMarketCache(cache, now)
}

/** Keep the document small: three views, the newest audits, nothing too old. */
export function pruneMarketCache(
  cache: MarketCacheDocument,
  now = Date.now()
): MarketCacheDocument {
  const rank: Partial<Record<MarketView, MarketRankCacheEntry>> = {}
  for (const view of VIEWS) {
    const entry = cache.rank[view]
    if (entry !== undefined && now - entry.at <= MARKET_CACHE_MAX_STALE) {
      rank[view] = entry
    }
  }
  const audit = Object.entries(cache.audit)
    .filter(([, entry]) => now - entry.at <= MARKET_CACHE_MAX_STALE)
    .sort((left, right) => right[1].at - left[1].at)
    .slice(0, MARKET_AUDIT_CACHE_LIMIT)
  return {
    version: MARKET_CACHE_VERSION,
    rank,
    audit: Object.fromEntries(audit),
  }
}
