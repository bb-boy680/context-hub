import { describe, expect, it } from "vitest"

import type { MarketAudit } from "../src/apis/types.ts"
import {
  emptyMarketCache,
  MARKET_AUDIT_CACHE_LIMIT,
  MARKET_CACHE_MAX_STALE,
  pruneMarketCache,
  readMarketCache,
} from "../src/cache-document.ts"

const NOW = 1_000_000

const PAGE = {
  view: "all-time",
  page: 0,
  hasMore: false,
  total: 1,
  rows: [
    {
      source: "vercel-labs/skills",
      skillId: "find-skills",
      name: "find-skills",
      installs: 1,
    },
  ],
}

function audit(id: string): MarketAudit {
  return { id, source: "a/b", slug: id, audits: [] }
}

describe("readMarketCache", () => {
  it("returns an empty cache for a value this build cannot read", () => {
    expect(readMarketCache(null, NOW)).toEqual(emptyMarketCache())
    expect(readMarketCache("nope", NOW)).toEqual(emptyMarketCache())
    expect(readMarketCache({ version: 2, rank: {}, audit: {} }, NOW)).toEqual(
      emptyMarketCache()
    )
  })

  it("keeps valid entries and drops the rest", () => {
    const cache = readMarketCache(
      {
        version: 1,
        rank: {
          "all-time": { at: NOW, page: PAGE },
          trending: {
            at: NOW,
            page: { ...PAGE, view: "trending", rows: [{ source: "a/b", installs: "no" }] },
          },
        },
        audit: {
          "a/b/find-skills": { at: NOW, audit: null },
          "a/b/broken": { at: NOW, audit: { id: 1 } },
        },
      },
      NOW
    )

    expect(cache.rank["all-time"]?.page).toEqual(PAGE)
    expect(cache.rank.trending).toBeUndefined()
    expect(cache.audit["a/b/find-skills"]?.audit).toBeNull()
    expect(cache.audit["a/b/broken"]).toBeUndefined()
  })

  it("drops entries older than the fallback limit", () => {
    const cache = readMarketCache(
      {
        version: 1,
        rank: {
          "all-time": {
            at: NOW - MARKET_CACHE_MAX_STALE - 1,
            page: PAGE,
          },
        },
        audit: {
          "a/b/find-skills": {
            at: NOW - MARKET_CACHE_MAX_STALE - 1,
            audit: audit("find-skills"),
          },
        },
      },
      NOW
    )

    expect(cache.rank["all-time"]).toBeUndefined()
    expect(cache.audit["a/b/find-skills"]).toBeUndefined()
  })
})

describe("pruneMarketCache", () => {
  it("keeps only the newest audits", () => {
    const cache = emptyMarketCache()
    for (let index = 0; index < MARKET_AUDIT_CACHE_LIMIT + 1; index += 1) {
      cache.audit[`a/b/skill-${String(index)}`] = {
        at: NOW + index,
        audit: audit(`skill-${String(index)}`),
      }
    }

    const pruned = pruneMarketCache(cache, NOW + MARKET_AUDIT_CACHE_LIMIT + 1)
    expect(Object.keys(pruned.audit)).toHaveLength(MARKET_AUDIT_CACHE_LIMIT)
    expect(pruned.audit["a/b/skill-0"]).toBeUndefined()
    expect(pruned.audit[`a/b/skill-${String(MARKET_AUDIT_CACHE_LIMIT)}`]).toBeDefined()
  })
})
