/**
 * What a market page reads, and what a market source contributes.
 *
 * A source is an extension, not a table in this package: each one adapts its
 * own index to one {@link MarketEntry} shape, and registering it is what puts
 * its rows on the page. Disabling the extension takes the source and its rows
 * away; the packs already in the library stay where they are.
 *
 * The registry is a `Service` so the page can find it by name, and `register`
 * is a prototype method on purpose: the caller's context is what owns the
 * registration, so the source is unregistered when its extension unloads.
 */
import { Service } from "@deepseek-ai/cordis"
import type { Context } from "@deepseek-ai/cordis"

import type { MarketInstallSource } from "@context-hub/plugins/market-install"

/** The name the page finds the registry under. */
export const MARKET_SOURCE_SERVICE = "marketSources"

/** One pack a source lists, as the page works with it. */
export interface MarketEntry {
  /** `${sourceId}:${name}`, the page's key and the enrichment cache's key. */
  id: string
  /** The name the index gives it; the name it installs under comes from the pack itself. */
  name: string
  description?: string
  author?: string
  /** The index's own category; the page groups by {@link normalizeCategory}. */
  category?: string
  homepage?: string
  sourceId: string
  install: MarketInstallSource
}

/** One index this hub can list, and the two things a row needs from it. */
export interface MarketSource {
  /** Stable id; it names the source's rows and is shown beside them. */
  id: string
  /** The marketplace's own name, which is what the rail and a row show. */
  name: string
  /** The marketplace owner's mark, shown beside its name in the rail. */
  mark?: string
  /** The repository address, as the detail dialog shows it. */
  repo: string
  /** The index's path inside that repository. */
  index: string
  /** Every entry the index lists, read through a cache. */
  list(options?: { refresh?: boolean }): Promise<MarketEntry[]>
  /**
   * What one visible row needs beyond the index: its mark, and a sentence when
   * the index carries none. `undefined` leaves the page its category mark.
   */
  enrich?(entry: MarketEntry): Promise<{ icon?: string; description?: string }>
}

/** Every source registered right now, and a way to hear that the list changed. */
export class MarketSourceRegistry extends Service {
  private readonly held: MarketSource[] = []
  private readonly listeners = new Set<() => void>()
  /**
   * The same sources as an array that changes only when they do.
   *
   * A React subscriber compares snapshots by identity, so a fresh copy on
   * every call would read as a change on every render.
   */
  private snapshot: readonly MarketSource[] = []

  constructor(ctx: Context) {
    super(ctx, MARKET_SOURCE_SERVICE)
  }

  /** Add a source for as long as the extension that registered it stays enabled. */
  register(source: MarketSource): () => void {
    this.held.push(source)
    this.snapshot = [...this.held]
    this.announce()
    return this.ctx.effect(() => () => {
      const at = this.held.indexOf(source)
      if (at < 0) return
      this.held.splice(at, 1)
      this.snapshot = [...this.held]
      this.announce()
    })
  }

  sources(): readonly MarketSource[] {
    return this.snapshot
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private announce(): void {
    for (const listener of [...this.listeners]) listener()
  }
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    /** The market page's source registry; absent until its extension applies. */
    marketSources?: MarketSourceRegistry
  }
}

/** One category id to the words a person knows it by. */
const CATEGORY_IDS: Readonly<Record<string, string>> = {
  development: "development",
  "developer tools": "development",
  design: "design",
  creativity: "design",
  productivity: "productivity",
  communication: "communication",
  security: "security",
  database: "database",
  monitoring: "monitoring",
  deployment: "deployment",
  learning: "learning",
  automation: "automation",
  testing: "testing",
  math: "math",
  location: "location",
  migration: "migration",
  "education & research": "education",
  "data & analytics": "data",
  finance: "finance",
  "scientific research": "research",
  "business & operations": "business",
  other: "other",
}

/**
 * One index's category as this page groups it.
 *
 * Two sources spell the same idea two ways — `development` and
 * `Developer Tools` — so the grouping is decided here rather than by either
 * index. An absent or unknown category is `other`, which is a real group (with
 * a real icon), not a refusal.
 */
export function normalizeCategory(category: string | undefined): string {
  const key = (category ?? "").trim().toLowerCase()
  return CATEGORY_IDS[key] ?? "other"
}
