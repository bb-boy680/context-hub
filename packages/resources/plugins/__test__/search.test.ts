/**
 * The pack rows a global search offers: a library record and a pack only a
 * client holds are both rows on the page, so both are results here.
 */
import { describe, expect, it } from "vitest"

import type { PluginLibraryValue } from "../src/library-store.ts"
import type { PluginRecord } from "../src/revision.ts"
import { searchPlugins } from "../src/search.ts"

const record: PluginRecord = {
  name: "engineering-kit",
  version: "2.1.0",
  description: "A kit for engineers",
  tags: ["dev"],
  source: { kind: "local", path: "/packs/engineering-kit" },
  hash: "",
  icon: "assets/engineering-kit/icon.png",
  assets: [],
  installedAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

const value: PluginLibraryValue = {
  records: [record],
  scanned: [
    {
      name: "held-only",
      version: "1.0.0",
      description: "Held by an agent",
      held: [],
    },
  ],
  clients: [],
  root: "/library",
  missing: [],
}

const t = (key: string) => key

describe("searching the plugins", () => {
  it("finds a library record and a pack no record holds", () => {
    expect(searchPlugins(value, "engineer", "en", t).map((one) => one.title)).toEqual([
      "engineering-kit",
    ])
    expect(searchPlugins(value, "HELD", "en", t).map((one) => one.title)).toEqual([
      "held-only",
    ])
  })

  it("matches a tag, and carries the pack's own mark", () => {
    const [row] = searchPlugins(value, "dev", "en", t)
    expect(row?.title).toBe("engineering-kit")
    expect(row?.avatar).toContain("engineering-kit/icon.png")
  })

  it("opens the page filtered, in the list view that marks the query", () => {
    expect(searchPlugins(value, "engineer", "en", t)[0]?.path).toBe(
      "/plugins?q=engineer&view=list"
    )
  })

  it("returns nothing for an empty query", () => {
    expect(searchPlugins(value, "", "en", t)).toEqual([])
  })
})
