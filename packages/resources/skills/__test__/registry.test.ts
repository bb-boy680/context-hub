/**
 * Behaviour of the registry an agent extension registers its skill places into,
 * and of which of those places a set of chosen agents makes readable.
 *
 * It runs the service the skills module publishes, so what it proves is what an
 * agent plugin meets at run time. A bare context is enough: the service publishes
 * itself on construction, and what is under test is the registry it holds, not
 * the kernel around it.
 */
import { Context } from "@deepseek-ai/cordis"
import { describe, expect, it } from "vitest"

import { SkillService, readablePlaces, type SkillPlace } from "../src/provider.ts"

/** One place, as an agent extension declares it. */
function place(id: string, scope: "workspace" | "global", order: number): SkillPlace {
  return { id, labelKey: `${id}.tab`, icon: () => null, scope, dir: `.${id}/skills`, order }
}

describe("the skill registry", () => {
  const registry = new SkillService(new Context())

  it("holds nothing to begin with", () => {
    expect(registry.providers()).toEqual([])
  })

  it("keeps what is registered, in registration order, with every place declared", () => {
    registry.register({ id: "hub.target.one", places: [place("one", "global", 30)] })
    expect(registry.providers()).toHaveLength(1)
    expect(registry.providers()[0]?.places).toHaveLength(1)

    registry.register({ id: "hub.target.two", places: [place("two", "global", 10)] })
    expect(registry.providers().map((provider) => provider.id)).toEqual([
      "hub.target.one",
      "hub.target.two",
    ])
  })

  it("takes one back out through its own disposer, and tolerates a second call", () => {
    const dispose = registry.register({ id: "hub.target.three", places: [place("three", "global", 5)] })
    expect(registry.providers()).toHaveLength(3)

    dispose()
    expect(registry.providers()).toHaveLength(2)
    expect(registry.providers().map((provider) => provider.id)).not.toContain("hub.target.three")

    /* Disposing twice removes nothing more. */
    dispose()
    expect(registry.providers()).toHaveLength(2)
  })
})

describe("which places a set of chosen agents makes readable", () => {
  const providers = [
    { id: "hub.target.one", places: [place("one-global", "global", 30)] },
    {
      id: "hub.target.two",
      places: [place("two-workspace", "workspace", 20), place("two-global", "global", 10)],
    },
  ]
  const idsOf = (chosen: string[]) => readablePlaces(providers, chosen).map((each) => each.id)

  it("reads a workspace place with no agent chosen", () => {
    expect(idsOf([])).toEqual(["two-workspace"])
  })

  it("holds a machine-wide place back until its own agent is chosen", () => {
    expect(idsOf(["hub.target.two"])).toEqual(["two-global", "two-workspace"])
  })

  it("does not read another agent's places", () => {
    expect(idsOf(["hub.target.two"])).not.toContain("one-global")
  })

  it("orders the places by their own rank", () => {
    expect(idsOf(["hub.target.one", "hub.target.two"])).toEqual([
      "two-global",
      "two-workspace",
      "one-global",
    ])
  })
})
