/**
 * Behaviour check for the two tracks an extension registers through: the
 * contribution points, which carry data for the screen, and Cordis services,
 * which carry an API one extension calls from another.
 *
 * Everything here runs a real kernel over a throwaway host, so what it proves
 * is what the product does: a provider's names are visible in the catalog, a
 * service published by one extension reaches another that required it, and both
 * come apart again when either side is disabled.
 *
 * Run from the package: `node scripts/check-services.ts`
 */
import { createHubKernel } from "../src/kernel.ts"
import type { PlatformHost } from "../src/host.ts"
import type { ExtensionDefinition } from "../src/types.ts"

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

/** A host with no disk and no network: enough to compose a kernel. */
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

/* The two plugins below are the smallest pair that shows the mechanism: one
   publishes a value under a name, the other uses whatever publishes it. A real
   module adds its name to `ExtensionServices` so the map is typed; this check
   declares its own, the way the MCP module does. */

declare module "../src/types.ts" {
  interface ExtensionServices {
    counter: { bump(): number }
  }
}

const log: string[] = []

const provider: ExtensionDefinition = {
  manifest: {
    id: "test.provider",
    name: "Provider",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "integration",
    description: "Publishes a value.",
    icon: () => null,
    defaultEnabled: true,
    provides: ["counter"],
  },
  activate(scope) {
    let count = 0
    scope.provide("counter", { bump: () => (count += 1) })
    log.push("provider active")
  },
}

const consumer: ExtensionDefinition = {
  manifest: {
    id: "test.consumer",
    name: "Consumer",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "integration",
    description: "Uses that value.",
    icon: () => null,
    defaultEnabled: true,
  },
  activate(scope) {
    log.push("consumer active")
    scope.inject(["counter"], (ctx, services) => {
      log.push("consumer connected")
      /* The services asked for arrive as a map, keyed by name: that is what a
         plugin reads. The context is there too, for effects and events. */
      log.push(`services carried: ${typeof services.counter?.bump === "function"}`)
      log.push(`bumped: ${services.counter.bump()}`)
      /* And the same service is a property of that context, because the callback
         runs on a fiber that declares it. This used to be asserted the other way
         round: the kernel mounted extensions through `this.ctx`, which a Service
         reads through the tracker, so a plugin ended up on a context that was
         not this one's child and property access threw. That was the deviation,
         not the contract — Cordis resolves an injected name as a property, and
         the dsh-shaped plugin writes `ctx.skills.register(...)`. */
      log.push(`property access: ${typeof (ctx as unknown as Record<string, unknown>).counter}`)
      log.push(`get resolved: ${String(ctx.get("counter") !== undefined)}`)
      ctx.effect(() => () => log.push("consumer disconnected"))
    })
  },
}

const undeclared: ExtensionDefinition = {
  manifest: {
    id: "test.undeclared",
    name: "Undeclared",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "integration",
    description: "Publishes a name its manifest omits.",
    icon: () => null,
    defaultEnabled: false,
  },
  activate(scope) {
    scope.provide("hidden", {})
  },
}

async function main(): Promise<void> {
  const kernel = await createHubKernel({
    host: testHost(),
    extensions: [provider, consumer, undeclared],
  })
  await kernel.start()

  console.log("services")

  check("the provider activated", log.includes("provider active"))
  check("the consumer activated without the provider loaded first", log.includes("consumer active"))
  check("the consumer connected to it", log.includes("consumer connected"))
  check("the services map carries it", log.includes("services carried: true"), log)
  check("and it is the live service", log.includes("bumped: 1"), log)
  check("the callback can reach the service by name", log.includes("get resolved: true"), log)
  check(
    "the same service is a property of the callback's context",
    log.includes("property access: object"),
    log
  )
  check(
    "the catalog says what the provider publishes",
    JSON.stringify(kernel.ctx.extensions.snapshot().entries.find((e) => e.manifest.id === "test.provider")?.provides) === '["counter"]',
    kernel.ctx.extensions.snapshot().entries.find((e) => e.manifest.id === "test.provider")?.provides
  )
  check(
    "nothing is published while the provider is disabled",
    kernel.ctx.extensions.snapshot().entries.find((e) => e.manifest.id === "test.provider")?.enabled === true
  )

  console.log("withdrawal")

  log.length = 0
  await kernel.ctx.extensions.disable("test.provider")
  check("disabling the provider disconnects the consumer", log.includes("consumer disconnected"), log)
  check("the consumer itself stays loaded", !log.includes("consumer active"))

  log.length = 0
  await kernel.ctx.extensions.enable("test.provider")
  check("enabling it again reconnects the consumer", log.includes("consumer connected"), log)

  console.log("declarations")

  await kernel.ctx.extensions.enable("test.undeclared")
  const refused = kernel.ctx.extensions.snapshot().entries.find((entry) => entry.manifest.id === "test.undeclared")
  check("publishing an undeclared name fails the activation", refused?.status === "error", refused?.status)
  check("the failure names the name and the manifest", (refused?.error ?? "").includes("hidden") && (refused?.error ?? "").includes("manifest does not declare"), refused?.error)
  check("it publishes nothing", refused?.provides.length === 0)

  await kernel.ctx.extensions.disable("test.provider")
  await kernel.ctx.extensions.disable("test.consumer")
  check("disabled entries report nothing published", kernel.ctx.extensions.snapshot().entries.every((entry) => entry.provides.length === 0))

  console.log(`\n${checked - failures}/${checked} checks passed`)
  if (failures > 0) process.exitCode = 1
}

await main()
