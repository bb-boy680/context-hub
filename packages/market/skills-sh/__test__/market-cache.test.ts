import { describe, expect, it } from "vitest"

import { createTtlCache } from "../src/cache.ts"

describe("createTtlCache", () => {
  it("returns a value until its ttl expires", () => {
    let now = 100
    const cache = createTtlCache<string>({ now: () => now })
    cache.set("a", "first", 10)
    expect(cache.get("a")).toBe("first")
    now = 109
    expect(cache.get("a")).toBe("first")
    now = 110
    expect(cache.get("a")).toBeUndefined()
  })

  it("keeps null as a real cached answer", () => {
    const cache = createTtlCache<string | null>({ now: () => 0 })
    cache.set("missing", null, 10)
    expect(cache.get("missing")).toBeNull()
  })

  it("evicts the oldest entry after the limit", () => {
    const now = 0
    const cache = createTtlCache<number>({ now: () => now, limit: 2 })
    cache.set("a", 1, 100)
    cache.set("b", 2, 100)
    cache.set("c", 3, 100)
    expect(cache.get("a")).toBeUndefined()
    expect(cache.get("b")).toBe(2)
    expect(cache.get("c")).toBe(3)
  })

  it("can be deleted and cleared", () => {
    const cache = createTtlCache<number>({ now: () => 0 })
    cache.set("a", 1, 100)
    cache.delete("a")
    expect(cache.get("a")).toBeUndefined()
    cache.set("b", 2, 100)
    cache.clear()
    expect(cache.get("b")).toBeUndefined()
  })
})
