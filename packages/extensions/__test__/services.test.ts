/**
 * Behaviour of the two tracks an extension registers through: the contribution
 * points, which carry data for the screen, and services, which carry an API one
 * extension calls from another.
 *
 * Everything here runs a real kernel over a throwaway host, so what it proves is
 * what the product does: a service published by one extension reaches another
 * that declared it, both come apart again when either side is disabled, and a
 * contribution lives exactly as long as the plugin that made it.
 *
 * The three plugins below are the smallest set that shows the mechanism: one
 * publishes a service as a class, one declares it and reads it off its context,
 * and one contributes only data. A real module declares its service on `Context`
 * so the property is typed; this check does the same, the way MCP does.
 */
import { Service } from "@deepseek-ai/cordis"
import type { Context } from "@deepseek-ai/cordis"
import { beforeAll, describe, expect, it } from "vitest"

import { createHubKernel } from "../src/kernel.ts"
import type { PlatformHost } from "../src/host.ts"
import type { ExtensionModule } from "../src/types.ts"

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

/** What each plugin did, in order; the tests read it rather than the kernel's guts. */
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
    description: "Adds one navigation entry and one header control.",
    icon: () => null,
    defaultEnabled: true,
  },
  inject: ["nav", "header"],

  apply(ctx) {
    ctx.nav.register({
      path: "/test",
      labelKey: "test.nav",
      icon: () => null,
      group: "assets",
      order: 99,
    })
    ctx.header.register({
      id: "test.header",
      order: 50,
      Component: () => null,
    })
    log.push("contributor applied")
  },
}

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

type Kernel = Awaited<ReturnType<typeof createHubKernel>>

/** One extension's row in the catalog, by the id its module declares. */
const entryOf = (kernel: Kernel, id: string) =>
  kernel.ctx.extensions.snapshot().entries.find((entry) => entry.manifest.id === id)

describe("a kernel of three plugins", () => {
  let kernel: Kernel

  beforeAll(async () => {
    kernel = await createHubKernel({
      host: testHost(),
      extensions: [provider, consumer, contributor],
    })
    await kernel.start()
  })

  describe("a service one extension publishes to another", () => {
    it("activated both, whichever order they loaded in", () => {
      expect(log, "the provider").toContain("provider active")
      expect(log, "the consumer").toContain("consumer active")
    })

    it("is a property of the consumer's context", () => {
      expect(log).toContain("property access: object")
    })

    it("can also be reached by name, and calling it works", () => {
      expect(log).toContain("bumped: 1")
      expect(log).toContain("get resolved: true")
    })

    it("is what the catalog reports the provider publishes", () => {
      expect(entryOf(kernel, "test.provider")?.provides).toEqual(["counter"])
    })
  })

  describe("withdrawing the provider", () => {
    it("unloads the consumer that required it, and takes the service out", async () => {
      log.length = 0
      await kernel.ctx.extensions.disable("test.provider")
      expect(log, "the consumer stayed loaded").not.toContain("consumer active")
      expect(kernel.ctx.get("counter")).toBeUndefined()
    })

    it("brings the consumer back, reconnected, when the provider returns", async () => {
      log.length = 0
      await kernel.ctx.extensions.enable("test.provider")
      expect(log).toContain("consumer active")
      expect(log).toContain("bumped: 1")
    })
  })

  describe("a contribution", () => {
    const nav = () => kernel.ctx.extensions.contributions("nav")

    it("is there, and belongs to the extension that made it", () => {
      expect(nav().map((one) => one.path)).toContain("/test")
      expect(entryOf(kernel, "test.contributor")?.points).toContain("nav")
    })

    it("goes out with its extension when it is disabled", async () => {
      await kernel.ctx.extensions.disable("test.contributor")
      expect(nav().map((one) => one.path)).not.toContain("/test")
    })

    it("comes back when the extension is enabled again", async () => {
      await kernel.ctx.extensions.enable("test.contributor")
      expect(nav().map((one) => one.path)).toContain("/test")
    })
  })

  describe("a header contribution", () => {
    const header = () => kernel.ctx.extensions.contributions("header")

    it("is there, and belongs to the extension that made it", () => {
      expect(header().map((one) => one.id)).toContain("test.header")
      expect(entryOf(kernel, "test.contributor")?.points).toContain("header")
    })

    it("goes out with its extension when it is disabled", async () => {
      await kernel.ctx.extensions.disable("test.contributor")
      expect(header().map((one) => one.id)).not.toContain("test.header")
    })

    it("comes back when the extension is enabled again", async () => {
      await kernel.ctx.extensions.enable("test.contributor")
      expect(header().map((one) => one.id)).toContain("test.header")
    })
  })
})

describe("a plugin that declares a service nothing publishes", () => {
  let kernel: Kernel

  beforeAll(async () => {
    kernel = await createHubKernel({ host: testHost(), extensions: [waiting] })
    await kernel.start()
  })

  it("stays waiting rather than running half-registered", () => {
    expect(entryOf(kernel, "test.waiting")?.status).toBe("waiting")
  })

  it("never ran its apply", () => {
    expect(log).not.toContain("waiting applied")
  })
})
