import { describe, expect, it } from "vitest"

import type { PluginRecord } from "@context-hub/plugins"

import type { MarketEntry, MarketSource } from "../src/contract.ts"
import {
  groupedRows,
  installedRecord,
  rowsOf,
  visibleRows,
  type MarketRow,
  type SourceEntries,
} from "../src/rows.ts"

function source(id: string, name: string): MarketSource {
  return {
    id,
    name,
    repo: `github.com/${id}/repo`,
    index: "marketplace.json",
    list: async () => [],
  }
}

function entry(overrides: Partial<MarketEntry> & { id: string; name: string }): MarketEntry {
  return {
    sourceId: "one",
    install: { kind: "url", url: "https://github.com/a/b" },
    ...overrides,
  }
}

const one = source("one", "One")
const two = source("two", "Two")

function rows(): MarketRow[] {
  return rowsOf([
    {
      source: one,
      entries: [
        entry({
          id: "one:alpha",
          name: "alpha",
          description: "A search tool",
          category: "development",
          sourceId: "one",
        }),
        entry({ id: "one:beta", name: "beta", category: "Creativity", sourceId: "one" }),
      ],
    },
    {
      source: two,
      entries: [
        entry({ id: "two:gamma", name: "gamma", author: "Gamma Co", category: "Productivity", sourceId: "two" }),
      ],
    },
  ])
}

describe("rowsOf", () => {
  it("keeps every source's entries in source order", () => {
    expect(rows().map((row) => row.entry.name)).toEqual(["alpha", "beta", "gamma"])
  })

  it("draws an entry listed twice once", () => {
    const duplicates: SourceEntries[] = [
      { source: one, entries: [entry({ id: "one:alpha", name: "alpha" })] },
      { source: two, entries: [entry({ id: "one:alpha", name: "alpha" })] },
    ]
    expect(rowsOf(duplicates)).toHaveLength(1)
  })
})

describe("visibleRows", () => {
  it("narrows to one source before searching", () => {
    expect(visibleRows(rows(), "two", "").map((row) => row.entry.name)).toEqual(["gamma"])
    expect(visibleRows(rows(), "two", "alpha")).toEqual([])
  })

  it("matches the name, description, author and category", () => {
    expect(visibleRows(rows(), null, "alpha").map((row) => row.entry.name)).toEqual(["alpha"])
    expect(visibleRows(rows(), null, "search tool").map((row) => row.entry.name)).toEqual([
      "alpha",
    ])
    expect(visibleRows(rows(), null, "gamma co").map((row) => row.entry.name)).toEqual([
      "gamma",
    ])
    expect(visibleRows(rows(), null, "creativity").map((row) => row.entry.name)).toEqual([
      "beta",
    ])
  })
})

describe("groupedRows", () => {
  it("uses the normalized category and puts other last", () => {
    const groups = groupedRows(
      [
        ...rows(),
        { entry: entry({ id: "one:delta", name: "delta" }), source: one },
      ],
      (id) => `label:${id}`
    )

    expect(groups.map((group) => group.id)).toEqual([
      "design",
      "development",
      "productivity",
      "other",
    ])
    expect(groups.at(-1)?.id).toBe("other")
  })

  it("orders rows by name inside a group", () => {
    const same = rowsOf([
      {
        source: one,
        entries: [
          entry({ id: "one:beta", name: "beta", category: "development", sourceId: "one" }),
          entry({ id: "one:alpha", name: "alpha", category: "development", sourceId: "one" }),
        ],
      },
    ])
    const groups = groupedRows(same, (id) => id)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.rows.map((row) => row.entry.name)).toEqual(["alpha", "beta"])
  })
})

describe("installedRecord", () => {
  const record: PluginRecord = {
    name: "alpha",
    version: "1.0.0",
    description: "",
    tags: [],
    source: { kind: "url", url: "https://github.com/a/b", revision: "abc" },
    hash: "hash",
    icon: "",
    assets: [],
    installedAt: "2026-10-30T00:00:00.000Z",
    updatedAt: "2026-10-30T00:00:00.000Z",
  }

  it("matches the same name and the same address", () => {
    expect(installedRecord([record], entry({ id: "one:alpha", name: "alpha" }))).toBe(record)
  })

  it("does not match a pack of the same name from somewhere else", () => {
    const elsewhere = entry({
      id: "one:alpha",
      name: "alpha",
      install: { kind: "url", url: "https://github.com/c/d" },
    })
    expect(installedRecord([record], elsewhere)).toBeUndefined()
  })

  it("does not match a different name from the same address", () => {
    expect(installedRecord([record], entry({ id: "one:other", name: "other" }))).toBeUndefined()
  })
})
