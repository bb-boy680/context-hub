/**
 * Which providers a person's agent choice leaves readable.
 *
 * This is the one rule every library filters its places by, so it is checked on
 * its own: a provider nobody chose contributes nothing in either scope, and the
 * one a module registers for itself contributes whatever is chosen.
 */
import { describe, expect, it } from "vitest"

import { chosenAgents, chosenProviders, type ChosenProvider } from "../src/agents.ts"
import type { WorkspaceService } from "@context-hub/core/workspace"

/** One provider, as an agent integration or a module itself registers it. */
function provider(id: string, shared?: boolean): ChosenProvider {
  return shared === true ? { id, shared } : { id }
}

/** A form's workspace list, holding only the agents it was given. */
function workspaces(agents: string[]): WorkspaceService {
  return {
    current: () => ({ folders: [], current: null, agents }),
    failure: () => null,
    subscribe: () => () => undefined,
    refresh: async () => undefined,
    select: async () => true,
    add: async () => true,
    rename: async () => true,
    remove: async () => true,
    setAgent: async () => true,
  }
}

describe("the agents a form chose", () => {
  it("reads the chosen ids off the workspace list", () => {
    expect(chosenAgents(workspaces(["hub.target.one"]))).toEqual(["hub.target.one"])
  })

  it("reads nothing when the form has no workspace list", () => {
    expect(chosenAgents(undefined)).toEqual([])
  })
})

describe("the providers a choice leaves readable", () => {
  const providers = [
    provider("hub.target.one"),
    provider("hub.skill.catalog", true),
    provider("hub.target.two"),
  ]

  it("keeps the shared provider and the chosen agent, in registration order", () => {
    expect(chosenProviders(providers, ["hub.target.two"]).map((one) => one.id)).toEqual([
      "hub.skill.catalog",
      "hub.target.two",
    ])
  })

  it("keeps only the shared provider when nothing is chosen", () => {
    expect(chosenProviders(providers, []).map((one) => one.id)).toEqual(["hub.skill.catalog"])
  })
})
