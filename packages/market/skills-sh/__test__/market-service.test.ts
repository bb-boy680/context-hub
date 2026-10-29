import { Context } from "@deepseek-ai/cordis"
import type { NetPort, NetResponse, StoragePort } from "@context-hub/extensions"
import { describe, expect, it } from "vitest"

import type { MarketAudit, MarketRankPage } from "../src/apis/types.ts"
import { MARKET_CACHE_DOCUMENT } from "../src/cache-document.ts"
import { SkillMarket } from "../src/service.ts"

const RANK_URL = "https://skills.sh/api/skills/all-time/0"

function fakeNet(reply: NetResponse) {
  const asked: string[] = []
  const net: NetPort = {
    async request(url) {
      asked.push(url)
      return reply
    },
  }
  return { asked, net }
}

function memoryStorage(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial))
  const storage: StoragePort = {
    read: (key) => values.get(key) ?? null,
    write: (key, value) => {
      values.set(key, value)
    },
  }
  return { storage, values }
}

function context(
  net: NetPort | null,
  storage: StoragePort = memoryStorage().storage
): Context {
  const ctx = new Context()
  ctx.provide("host", { net, storage } as never)
  return ctx
}

function rankPage(over: Partial<MarketRankPage> = {}): MarketRankPage {
  return {
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
    ...over,
  }
}

