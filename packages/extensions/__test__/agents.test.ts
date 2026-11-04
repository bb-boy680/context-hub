/**
 * Which providers a person's agent choice leaves readable.
 *
 * This is the one rule every library filters its places by, so it is checked on
 * its own: a provider nobody chose contributes nothing in either scope, and the
 * one a module registers for itself contributes whatever is chosen.
 */
import { describe, expect, it } from "vitest"

import { chosenAgents, chosenProviders, isGlobalWorkspace, type ChosenProvider } from "../src/agents.ts"
import type { WorkspacePage, WorkspaceService } from "@context-hub/core/workspace"

describe("全局入口", () => {
  const page: WorkspacePage = {
    current: "home",
    agents: [],
    folders: [
      { id: "project", name: "全局", path: "/project", display: "/project", default: false, nameKey: null },
      { id: "home", name: "自定义名称", path: "/home", display: "~", default: true, nameKey: null },
    ],
  }

  it("按当前行标记识别，不依赖名称、系统别名或行顺序", () => {
    expect(isGlobalWorkspace(page)).toBe(true)
    expect(isGlobalWorkspace({ ...page, current: "project" })).toBe(false)
  })

  it("未加载、没有选择或当前行未知时不推断为全局", () => {
    expect(isGlobalWorkspace(undefined)).toBe(false)
    expect(isGlobalWorkspace(null)).toBe(false)
    expect(isGlobalWorkspace({ ...page, current: null })).toBe(false)
    expect(isGlobalWorkspace({ ...page, current: "unknown" })).toBe(false)
  })

  it("相同 ID 的默认标记变化后重新判断", () => {
    expect(isGlobalWorkspace({ ...page, folders: page.folders.map((folder) => ({ ...folder, default: false })) })).toBe(false)
    expect(isGlobalWorkspace(page)).toBe(true)
  })
})

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
