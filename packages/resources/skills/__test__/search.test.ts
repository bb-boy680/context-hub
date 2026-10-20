/**
 * The skill rows a global search offers: the library's own and each place's,
 * each name once, with the picture the page would draw.
 */
import { describe, expect, it } from "vitest"

import type { SkillLibraryValue } from "../src/library-store.ts"
import { searchSkills } from "../src/search.ts"
import type { PlaceSkillsView, SkillSummary } from "../src/store.ts"

function summary(
  name: string,
  description: string,
  tags: string[] = [],
  assets: string[] = []
): SkillSummary {
  return {
    name,
    description,
    tags,
    source: "local",
    enabled: true,
    assets,
    updatedAt: "",
  }
}

function place(...skills: { name: string; description: string }[]): PlaceSkillsView {
  return {
    root: "/places/workspace",
    display: ".agents/skills",
    skills: skills.map((one) => ({ ...one, origin: "own" })),
  }
}

const value: SkillLibraryValue = {
  page: {
    items: [
      summary("pdf-extract", "Extract tables from PDFs", ["documents"], ["assets/a.png"]),
      summary("review", "Review a change", ["code"]),
    ],
    total: 2,
    counts: { all: 2, builtin: 0, local: 2, registry: 0 },
    root: "/library",
  },
  held: {
    workspace: place(
      { name: "pdf-forms", description: "Fill PDF forms" },
      { name: "pdf-extract", description: "A copy the library owns" }
    ),
  },
  tags: ["documents", "code"],
}

const assetUrl = (ref: string) => `/assets/${ref}`

describe("searching the skills", () => {
  it("finds the library and a place's own skills, each name once", () => {
    const rows = searchSkills(value, "PDF", assetUrl)
    expect(rows.map((one) => one.title)).toEqual(["pdf-extract", "pdf-forms"])
    expect(rows[0]?.avatar, "the library row's own picture").toBe("/assets/assets/a.png")
    expect(rows[1]?.avatar, "a place's row has no picture").toBeUndefined()
  })

  it("matches a tag and ignores case", () => {
    expect(searchSkills(value, "DOCUMENTS", assetUrl).map((one) => one.title)).toEqual([
      "pdf-extract",
    ])
  })

  it("opens the page filtered by the clicked row's own name", () => {
    const rows = searchSkills(value, "pdf", assetUrl)
    expect(rows[0]?.path).toBe("/skills?q=pdf-extract")
    expect(rows[1]?.path).toBe("/skills?q=pdf-forms")
  })

  it("returns nothing for an empty query", () => {
    expect(searchSkills(value, "  ", assetUrl)).toEqual([])
  })
})
