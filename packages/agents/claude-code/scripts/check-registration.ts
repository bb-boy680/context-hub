/**
 * Behaviour check for the seam between an agent extension and the module it
 * registers into: Claude Code declares where it keeps skills, and those places
 * must come out again when the extension is disabled.
 *
 * This is the seam the two halves are tested apart from. The skills module
 * checks its registry against a throwaway provider, and this package checks
 * what its other providers do to a file; neither runs a kernel, so neither can
 * see what happens when one side is switched off. That is the failure worth
 * catching: a registration that outlives its extension keeps working, so
 * nothing looks broken — the places simply stay listed after the agent is gone.
 *
 * The other three seams (prompts, MCP, plugins) are the same mechanism over the
 * same registry shape, and get covered as each registry is converted.
 *
 * Run from the package: `node scripts/check-registration.ts`
 */
import { createHubKernel } from "@context-hub/extensions"
import type { PlatformHost } from "@context-hub/extensions"
import { skillsModuleWith, SKILLS_ID } from "@context-hub/skills/extension"

import { claudeCodeModuleWith } from "../src/extension.ts"
import { CLAUDE_CODE_ID } from "../src/locations.ts"

let failures = 0
let checked = 0

function check(what: string, ok: boolean, detail?: unknown) {
  checked += 1
  if (ok) {
    console.log(`  ok   ${what}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${what}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`)
}

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

   The other three modules are stood in for, because this check is about the one
   seam it names. Claude Code declares every service it registers into, so
   without them it waits rather than running — which is the point of declaring
   them, and is asserted on its own below. */
const stubbed = () => ({ register: () => () => undefined, tools: {} })

const kernel = await createHubKernel({
  host: testHost(),
  services: { prompts: stubbed(), mcp: stubbed(), plugins: stubbed() },
  extensions: [skillsModuleWith(() => null), claudeCodeModuleWith(() => null)],
})
await kernel.start()

/** The agent ids the skills module is holding places for. */
function placesOf(): string[] {
  return (kernel.ctx.get("skills")?.providers() ?? []).map((one) => one.id)
}

console.log("with both extensions on")
check("the skills module is up", kernel.ctx.get("skills") !== undefined)
check("Claude Code registered its skill places", placesOf().includes(CLAUDE_CODE_ID), placesOf())
check("the module's own place is there too", placesOf().includes(SKILLS_ID), placesOf())

/* The registration takes its lifetime from whoever called `register`, which it
   reads off the context it was called through. That only works while `register`
   is a prototype method: as an arrow property it would close over the service's
   own context, the disposer would belong to the service, and the checks below
   would fail while everything else kept working. */
{
  const service = kernel.ctx.get("skills") as unknown as Record<string, unknown>
  check(
    "the service's register is a prototype method, not an own property",
    typeof Object.getPrototypeOf(service)?.register === "function" &&
      !Object.hasOwn(service, "register")
  )
}

console.log("\nafter disabling Claude Code")
await kernel.ctx.extensions.disable(CLAUDE_CODE_ID)
check("its skill places are gone", !placesOf().includes(CLAUDE_CODE_ID), placesOf())
check(
  "nothing else was taken out with it",
  placesOf().length === 1 && placesOf()[0] === SKILLS_ID,
  placesOf()
)

console.log("\nafter enabling it again")
await kernel.ctx.extensions.enable(CLAUDE_CODE_ID)
check("its skill places are back", placesOf().includes(CLAUDE_CODE_ID), placesOf())
check(
  "and were not registered twice",
  placesOf().filter((id) => id === CLAUDE_CODE_ID).length === 1,
  placesOf()
)

console.log("\nwith one of the modules it declares taken away")
{
  /* The other half of declaring dependencies: an agent that cannot reach every
     module it registers into waits rather than registering into some of them.
     Half an agent — its skill places listed but its MCP file never read — is
     harder to understand than one that says what it is waiting for. */
  const partial = await createHubKernel({
    host: testHost(),
    services: { prompts: stubbed(), plugins: stubbed() },
    extensions: [skillsModuleWith(() => null), claudeCodeModuleWith(() => null)],
  })
  await partial.start()
  const entry = partial.ctx.extensions
    .snapshot()
    .entries.find((one) => one.manifest.id === CLAUDE_CODE_ID)
  check("Claude Code waits instead of half-registering", entry?.status === "waiting", entry?.status)
  check(
    "and the module it could not reach registered nothing for it",
    (partial.ctx.get("skills")?.providers() ?? []).every((one) => one.id !== CLAUDE_CODE_ID),
    (partial.ctx.get("skills")?.providers() ?? []).map((one) => one.id)
  )
}

console.log(`\n${checked - failures}/${checked} checks passed`)
process.exitCode = failures === 0 ? 0 : 1
