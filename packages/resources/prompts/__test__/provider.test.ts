/**
 * Which agent places a prompt can be delivered to.
 *
 * The places are why this page has a target menu at all, and the sidebar's
 * choice is what decides which agents are offered: an agent nobody chose is not
 * a delivery target. The module's own workspace place is not an agent's, so it
 * stays whatever is chosen.
 */
import { describe, expect, it } from "vitest"

import { promptPlaces, type PromptPlace, type PromptProvider } from "../src/provider.ts"

/** One place, as an agent extension declares it. */
function place(id: string, agent: string, scope: "workspace" | "global", order: number): PromptPlace {
  return {
    id,
    agent,
    labelKey: `${id}.label`,
    icon: () => null,
    scope,
    commandDir: `.${id}/commands`,
    ruleDir: `.${id}/rules`,
    order,
  }
}

const providers: PromptProvider[] = [
  {
    id: "hub.prompt.catalog",
    shared: true,
    places: [place("own", "hub.prompt.catalog", "workspace", 0)],
  },
  {
    id: "hub.target.one",
    places: [
      place("one-workspace", "hub.target.one", "workspace", 20),
      place("one-global", "hub.target.one", "global", 20),
    ],
  },
  { id: "hub.target.two", places: [place("two-global", "hub.target.two", "global", 20)] },
]

const idsOf = (chosen: string[]) => promptPlaces(providers, chosen).map((one) => one.id)

describe("the places a prompt can be delivered to", () => {
  it("offers only the module's own place when no agent is chosen", () => {
    expect(idsOf([])).toEqual(["own"])
  })

  it("offers both scopes of a chosen agent, globals first", () => {
    expect(idsOf(["hub.target.one"])).toEqual(["one-global", "own", "one-workspace"])
  })

  it("stops offering an agent's places when it is un-chosen", () => {
    expect(idsOf([])).not.toContain("one-global")
    expect(idsOf([])).not.toContain("one-workspace")
  })

  it("does not offer another agent's places", () => {
    expect(idsOf(["hub.target.one"])).not.toContain("two-global")
  })
})
