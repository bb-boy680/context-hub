/**
 * Which agent places a prompt can be delivered to, and which provider answers
 * for one.
 *
 * The places are why this page has a target menu at all, and the sidebar's
 * choice is what decides which agents are offered: an agent nobody chose is not
 * a delivery target. The module's own workspace place is not an agent's, so it
 * stays whatever is chosen.
 */
import { Context } from "@deepseek-ai/cordis"
import { describe, expect, it } from "vitest"

import type { LegacyPromptProvider } from "../src/legacy.ts"
import {
  promptPlaces,
  PromptService,
  type PromptPlace,
  type PromptProvider,
} from "../src/provider.ts"

/** One place, as an agent extension declares it. */
function place(id: string, agent: string, scope: "workspace" | "global", order: number): PromptPlace {
  return {
    id,
    agent,
    labelKey: `${id}.label`,
    icon: () => null,
    scope,
    order,
    where: `.${id}`,
    forms: [{ id: "commands", labelKey: "prompts.menu.commands" }],
  }
}

/** A provider that answers nothing; these tests only read the registry. */
function provider(id: string, places: PromptPlace[], shared = false): PromptProvider {
  return {
    id,
    ...(shared ? { shared: true } : {}),
    places,
    held: async () => ({}),
    install: async () => undefined,
    remove: async () => false,
  }
}

const providers: PromptProvider[] = [
  provider("hub.prompt.catalog", [place("own", "hub.prompt.catalog", "workspace", 0)], true),
  provider("hub.target.one", [
    place("one-workspace", "hub.target.one", "workspace", 20),
    place("one-global", "hub.target.one", "global", 20),
  ]),
  provider("hub.target.two", [place("two-global", "hub.target.two", "global", 20)]),
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

  /* Everything a place declares travels with it: the menu reads the forms off
     the same object it reads the name from. */
  it("carries each place's forms and where through unchanged", () => {
    const one = promptPlaces(providers, ["hub.target.one"]).find((place) => place.id === "one-global")
    expect(one?.where).toBe(".one-global")
    expect(one?.forms.map((form) => form.id)).toEqual(["commands"])
  })
})

describe("the provider registry", () => {
  it("answers with the provider that declared a place", () => {
    const service = new PromptService(new Context())
    service.register(providers[1] as PromptProvider)
    expect(service.providerOf("one-global")?.id).toBe("hub.target.one")
    expect(service.providerOf("two-global")).toBeUndefined()
  })

  it("takes a provider back out when its plugin goes", () => {
    const service = new PromptService(new Context())
    const dispose = service.register(providers[1] as PromptProvider)
    dispose()
    expect(service.providers()).toEqual([])
  })

  it("refuses two providers behind one place id", () => {
    const service = new PromptService(new Context())
    service.register(providers[1] as PromptProvider)
    expect(() =>
      service.register(provider("hub.target.other", [place("one-global", "hub.target.other", "global", 20)]))
    ).toThrow(/already registered/)
  })

  it("refuses a provider that does not implement the three methods", () => {
    const service = new PromptService(new Context())
    expect(() =>
      service.register({ id: "broken", places: [place("x", "broken", "workspace", 20)] } as never)
    ).toThrow(/held, install and remove/)
  })

  /* A 0.1.x extension is still installed: its data description becomes a
     provider, rather than making its deliveries stop. */
  it("turns the old places-only shape into a provider with forms", () => {
    const old: LegacyPromptProvider = {
      id: "hub.target.claude-code",
      places: [
        {
          id: "claude-code",
          agent: "hub.target.claude-code",
          labelKey: "claudeCode.tab",
          icon: () => null,
          scope: "workspace",
          order: 20,
          commandDir: ".claude/commands",
          ruleDir: ".claude/rules",
          agentDir: ".claude/agents",
        },
      ],
    }
    const service = new PromptService(new Context())
    service.register(old)
    const [one] = service.providers()
    expect(one?.places[0]?.forms.map((form) => form.id)).toEqual(["commands", "rule", "agent"])
    expect(one?.places[0]?.where).toBe(".claude")
  })
})
