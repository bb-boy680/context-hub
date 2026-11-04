/**
 * The marks a card wears for the agents holding a prompt, and the one question
 * the page asks of a held answer: does this place hold anything at all.
 */
import { describe, expect, it } from "vitest"

import type { PlaceFiles } from "@context-hub/core/place-files"

import { heldCount, heldMarks, holdsSomething, promptsAtPlace, selectedPromptPlace } from "../src/held.ts"
import { heldInWorkspace } from "../src/library.ts"
import type { PromptPlace } from "../src/provider.ts"

const spot = (id: string, agent: string): PromptPlace => ({
  id,
  agent,
  labelKey: `${id}.label`,
  icon: () => null,
  scope: "workspace",
  forms: [{ id: "commands", labelKey: "prompts.menu.commands" }],
})

const labelOf = (place: PromptPlace) => place.id

describe("whether a place holds anything", () => {
  it("reads an absent answer and an empty one as nothing", () => {
    expect(holdsSomething(undefined)).toBe(false)
    expect(holdsSomething({})).toBe(false)
  })

  it("counts any form or option, not one fixed set", () => {
    expect(holdsSomething({ "instructions:agents": true })).toBe(true)
    expect(holdsSomething({ commands: false, rule: true })).toBe(true)
  })
})

describe("place counts", () => {
  const rows = [{ id: "first" }, { id: "second" }, { id: "third" }]
  const holds = {
    first: {
      "a-workspace": { commands: true, rule: true },
      "a-global": {},
    },
    second: {
      "a-workspace": { commands: false },
      "a-global": { "instructions:agents": true },
    },
    third: { "a-workspace": {}, "a-global": {} },
  }

  it("counts a prompt once per place even when several forms are held", () => {
    expect(heldCount(rows, "a-workspace", holds, new Set())).toBe(1)
    expect(heldCount(rows, "a-global", holds, new Set())).toBe(1)
  })

  it("distinguishes an unread or failed scan from a known empty place", () => {
    const none = { first: { empty: {} }, second: { empty: {} }, third: { empty: {} } }
    expect(heldCount(rows, "empty", none, null)).toBeNull()
    expect(heldCount(rows, "empty", none, new Set(["empty"]))).toBeNull()
    expect(heldCount(rows, "empty", none, new Set())).toBe(0)
    expect(heldCount(rows, "missing", none, new Set())).toBeNull()
    expect(heldCount([], "empty", {}, null)).toBeNull()
    expect(heldCount([], "empty", {}, new Set(["empty"]))).toBeNull()
    expect(heldCount([], "empty", {}, new Set())).toBe(0)
  })

  it("leaves one place unknown when only its read failed", () => {
    const failed = new Set(["a-workspace"])
    expect(heldCount(rows, "a-workspace", holds, failed)).toBeNull()
    expect(heldCount(rows, "a-global", holds, failed)).toBe(1)
  })

  it("filters by the selected place rather than the agent or scope", () => {
    expect(promptsAtPlace(rows, null, holds)).toEqual(rows)
    expect(promptsAtPlace(rows, "a-workspace", holds)).toEqual([rows[0]])
    expect(promptsAtPlace(rows, "a-global", holds)).toEqual([rows[1]])
    expect(promptsAtPlace(rows, "other", holds)).toEqual([])
    expect(promptsAtPlace(rows.slice(1), "a-workspace", holds)).toEqual([])
  })
})

describe("the held snapshot", () => {
  it("does not carry a snapshot into another workspace, place list, or file port", () => {
    const files: PlaceFiles = {
      read: async () => null,
      write: async () => undefined,
      remove: async () => undefined,
      workspace: async () => "one",
    }
    const places = [spot("a-workspace", "a")]
    const held = { first: { "a-workspace": { commands: true } } }
    const scan = { workspace: "one", places, files, held }
    expect(heldInWorkspace(scan, "one", places, files)).toBe(held)
    expect(heldInWorkspace(scan, "two", places, files)).toBeNull()
    expect(heldInWorkspace(scan, "one", [...places], files)).toBeNull()
    expect(heldInWorkspace(scan, "one", places, { ...files })).toBeNull()
    expect(heldInWorkspace(null, "one", places, files)).toBeNull()
  })
})

describe("the selected prompt place", () => {
  it("resolves each scope by its unique place id and drops a missing one", () => {
    const workspace = spot("a-workspace", "a")
    const global = { ...spot("a-global", "a"), scope: "global" as const }
    expect(selectedPromptPlace([workspace, global], "a-workspace")).toBe(workspace)
    expect(selectedPromptPlace([workspace, global], "a-global")).toBe(global)
    expect(selectedPromptPlace([workspace], "a-global")).toBeNull()
    expect(selectedPromptPlace([workspace, global], null)).toBeNull()
  })
})

describe("the marks of the agents holding a prompt", () => {
  it("draws nothing when no place holds it", () => {
    expect(heldMarks([spot("one", "a")], { one: {} }, labelOf)).toEqual([])
  })

  /* The two scopes of one agent are one agent, and a row of marks answers
     "which agents". */
  it("merges the scopes of one agent into one mark", () => {
    const marks = heldMarks(
      [spot("a-workspace", "a"), spot("a-global", "a")],
      { "a-workspace": { commands: true }, "a-global": { commands: true } },
      labelOf
    )
    expect(marks.map((mark) => mark.id)).toEqual(["a"])
    expect(marks[0]?.label).toBe("a-workspace · a-global")
  })

  it("gives each agent its own mark, in the order the places read", () => {
    const marks = heldMarks(
      [spot("a", "one"), spot("b", "two")],
      { a: { commands: true }, b: { commands: true } },
      labelOf
    )
    expect(marks.map((mark) => mark.id)).toEqual(["one", "two"])
  })

  /* A section in a document is a delivery too, and the card says so. */
  it("counts a document's section as a mark", () => {
    const marks = heldMarks(
      [spot("a", "one")],
      { a: { "instructions:agents": true } },
      labelOf
    )
    expect(marks.map((mark) => mark.id)).toEqual(["one"])
  })
})
