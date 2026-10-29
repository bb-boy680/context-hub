import type { Skill } from "@context-hub/skills"
import { describe, expect, it } from "vitest"

import {
  installedRow,
  nameConflict,
  refreshedRank,
  sameSource,
  skillFile,
  sparkPoints,
  treeFromFiles,
} from "../src/rows.ts"
import type { MarketFile, MarketRankPage, MarketRankRow } from "../src/apis/types.ts"

function row(over: Partial<Skill>): Skill {
  return { name: "find-skills", upstream: { source: "vercel-labs/skills" }, ...over } as Skill
}

describe("sameSource", () => {
  it("normalizes the forms a recorded source takes", () => {
    expect(sameSource("vercel-labs/skills", "https://github.com/vercel-labs/skills")).toBe(true)
    expect(sameSource("github.com/vercel-labs/skills", "vercel-labs/skills.git")).toBe(true)
    expect(sameSource("Vercel-Labs/Skills", "vercel-labs/skills/")).toBe(true)
    expect(sameSource("vercel-labs/skills", "other/skills")).toBe(false)
    expect(sameSource("", "")).toBe(false)
  })
})

describe("installedRow / nameConflict", () => {
  it("finds the same source under the same name", () => {
    const rows = [row({ upstream: { source: "https://github.com/vercel-labs/skills" } as never })]
    expect(installedRow(rows, "vercel-labs/skills", "find-skills")).toBeDefined()
    expect(installedRow(rows, "other/skills", "find-skills")).toBeUndefined()
  })

  it("treats a same-named local row as a conflict, not an install", () => {
    const local = row({ upstream: undefined })
    expect(installedRow([local], "vercel-labs/skills", "find-skills")).toBeUndefined()
    expect(nameConflict([local], "vercel-labs/skills", "find-skills")).toBe(true)
  })

  it("does not call a different name a conflict", () => {
    expect(nameConflict([], "vercel-labs/skills", "find-skills")).toBe(false)
    expect(nameConflict([row({ name: "other" })], "vercel-labs/skills", "find-skills")).toBe(false)
  })
})

describe("sparkPoints", () => {
  it("spreads the points across the box and keeps a flat line centered", () => {
    const points = sparkPoints([1, 2, 3, 4], 100, 40)
    expect(points).not.toBeNull()
    expect(points?.split(" ")).toHaveLength(4)
    expect(sparkPoints([2, 2, 2], 100, 40)).toBe("4.0,20.0 50.0,20.0 96.0,20.0")
    expect(sparkPoints([1], 100, 40)).toBeNull()
    expect(sparkPoints(undefined, 100, 40)).toBeNull()
  })
})

describe("treeFromFiles", () => {
  const files: MarketFile[] = [
    { path: "SKILL.md", contents: "# Skill" },
    { path: "references/design.md", contents: "design" },
    { path: "assets/logo.png", contents: "png" },
  ]

  it("adds directories for every parent and keeps files after them", () => {
    const tree = treeFromFiles(files)
    expect(tree.map((entry) => entry.path)).toEqual([
      "SKILL.md",
      "assets",
      "references",
      "assets/logo.png",
      "references/design.md",
    ])
    expect(tree.find((entry) => entry.path === "references")?.directory).toBe(true)
    expect(tree.find((entry) => entry.path === "SKILL.md")?.bytes).toBe(7)
  })

  it("prefers the root SKILL.md over a nested one", () => {
    expect(skillFile(files)?.path).toBe("SKILL.md")
    expect(skillFile([{ path: "nested/SKILL.md", contents: "nested" }])?.path).toBe("nested/SKILL.md")
    expect(skillFile([{ path: "README.md", contents: "readme" }])).toBeUndefined()
  })
})

describe("refreshedRank", () => {
  const rankRow = (skillId: string): MarketRankRow => ({
    source: "owner/repo",
    skillId,
    name: skillId,
    installs: 1,
  })
  const pageOf = (page: number, ids: string[], hasMore = true): MarketRankPage => ({
    view: "all-time",
    page,
    hasMore,
    total: 100,
    rows: ids.map(rankRow),
  })

  it("replaces the first page but keeps the pages already loaded", () => {
    const current = pageOf(1, ["a", "b", "c", "d"], true)
    const fresh = pageOf(0, ["a2", "b2"], true)
    const merged = refreshedRank(current, fresh)
    expect(merged.page).toBe(1)
    expect(merged.rows.map((row) => row.skillId)).toEqual(["a2", "b2", "c", "d"])
    expect(merged.total).toBe(100)
  })

  it("drops a loaded row the fresh first page already shows", () => {
    const current = pageOf(1, ["a", "b", "c", "d"], true)
    const fresh = pageOf(0, ["a2", "c"], true)
    expect(refreshedRank(current, fresh).rows.map((row) => row.skillId)).toEqual([
      "a2",
      "c",
      "d",
    ])
  })

  it("keeps the first page alone when nothing was loaded", () => {
    const fresh = pageOf(0, ["a", "b"], true)
    expect(refreshedRank(null, fresh)).toBe(fresh)
    expect(refreshedRank(pageOf(0, ["x"]), fresh)).toBe(fresh)
    expect(refreshedRank(pageOf(1, ["x"]), { ...fresh, view: "hot" })).toEqual({
      ...fresh,
      view: "hot",
    })
  })
})
