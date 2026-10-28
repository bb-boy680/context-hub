/**
 * The rules the skill list merges library rows and place rows with. A skill is
 * named once on screen even when the library and a place both hold that name:
 * the library row stands for it, and the place's tab and count still include it.
 */
import { describe, expect, it } from "vitest"

import { nameTakenAt, placedIn, showsOwnRow } from "../src/library.ts"
import type { PlaceSkill, SkillPlaceRef, SkillSummary } from "../src/store.ts"
import type { Skill, SkillHold } from "../src/types.ts"

/** One library row, with only the name mattering to the merge rule. */
function libraryRow(name: string): SkillSummary {
  return {
    name,
    description: "",
    tags: [],
    source: "local",
    enabled: true,
    assets: [],
    updatedAt: "",
  }
}

/** One skill a place reads, as its directory has it. */
function placeSkill(name: string, origin: PlaceSkill["origin"] = "own"): PlaceSkill {
  return { name, description: "", origin }
}

/** One row the list draws, with whatever places it carries. */
function row(places: Partial<Skill>): Skill {
  return {
    name: "ego-browser",
    summary: "",
    description: "",
    tags: [],
    source: "local",
    location: "library",
    installed: false,
    updated: "",
    ...places,
  }
}

describe("a place's own skill row", () => {
  it("is not drawn when the library holds the same name", () => {
    expect(showsOwnRow(placeSkill("ego-browser"), [libraryRow("ego-browser")])).toBe(false)
  })

  it("is drawn when the library holds no such name", () => {
    expect(showsOwnRow(placeSkill("ego-browser"), [libraryRow("anatomy")])).toBe(true)
  })

  it("is not drawn for a link the hub installed, even with no library row in view", () => {
    expect(showsOwnRow(placeSkill("ego-browser", "hub"), [])).toBe(false)
  })

  it("is drawn for a stale link so it can still be cleaned up", () => {
    expect(showsOwnRow(placeSkill("broken", "stale"), [])).toBe(true)
  })
})

describe("the places a row is on screen under", () => {
  const holding: SkillHold = { id: "claude", scope: "workspace", dir: ".claude/skills" }
  const taken: SkillHold = { id: "agents", scope: "workspace", dir: ".agents/skills" }

  it("includes the places holding its files and the places holding a same name", () => {
    expect(placedIn(row({ places: [holding], takenAt: [taken] }))).toEqual([holding, taken])
  })
})

describe("taking a row out of a place", () => {
  const ref: SkillPlaceRef = { scope: "workspace", dir: ".claude/skills" }

  it("deletes the entry where the place keeps its own copy under that name", () => {
    expect(nameTakenAt(row({ takenAt: [{ id: "claude", ...ref }] }), ref)).toBe(true)
  })

  it("does not when the same directory sits under another scope", () => {
    const taken = row({ takenAt: [{ id: "claude", scope: "global", dir: ref.dir }] })
    expect(nameTakenAt(taken, ref)).toBe(false)
  })

  it("does not for a place holding the library's own files", () => {
    expect(nameTakenAt(row({ places: [{ id: "claude", ...ref }] }), ref)).toBe(false)
  })
})
