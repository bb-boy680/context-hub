/**
 * The market's read service: one cache and one in-flight slot per key, shared
 * by every panel that asks for the same ranking, search, preview or audit.
 *
 * The service never writes the skill library. Installation belongs to the
 * skills module; this only turns the public skills.sh answers into values the
 * page can render and keeps the last ranking and audit on disk.
 */
import { Service, type Context } from "@deepseek-ai/cordis"

import type { NetPort, StoragePort } from "@context-hub/extensions"

import { createMarketClient, type MarketClient } from "./apis/client.ts"
import type {
  MarketAudit,
  MarketBundle,
  MarketRankPage,
  MarketSearchPage,
  MarketView,
} from "./apis/types.ts"
import {
  MARKET_CACHE_DOCUMENT,
  MARKET_CACHE_MAX_STALE,
  pruneMarketCache,
  readMarketCache,
  type MarketCacheDocument,
} from "./cache-document.ts"
import { createTtlCache } from "./cache.ts"

export const MARKET_SKILLS_SERVICE = "market.skills-sh"

const RANK_TTL = 5 * 60_000
const SEARCH_TTL = 5 * 60_000
const FILES_TTL = 30 * 60_000
const FILES_MISS_TTL = 10 * 60_000
const AUDIT_TTL = 24 * 60 * 60_000
const AUDIT_MISS_TTL = 10 * 60_000
const SUMMARY_TTL = 30 * 60_000
const SUMMARY_MISS_TTL = 10 * 60_000

/** The market's public reads, with the page's cache and single-flight. */
export class SkillMarket extends Service {
  /** False on a form without a network; the page renders the unavailable state. */
  readonly available: boolean
  private readonly client: MarketClient | null
  private readonly storage: StoragePort
  private document: MarketCacheDocument
  private readonly cache = createTtlCache<unknown>({ limit: 200 })
  private readonly pending = new Map<string, Promise<unknown>>()

  constructor(ctx: Context) {
    super(ctx, MARKET_SKILLS_SERVICE)
    const net: NetPort | null = ctx.host.net
    this.available = net !== null
    this.client = net === null ? null : createMarketClient(net)
    this.storage = ctx.host.storage
    this.document = readMarketCache(this.storage.read(MARKET_CACHE_DOCUMENT))
    this.hydrate()
  }

  /** The last ranking page for this view, even if it is old; `null` when absent. */
  peekRank(view: MarketView): MarketRankPage | null {
    const entry = this.document.rank[view]
    if (entry === undefined) return null
    if (Date.now() - entry.at > MARKET_CACHE_MAX_STALE) return null
    return entry.page
  }

  /** The last audit; `undefined` means this skill was never cached. */
  peekAudit(source: string, skill: string): MarketAudit | null | undefined {
    const entry = this.document.audit[`${source}/${skill}`]
    if (entry === undefined) return undefined
    if (Date.now() - entry.at > MARKET_CACHE_MAX_STALE) return undefined
    return entry.audit
  }

  /** One ranking page; `page` is 0-based. */
  rank(view: MarketView, page: number): Promise<MarketRankPage> {
    const key = `rank:${view}:${String(page)}`
    const cached = this.cache.get(key)
    return this.load(key, RANK_TTL, RANK_TTL, () =>
      this.read().rank(view, page)
    ).then((value) => {
      if (page === 0 && cached === undefined) this.rememberRank(view, value)
      return value
    })
  }

  /** One search; the API caps the answer at 200 rows and has no offset. */
  search(query: string): Promise<MarketSearchPage> {
    const q = query.trim()
    return this.load(`search:${q}`, SEARCH_TTL, SEARCH_TTL, () => this.read().search(q))
  }

  /** The public preview, or `null` when the source has none. */
  download(source: string, skill: string): Promise<MarketBundle | null> {
    return this.load(
      `files:${source}:${skill}`,
      FILES_TTL,
      FILES_MISS_TTL,
      () => this.read().download(source, skill)
    )
  }

  /** The generated summary as HTML, or `null` when the page has none. */
  summary(source: string, skill: string): Promise<string | null> {
    return this.load(
      `summary:${source}/${skill}`,
      SUMMARY_TTL,
      SUMMARY_MISS_TTL,
      () => this.read().summary(source, skill)
    )
  }

  /** The published audit, or `null` when there is none. */
  audit(source: string, skill: string): Promise<MarketAudit | null> {
    const key = `audit:${source}/${skill}`
    const cached = this.cache.get(key)
    return this.load(key, AUDIT_TTL, AUDIT_MISS_TTL, () =>
      this.read().audit(source, skill)
    ).then((value) => {
      if (cached === undefined) this.rememberAudit(key, value)
      return value
    })
  }

  private hydrate(): void {
    const now = Date.now()
    for (const [view, entry] of Object.entries(this.document.rank)) {
      if (entry === undefined) continue
      const age = now - entry.at
      if (age >= RANK_TTL) continue
      this.cache.set(`rank:${view}:0`, entry.page, RANK_TTL - age)
    }
    for (const [key, entry] of Object.entries(this.document.audit)) {
      const ttl = entry.audit === null ? AUDIT_MISS_TTL : AUDIT_TTL
      const age = now - entry.at
      if (age >= ttl) continue
      this.cache.set(`audit:${key}`, entry.audit, ttl - age)
    }
  }

  private rememberRank(view: MarketView, page: MarketRankPage): void {
    this.document = pruneMarketCache({
      ...this.document,
      rank: { ...this.document.rank, [view]: { at: Date.now(), page } },
    })
    this.storage.write(MARKET_CACHE_DOCUMENT, this.document)
  }

  private rememberAudit(key: string, audit: MarketAudit | null): void {
    this.document = pruneMarketCache({
      ...this.document,
      audit: { ...this.document.audit, [key]: { at: Date.now(), audit } },
    })
    this.storage.write(MARKET_CACHE_DOCUMENT, this.document)
  }

  private read(): MarketClient {
    if (this.client === null) throw new Error("this form cannot reach the network")
    return this.client
  }

  private load<T>(
    key: string,
    ttl: number,
    missTtl: number,
    read: () => Promise<T>
  ): Promise<T> {
    const hit = this.cache.get(key)
    if (hit !== undefined) return Promise.resolve(hit as T)
    const running = this.pending.get(key)
    if (running !== undefined) return running as Promise<T>
    const job = Promise.resolve()
      .then(read)
      .then((value) => {
        this.cache.set(key, value, value === null ? missTtl : ttl)
        return value
      })
      .finally(() => {
        this.pending.delete(key)
      })
    this.pending.set(key, job)
    return job
  }
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    "market.skills"?: SkillMarket
  }
}
