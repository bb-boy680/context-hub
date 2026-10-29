/**
 * A small TTL map for the market reads. Entries live for one running page:
 * this is a cache, not a store, and nothing survives a reload.
 */
export interface TtlCache<T> {
  get(key: string): T | undefined
  set(key: string, value: T, ttl: number): void
  delete(key: string): void
  clear(): void
}

export interface TtlCacheOptions {
  now?: () => number
  /** Entries kept before the oldest is evicted. */
  limit?: number
}

/** Build a bounded TTL cache; `get` removes what has expired. */
export function createTtlCache<T>({
  now = Date.now,
  limit = 200,
}: TtlCacheOptions = {}): TtlCache<T> {
  const entries = new Map<string, { expires: number; value: T }>()

  return {
    get(key) {
      const entry = entries.get(key)
      if (entry === undefined) return undefined
      if (now() >= entry.expires) {
        entries.delete(key)
        return undefined
      }
      return entry.value
    },

    set(key, value, ttl) {
      if (!entries.has(key) && entries.size >= limit) {
        const oldest = entries.keys().next()
        if (oldest.done !== true) entries.delete(oldest.value)
      }
      entries.set(key, { expires: now() + ttl, value })
    },

    delete(key) {
      entries.delete(key)
    },

    clear() {
      entries.clear()
    },
  }
}
