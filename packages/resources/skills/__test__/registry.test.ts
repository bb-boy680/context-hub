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
import { createHubKernel, type ExtensionModule, type PlatformHost } from "@context-hub/extensions"
import { describe, expect, it } from "vitest"

import { SkillService, readablePlaces, type SkillPlace } from "../src/provider.ts"

/** One place, as an agent extension declares it. */
function place(id: string, scope: "workspace" | "global"): SkillPlace {
  return { id, labelKey: `${id}.tab`, icon: () => null, scope, dir: `.${id}/skills` }
}

describe("the skill registry", () => {
  const registry = new SkillService(new Context())

  it("holds nothing to begin with", () => {
    expect(registry.providers()).toEqual([])
  })

  it("keeps what is registered, in registration order, with every place declared", () => {
    registry.register({ id: "hub.target.one", places: [place("one", "global")] })
    expect(registry.providers()).toHaveLength(1)
    expect(registry.providers()[0]?.places).toHaveLength(1)

    registry.register({ id: "hub.target.two", places: [place("two", "global")] })
    expect(registry.providers().map((provider) => provider.id)).toEqual([
      "hub.target.one",
      "hub.target.two",
    ])
  })

  it("takes one back out through its own disposer, and tolerates a second call", () => {
    const dispose = registry.register({ id: "hub.target.three", places: [place("three", "global")] })
    expect(registry.providers()).toHaveLength(3)

    dispose()
    expect(registry.providers()).toHaveLength(2)
    expect(registry.providers().map((provider) => provider.id)).not.toContain("hub.target.three")

    /* Disposing twice removes nothing more. */
    dispose()
    expect(registry.providers()).toHaveLength(2)
  })
})

describe("provider order in the kernel", () => {
  it("retains extension order after an agent is disabled and enabled", async () => {
    const host: PlatformHost = {
      form: "Test", version: "0.5.0", capabilities: { code: true, filesystem: false, network: false },
      storage: { read: () => null, write: () => undefined }, net: null, files: null, log: () => undefined,
    }
    const manifest = (name: string) => ({ name, version: "1.0.0", kind: "code" as const,
      category: "integration" as const, description: "", icon: () => null, defaultEnabled: true })
    const service: ExtensionModule = {
      name: "skills", manifest: manifest("skills"), apply(ctx) { new SkillService(ctx) },
    }
    const agent = (id: string): ExtensionModule => ({
      name: id, manifest: manifest(id), inject: ["skills"],
      apply(ctx) { ctx.skills.register({ id, places: [place(id, "global")] }) },
    })
    const kernel = await createHubKernel({ host, extensions: [service, agent("z"), agent("a")] })
    await kernel.start()
    expect(kernel.ctx.skills.providers().map((provider) => provider.id)).toEqual(["z", "a"])
    await kernel.ctx.extensions.disable("z")
    await kernel.ctx.extensions.enable("z")
    expect(kernel.ctx.skills.providers().map((provider) => provider.id)).toEqual(["z", "a"])
  })
})

describe("which places a set of chosen agents makes readable", () => {
  const providers = [
    { id: "hub.skill.catalog", shared: true, places: [place("shared", "workspace")] },
    { id: "hub.target.one", places: [place("one-global", "global")] },
    {
      id: "hub.target.two",
      places: [place("two-workspace", "workspace"), place("two-global", "global")],
    },
  ]
  const idsOf = (chosen: string[]) => readablePlaces(providers, chosen).map((each) => each.id)

  it("reads only the module's own place when no agent is chosen", () => {
    expect(idsOf([])).toEqual(["shared"])
  })

  it("reads both scopes of an agent once it is chosen", () => {
    expect(idsOf(["hub.target.two"])).toEqual(["shared", "two-workspace", "two-global"])
  })

  it("stops reading an agent's places when it is un-chosen", () => {
    expect(idsOf([])).not.toContain("two-workspace")
    expect(idsOf([])).not.toContain("two-global")
  })

  it("does not read another agent's places", () => {
    expect(idsOf(["hub.target.two"])).not.toContain("one-global")
  })

  it("全局入口排除工作区与共享工作区位置，保留所选 Agent 的全局位置", () => {
    expect(readablePlaces(providers, ["hub.target.one", "hub.target.two"], true).map((each) => each.id))
      .toEqual(["one-global", "two-global"])
    expect(readablePlaces(providers, [], true)).toEqual([])
  })

  it("keeps provider and place declaration order", () => {
    expect(idsOf(["hub.target.one", "hub.target.two"])).toEqual([
      "shared",
      "one-global",
      "two-workspace",
      "two-global",
    ])
  })
})
