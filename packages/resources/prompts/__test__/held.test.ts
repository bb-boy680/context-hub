/**
 * The marks a card wears for the agents holding a prompt, and the one question
 * the page asks of a held answer: does this place hold anything at all.
 */
import { describe, expect, it } from "vitest"

import { heldMarks, holdsSomething } from "../src/held.ts"
import type { PromptPlace } from "../src/provider.ts"

const spot = (id: string, agent: string): PromptPlace => ({
  id,
  agent,
  labelKey: `${id}.label`,
  icon: () => null,
  scope: "workspace",
  order: 20,
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