describe("SkillMarket", () => {
  it("registers the service and reuses one answer for the same key", async () => {
    const { asked, net } = fakeNet({
      status: 200,
      body: JSON.stringify({
        skills: [
          { source: "vercel-labs/skills", skillId: "find-skills", name: "find-skills", installs: 1 },
        ],
        total: 1,
        hasMore: false,
      }),
    })
    const ctx = context(net)
    const market = new SkillMarket(ctx)
    expect(market.available).toBe(true)

    const first = await market.rank("all-time", 0)
    const second = await market.rank("all-time", 0)
    expect(first.rows[0]?.name).toBe("find-skills")
    expect(second).toBe(first)
    expect(asked).toEqual([RANK_URL])
  })

  it("shares one in-flight read between concurrent callers", async () => {
    let release: () => void = () => undefined
    let started: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const entered = new Promise<void>((resolve) => {
      started = resolve
    })
    const asked: string[] = []
    const net: NetPort = {
      async request(url) {
        asked.push(url)
        started()
        await gate
        return {
          status: 200,
          body: JSON.stringify({ skills: [], total: 0, hasMore: false }),
        }
      },
    }
    const market = new SkillMarket(context(net))
    const first = market.rank("all-time", 0)
    const second = market.rank("all-time", 0)
    await entered
    release()
    await Promise.all([first, second])
    expect(asked).toEqual([RANK_URL])
  })

  it("answers the no-network form instead of throwing at construction", async () => {
    const market = new SkillMarket(context(null))
    expect(market.available).toBe(false)
    await expect(market.rank("all-time", 0)).rejects.toThrow(
      "this form cannot reach the network"
    )
  })

  it("paints a fresh ranking from disk without asking the network", async () => {
    const page = rankPage()
    const initial = {
      version: 1,
      rank: { "all-time": { at: Date.now(), page } },
      audit: {},
    }
    const { storage, values } = memoryStorage({ [MARKET_CACHE_DOCUMENT]: initial })
    const { asked, net } = fakeNet({ status: 200, body: "{}" })
    const market = new SkillMarket(context(net, storage))

    expect(market.peekRank("all-time")).toEqual(page)
    await expect(market.rank("all-time", 0)).resolves.toEqual(page)
    expect(asked).toEqual([])
    expect(values.get(MARKET_CACHE_DOCUMENT)).toBe(initial)
  })

  it("refreshes a stale ranking and stores the answer", async () => {
    const at = Date.now() - 6 * 60_000
    const { storage, values } = memoryStorage({
      [MARKET_CACHE_DOCUMENT]: {
        version: 1,
        rank: { "all-time": { at, page: rankPage() } },
        audit: {},
      },
    })
    const { asked, net } = fakeNet({
      status: 200,
      body: JSON.stringify({
        skills: [
          { source: "vercel-labs/skills", skillId: "find-skills", name: "find-skills", installs: 9 },
        ],
        total: 9,
        hasMore: false,
      }),
    })
    const market = new SkillMarket(context(net, storage))

    const page = await market.rank("all-time", 0)
    expect(asked).toEqual([RANK_URL])
    expect(page.total).toBe(9)

    const stored = values.get(MARKET_CACHE_DOCUMENT) as {
      rank: Record<string, { at: number; page: MarketRankPage }>
    }
    expect(stored.rank["all-time"]?.at).toBeGreaterThan(at)
    expect(stored.rank["all-time"]?.page.total).toBe(9)
  })

  it("leaves the stored ranking alone when the refresh fails", async () => {
    const page = rankPage()
    const at = Date.now() - 6 * 60_000
    const initial = {
      version: 1,
      rank: { "all-time": { at, page } },
      audit: {},
    }
    const { storage, values } = memoryStorage({ [MARKET_CACHE_DOCUMENT]: initial })
    const net: NetPort = {
      async request() {
        throw new Error("offline")
      },
    }
    const market = new SkillMarket(context(net, storage))

    await expect(market.rank("all-time", 0)).rejects.toThrow("offline")
    expect(values.get(MARKET_CACHE_DOCUMENT)).toEqual(initial)
    expect(market.peekRank("all-time")).toEqual(page)
  })

  it("ignores a cache document from another version", async () => {
    const { storage } = memoryStorage({
      [MARKET_CACHE_DOCUMENT]: {
        version: 2,
        rank: { "all-time": { at: Date.now(), page: rankPage() } },
        audit: {},
      },
    })
    const { asked, net } = fakeNet({
      status: 200,
      body: JSON.stringify({ skills: [], total: 0, hasMore: false }),
    })
    const market = new SkillMarket(context(net, storage))

    expect(market.peekRank("all-time")).toBeNull()
    await market.rank("all-time", 0)
    expect(asked).toEqual([RANK_URL])
  })

  it("does not show a ranking older than the fallback limit", () => {
    const at = Date.now() - 8 * 24 * 60 * 60_000
    const { storage } = memoryStorage({
      [MARKET_CACHE_DOCUMENT]: {
        version: 1,
        rank: { "all-time": { at, page: rankPage() } },
        audit: {},
      },
    })
    const market = new SkillMarket(context(null, storage))
    expect(market.peekRank("all-time")).toBeNull()
  })

  it("paints a fresh audit from disk without asking the network", async () => {
    const audit: MarketAudit = {
      id: "vercel-labs/skills/find-skills",
      source: "vercel-labs/skills",
      slug: "find-skills",
      audits: [],
    }
    const initial = {
      version: 1,
      rank: {},
      audit: {
        "vercel-labs/skills/find-skills": { at: Date.now(), audit },
      },
    }
    const { storage, values } = memoryStorage({ [MARKET_CACHE_DOCUMENT]: initial })
    const { asked, net } = fakeNet({ status: 200, body: "{}" })
    const market = new SkillMarket(context(net, storage))

    expect(market.peekAudit("vercel-labs/skills", "find-skills")).toEqual(audit)
    await expect(market.audit("vercel-labs/skills", "find-skills")).resolves.toEqual(audit)
    expect(asked).toEqual([])
    expect(values.get(MARKET_CACHE_DOCUMENT)).toBe(initial)
  })

  it("keeps a cached missing audit without asking again", async () => {
    const { storage } = memoryStorage({
      [MARKET_CACHE_DOCUMENT]: {
        version: 1,
        rank: {},
        audit: {
          "vercel-labs/skills/find-skills": { at: Date.now(), audit: null },
        },
      },
    })
    const { asked, net } = fakeNet({ status: 200, body: "{}" })
    const market = new SkillMarket(context(net, storage))

    expect(market.peekAudit("vercel-labs/skills", "find-skills")).toBeNull()
    await expect(market.audit("vercel-labs/skills", "find-skills")).resolves.toBeNull()
    expect(asked).toEqual([])
  })
})
