import { describe, expect, it } from "vitest"

import { createMarketCache } from "../src/cache.ts"

describe("createMarketCache", () => {
  it("answers from the cache until it ages out", async () => {
    let now = 0
    let reads = 0
    const cache = createMarketCache<string>({ ttl: 10, now: () => now })
    const load = async () => {
      reads += 1
      return "rows"
    }

    expect(await cache.read(false, load)).toBe("rows")
    now = 9
    expect(await cache.read(false, load)).toBe("rows")
    expect(reads).toBe(1)
    now = 10
    expect(await cache.read(false, load)).toBe("rows")
    expect(reads).toBe(2)
  })

  it("joins a read already in flight", async () => {
    let reads = 0
    let finish: (value: string) => void = () => undefined
    const cache = createMarketCache<string>()
    const load = () => {
      reads += 1
      return new Promise<string>((resolve) => {
        finish = resolve
      })
    }

    const first = cache.read(false, load)
    const second = cache.read(false, load)
    /* The read starts on the next microtask, which is where `finish` is bound. */
    await Promise.resolve()
    finish("rows")
    expect(await Promise.all([first, second])).toEqual(["rows", "rows"])
    expect(reads).toBe(1)
  })

  it("asks again when a refresh is asked for", async () => {
    let reads = 0
    const cache = createMarketCache<number>({ ttl: 60_000 })
    const load = async () => {
      reads += 1
      return reads
    }

    expect(await cache.read(false, load)).toBe(1)
    expect(await cache.read(true, load)).toBe(2)
  })
})
