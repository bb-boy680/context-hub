/**
 * One place's menu as data: the rows a provider's forms become, and which of
 * them the files already hold.
 */
import { describe, expect, it } from "vitest"

import { promptMenu } from "../src/menu.ts"
import type { PromptPlace } from "../src/provider.ts"

const place: PromptPlace = {
  id: "spot",
  agent: "hub.target.one",
  labelKey: "one.tab",
  icon: () => null,
  scope: "workspace",
  order: 20,
  where: ".one",
  forms: [
    {
      id: "commands",
      labelKey: "prompts.menu.commands",
      removeLabelKey: "prompts.menu.commands.remove",
    },
    {
      id: "instructions",
      labelKey: "prompts.menu.documents",
      options: [
        {
          id: "agents",
          labelKey: "prompts.menu.document.agents",
          removeLabelKey: "prompts.menu.document.agents.remove",
        },
        { id: "notes", labelKey: "prompts.menu.document.notes" },
      ],
    },
  ],
}

describe("one place's menu", () => {
  it("makes a form without options one row, held under the form's id", () => {
    const [group] = promptMenu(place, { commands: true })
    expect(group?.labelKey).toBeUndefined()
    expect(group?.entries).toEqual([
      {
        key: "commands",
        labelKey: "prompts.menu.commands",
        removeLabelKey: "prompts.menu.commands.remove",
        held: true,
        form: "commands",
      },
    ])
  })

  it("gives a form with options a heading and one row per option", () => {
    const group = promptMenu(place, {})[1]
    expect(group?.labelKey).toBe("prompts.menu.documents")
    expect(group?.entries.map((entry) => entry.key)).toEqual([
      "instructions:agents",
      "instructions:notes",
    ])
    expect(group?.entries[0]).toMatchObject({ form: "instructions", option: "agents" })
  })

  it("reads an option's held flag, not the form's", () => {
    const group = promptMenu(place, { instructions: true, "instructions:notes": true })[1]
    expect(group?.entries.map((entry) => entry.held)).toEqual([false, true])
  })

  it("leaves remove undefined where the provider names no word for it", () => {
    const group = promptMenu(place, {})[1]
    expect(group?.entries[1]?.removeLabelKey).toBeUndefined()
  })
})
