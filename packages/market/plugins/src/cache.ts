/**
 * One index read, cached for a while and shared while it is in flight.
 *
 * A source has one index, so this holds one value: the page may ask once per
 * render pass and a refresh asks again, but only one request is ever on the
 * wire at a time. A miss read while another is running joins that one rather
 * than starting a second.
 */
export interface MarketCache<T> {
  /** The cached read, or a fresh one when `refresh` is set or the entry has aged out. */
  read(refresh: boolean, load: () => Promise<T>): Promise<T>
  /** Drop what was cached; a later read asks the source. */
  clear(): void
}

export interface MarketCacheOptions {
  ttl?: number
  now?: () => number
}

/** Ten minutes, which is long enough that paging around costs one request. */
const DEFAULT_TTL = 10 * 60_000

export function createMarketCache<T>({
  ttl = DEFAULT_TTL,
  now = Date.now,
}: MarketCacheOptions = {}): MarketCache<T> {
  let cached: { at: number; value: T } | null = null
  let pending: Promise<T> | null = null

  return {
    read(refresh, load) {
      if (!refresh && cached !== null && now() - cached.at < ttl) {
        return Promise.resolve(cached.value)
      }
      if (pending !== null) return pending
      pending = Promise.resolve()
        .then(load)
        .then((value) => {
          cached = { at: now(), value }
          return value
        })
        .finally(() => {
          pending = null
        })
      return pending
    },

    clear() {
      cached = null
    },
  }
}
