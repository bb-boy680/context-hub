/**
 * Behaviour check for the two tracks an extension registers through: the
 * contribution points, which carry data for the screen, and services, which
 * carry an API one extension calls from another.
 *
 * Everything here runs a real kernel over a throwaway host, so what it proves is
 * what the product does: a service published by one extension reaches another
 * that declared it, both come apart again when either side is disabled, and a
 * contribution lives exactly as long as the plugin that made it.
 *
 * Run from the package: `node scripts/check-services.ts`
 */
import { Service } from "@deepseek-ai/cordis"
import type { Context } from "@deepseek-ai/cordis"

import { createHubKernel } from "../src/kernel.ts"
import type { PlatformHost } from "../src/host.ts"
import type { ExtensionModule } from "../src/types.ts"

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

/* The three plugins below are the smallest set that shows the mechanism: one
   publishes a service as a class, one declares it and reads it off its context,
   and one contributes only data. A real module declares its service on `Context`
   so the property is typed; this check does the same, the way MCP does. */

declare module "@deepseek-ai/cordis" {
  interface Context {
    counter: CounterService
  }
}

class CounterService extends Service {
  private count = 0

  constructor(ctx: Context) {
    super(ctx, "counter")
  }

  bump(): number {
    this.count += 1
    return this.count
  }
}

const log: string[] = []

const provider: ExtensionModule = {
  name: "test.provider",
  manifest: {
    name: "Provider",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "integration",
    description: "Publishes a service.",
    icon: () => null,
    defaultEnabled: true,
    provides: ["counter"],
  },
  apply(ctx) {
    new CounterService(ctx)
    log.push("provider active")
  },
}

const consumer: ExtensionModule = {
  name: "test.consumer",
  manifest: {
    name: "Consumer",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "integration",
    description: "Uses that service.",
    icon: () => null,
    defaultEnabled: true,
  },
  /* Declared, not asked for inside `apply`: the kernel holds this extension back
     until the service is published, so every name here is a property of the
     context by the time `apply` runs. */
  inject: ["counter"],

  apply(ctx) {
    log.push("consumer active")
    log.push(`property access: ${typeof ctx.counter}`)
    log.push(`bumped: ${ctx.counter.bump()}`)
    log.push(`get resolved: ${String(ctx.get("counter") !== undefined)}`)
  },
}

const contributor: ExtensionModule = {
  name: "test.contributor",
  manifest: {
    name: "Contributor",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "integration",
    description: "Adds one navigation entry.",
    icon: () => null,
    defaultEnabled: true,
  },
  inject: ["nav"],

  apply(ctx) {
    ctx.nav.register({
      path: "/test",
      labelKey: "test.nav",
      icon: () => null,
      group: "assets",
      order: 99,
    })
    log.push("contributor applied")
  },
}

async function main(): Promise<void> {
  const kernel = await createHubKernel({
    host: testHost(),
    extensions: [provider, consumer, contributor],
  })
  await kernel.start()

  console.log("services")

  check("the provider activated", log.includes("provider active"))
  check("the consumer activated without the provider loaded first", log.includes("consumer active"))
  check("the service is a property of the consumer's context", log.includes("property access: object"), log)
  check("and calling it works", log.includes("bumped: 1"), log)
  check("the context can also reach it by name", log.includes("get resolved: true"), log)
  check(
    "the catalog reports what the provider declares it publishes",
    kernel.ctx.extensions
      .snapshot()
      .entries.find((entry) => entry.manifest.id === "test.provider")
      ?.provides.join(",") === "counter"
  )

  console.log("withdrawal")

  log.length = 0
  await kernel.ctx.extensions.disable("test.provider")
  check("disabling the provider unloads the consumer that required it", !log.includes("consumer active"), log)
  check("its service is out of the context", kernel.ctx.get("counter") === undefined)

  log.length = 0
  await kernel.ctx.extensions.enable("test.provider")
  check("enabling it again brings the consumer back", log.includes("consumer active"), log)
  check("and the consumer reconnects to the service", log.includes("bumped: 1"), log)

  console.log("contributions")

  const nav = () => kernel.ctx.extensions.contributions("nav")
  check("the contributor's entry is there", nav().some((one) => one.path === "/test"), nav())
  check(
    "and belongs to it in the catalog",
    kernel.ctx.extensions
      .snapshot()
      .entries.find((entry) => entry.manifest.id === "test.contributor")
      ?.points.includes("nav") === true
  )

  await kernel.ctx.extensions.disable("test.contributor")
  check("disabling it takes its entry out with it", !nav().some((one) => one.path === "/test"), nav())

  await kernel.ctx.extensions.enable("test.contributor")
  check("and enabling it puts the entry back", nav().some((one) => one.path === "/test"), nav())

  console.log("a plugin that declares a service nothing publishes")

  const waiting: ExtensionModule = {
    name: "test.waiting",
    manifest: {
      name: "Waiting",
      version: "0.1.0",
      apiVersion: "^0.1",
      kind: "code",
      category: "integration",
      description: "Requires a service no one provides.",
      icon: () => null,
      defaultEnabled: true,
    },
    inject: ["never-provided"],
    apply() {
      log.push("waiting applied")
    },
  }
  kernel.ctx.extensions.snapshot()
  const withWaiting = await createHubKernel({
    host: testHost(),
    extensions: [waiting],
  })
  await withWaiting.start()
  const entry = withWaiting.ctx.extensions.snapshot().entries[0]
  check("it stays waiting rather than running half-registered", entry?.status === "waiting", entry?.status)
  check("and its apply never ran", !log.includes("waiting applied"))

  console.log(`\n${checked - failures}/${checked} checks passed`)
  if (failures > 0) process.exitCode = 1
}

await main()
