/**
 * Behaviour of the seam between an agent extension and the module it registers
 * into: Claude Code declares where it keeps skills, and those places must come
 * out again when the extension is disabled.
 *
 * This is the seam the two halves are tested apart from. The skills module
 * checks its registry against a throwaway provider, and this package checks what
 * its other providers do to a file; neither runs a kernel, so neither can see
 * what happens when one side is switched off. That is the failure worth catching:
 * a registration that outlives its extension keeps working, so nothing looks
 * broken — the places simply stay listed after the agent is gone.
 */
import { beforeAll, describe, expect, it } from "vitest"

import { createHubKernel } from "@context-hub/extensions"
import type { PlatformHost } from "@context-hub/extensions"
import type { PromptProvider } from "@context-hub/prompts/contract"
import { skillsModuleWith, SKILLS_ID } from "@context-hub/skills/extension"

import { claudeCodeModuleWith } from "../src/extension.ts"
import { CLAUDE_CODE_ID } from "../src/locations.ts"

/** A host with no disk and no network: enough to compose and switch extensions. */
function testHost(): PlatformHost {
  return {
    form: "Test",
    capabilities: { code: true, filesystem: false, network: false },
    storage: { read: () => null, write: () => undefined },
    net: null,
    files: null,
    log: () => undefined,
  }
}

/* The page is left out: nothing here renders, and the skills module takes its
   page as an argument for exactly this reason.

   The other three modules are stood in for, because this is about the one seam
   it names. Claude Code declares every service it registers into, so without
   them it waits rather than running — which is the point of declaring them, and
   is asserted on its own below. */
const stubbed = () => ({ register: () => () => undefined, tools: {} })

/** The providers Claude Code hands the prompts service, kept for inspection. */
const promptProviders: PromptProvider[] = []
const recordedPrompts = () => ({
  register: (provider: PromptProvider) => {
    promptProviders.push(provider)
    return () => undefined
  },
  tools: {},
})

type Kernel = Awaited<ReturnType<typeof createHubKernel>>

let kernel: Kernel

/** The agent ids the skills module is holding places for. */
const placesOf = () => (kernel.ctx.get("skills")?.providers() ?? []).map((one) => one.id)

beforeAll(async () => {
  kernel = await createHubKernel({
    host: testHost(),
    services: { prompts: recordedPrompts(), mcp: stubbed(), plugins: stubbed() },
    extensions: [skillsModuleWith(() => null, () => null), claudeCodeModuleWith(() => null)],
  })
  await kernel.start()
})

describe("with both extensions on", () => {
  it("has the skills module up, holding a place for each of them", () => {
    expect(kernel.ctx.get("skills")).toBeDefined()
    expect(placesOf()).toContain(CLAUDE_CODE_ID)
    expect(placesOf()).toContain(SKILLS_ID)
  })

  /* The registration takes its lifetime from whoever called `register`, which it
     reads off the context it was called through. That only works while `register`
     is a prototype method: as an arrow property it would close over the service's
     own context, the disposer would belong to the service, and the cases below
     would fail while everything else kept working. */
  it("holds a register that is a prototype method, not an own property", () => {
    const service = kernel.ctx.get("skills") as unknown as Record<string, unknown>
    expect(typeof Object.getPrototypeOf(service)?.register).toBe("function")
    expect(Object.hasOwn(service, "register")).toBe(false)
  })

  /* The agents directory is declared by the agent, not assumed by the page: a
     place without one is not offered the action at all. */
  it("declares an agents directory for both of its prompt places", () => {
    const places = promptProviders.flatMap((provider) => provider.places)
    expect(places.map((place) => place.id)).toEqual(
      expect.arrayContaining(["claude-code", "claude-code-global"])
    )
    for (const place of places) expect(place.agentDir).toBe(".claude/agents")
  })
})

describe("after disabling Claude Code", () => {
  it("takes its skill places out and nothing else with them", async () => {
    await kernel.ctx.extensions.disable(CLAUDE_CODE_ID)
    expect(placesOf()).not.toContain(CLAUDE_CODE_ID)
    expect(placesOf()).toEqual([SKILLS_ID])
  })
})

describe("after enabling it again", () => {
  it("puts its skill places back, registered once", async () => {
    await kernel.ctx.extensions.enable(CLAUDE_CODE_ID)
    expect(placesOf()).toContain(CLAUDE_CODE_ID)
    expect(placesOf().filter((id) => id === CLAUDE_CODE_ID)).toHaveLength(1)
  })
})

describe("with one of the modules it declares taken away", () => {
  let partial: Kernel

  beforeAll(async () => {
    /* The other half of declaring dependencies: an agent that cannot reach every
       module it registers into waits rather than registering into some of them.
       Half an agent — its skill places listed but its MCP file never read — is
       harder to understand than one that says what it is waiting for. */
    partial = await createHubKernel({
      host: testHost(),
      services: { prompts: stubbed(), plugins: stubbed() },
      extensions: [skillsModuleWith(() => null, () => null), claudeCodeModuleWith(() => null)],
    })
    await partial.start()
  })

  it("waits instead of half-registering, and registers nothing for it", () => {
    const entry = partial.ctx.extensions
      .snapshot()
      .entries.find((one) => one.manifest.id === CLAUDE_CODE_ID)
    expect(entry?.status).toBe("waiting")
    expect((partial.ctx.get("skills")?.providers() ?? []).map((one) => one.id)).not.toContain(
      CLAUDE_CODE_ID
    )
  })
})
