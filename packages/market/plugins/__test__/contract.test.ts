import { Context } from "@deepseek-ai/cordis"
import { describe, expect, it } from "vitest"

import { MarketSourceRegistry, normalizeCategory, type MarketSource } from "../src/contract.ts"

const source: MarketSource = {
  id: "one",
  name: "One",
  repo: "github.com/a/b",
  index: "marketplace.json",
  list: async () => [],
}

describe("MarketSourceRegistry", () => {
  it("shows a registered source and announces both changes", () => {
    const registry = new MarketSourceRegistry(new Context())
    const seen: number[] = []
    const stop = registry.subscribe(() => seen.push(registry.sources().length))

    const remove = registry.register(source)
    expect(registry.sources()).toEqual([source])

    remove()
    expect(registry.sources()).toEqual([])
    expect(seen).toEqual([1, 0])
    stop()
  })

  it("stops announcing after a listener leaves", () => {
    const registry = new MarketSourceRegistry(new Context())
    let calls = 0
    const stop = registry.subscribe(() => {
      calls += 1
    })
    stop()
    registry.register(source)
    expect(calls).toBe(0)
  })
})

describe("normalizeCategory", () => {
  it("merges the two spellings each source uses", () => {
    expect(normalizeCategory("development")).toBe("development")
    expect(normalizeCategory("Developer Tools")).toBe("development")
    expect(normalizeCategory("Creativity")).toBe("design")
    expect(normalizeCategory("design")).toBe("design")
    expect(normalizeCategory("Data & Analytics")).toBe("data")
  })

  it("keeps a known category and sends the rest to other", () => {
    expect(normalizeCategory("database")).toBe("database")
    expect(normalizeCategory("Finance")).toBe("finance")
    expect(normalizeCategory(undefined)).toBe("other")
    expect(normalizeCategory("something else")).toBe("other")
  })
})
