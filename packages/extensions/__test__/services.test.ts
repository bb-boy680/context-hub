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
    version: "0.5.0",
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
    kind: "code",
    category: "integration",
    description: "Adds one navigation entry, one header control, and one settings section.",
    icon: () => null,
    defaultEnabled: true,
  },
  inject: ["nav", "header", "settingsSections"],

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
    ctx.settingsSections.register({
      id: "test.settings",
      titleKey: "test.settings.title",
      descriptionKey: "test.settings.description",
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

const future: ExtensionModule = {
  name: "test.future",
  manifest: {
    name: "Future",
    version: "1.0.0",
    engines: { contextHub: ">=9.0.0" },
    kind: "code",
    category: "integration",
    description: "Needs a newer hub.",
    icon: () => null,
    defaultEnabled: true,
  },
  apply() {
    log.push("future applied")
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

  describe("a settings section contribution", () => {
    const sections = () => kernel.ctx.extensions.contributions("settingsSection")

    it("is there, and belongs to the extension that made it", () => {
      expect(sections().map((one) => one.id)).toContain("test.settings")
      expect(entryOf(kernel, "test.contributor")?.points).toContain("settingsSection")
    })

    it("goes out with its extension when it is disabled", async () => {
      await kernel.ctx.extensions.disable("test.contributor")
      expect(sections().map((one) => one.id)).not.toContain("test.settings")
    })

    it("comes back when the extension is enabled again", async () => {
      await kernel.ctx.extensions.enable("test.contributor")
      expect(sections().map((one) => one.id)).toContain("test.settings")
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

describe("a plugin built for another hub version", () => {
  let kernel: Kernel

  beforeAll(async () => {
    log.length = 0
    kernel = await createHubKernel({ host: testHost(), extensions: [future] })
    await kernel.start()
  })

  it("keeps its row, marked incompatible and switched off", () => {
    expect(entryOf(kernel, "test.future")).toMatchObject({
      status: "incompatible",
      enabled: false,
    })
  })

  it("never ran its apply", () => {
    expect(log).not.toContain("future applied")
  })

  it("cannot be switched on", async () => {
    await expect(kernel.ctx.extensions.enable("test.future")).rejects.toThrow(
      /different Context Hub version/
    )
  })
})

/** A host that remembers what the kernel persists, for remove/replace checks. */
function recordingHost(): {
  host: PlatformHost
  documents: Map<string, unknown>
} {
  const documents = new Map<string, unknown>()
  return {
    documents,
    host: {
      form: "Test",
      version: "0.5.0",
      capabilities: { code: true, filesystem: false, network: false },
      storage: {
        read: (key) => documents.get(key) ?? null,
        write: (key, value) => {
          documents.set(key, value)
        },
      },
      net: null,
      files: null,
      log: () => undefined,
    },
  }
}

/** A one-page plugin, so a replacement can be told apart by its route. */
function page(id: string, version: string, path: string): ExtensionModule {
  return {
    name: id,
    manifest: {
      name: id,
      version,
      kind: "code",
      category: "integration",
      description: "",
      icon: () => null,
      defaultEnabled: true,
    },
    inject: ["nav"],
    apply(ctx) {
      ctx.nav.register({
        path,
        labelKey: "test.page",
        icon: () => null,
        group: "assets",
        order: 10,
      })
    },
  }
}

const locked: ExtensionModule = {
  name: "test.locked",
  manifest: {
    name: "Locked",
    version: "1.0.0",
    kind: "builtin",
    category: "integration",
    description: "",
    icon: () => null,
    defaultEnabled: true,
    locked: true,
  },
}

describe("replacing a running extension", () => {
  let kernel: Kernel
  let documents: Map<string, unknown>
  const navPaths = () => kernel.ctx.extensions.contributions("nav").map((one) => one.path)

  beforeAll(async () => {
    const recorded = recordingHost()
    documents = recorded.documents
    kernel = await createHubKernel({
      host: recorded.host,
      extensions: [page("test.page", "1.0.0", "/v1"), locked],
    })
    await kernel.start()
  })

  it("switches the code and its contributions, keeping it enabled", async () => {
    await kernel.ctx.extensions.replace(page("test.page", "2.0.0", "/v2"))

    expect(entryOf(kernel, "test.page")?.manifest.version).toBe("2.0.0")
    expect(navPaths()).toContain("/v2")
    expect(navPaths()).not.toContain("/v1")
    expect(entryOf(kernel, "test.page")?.enabled).toBe(true)
    expect(documents.get("extensions")).toMatchObject({ "test.page": true })
  })

  it("adds an id the catalog does not have", async () => {
    await kernel.ctx.extensions.replace(page("test.added", "1.0.0", "/added"))
    expect(entryOf(kernel, "test.added")?.status).toBe("active")
    expect(navPaths()).toContain("/added")
  })

  it("refuses to replace a locked extension", async () => {
    await expect(
      kernel.ctx.extensions.replace(page("test.locked", "2.0.0", "/locked"))
    ).rejects.toThrow(/cannot be replaced/)
    expect(entryOf(kernel, "test.locked")?.manifest.version).toBe("1.0.0")
  })
})

describe("removing an extension from the running catalog", () => {
  let kernel: Kernel
  let documents: Map<string, unknown>
  const navPaths = () => kernel.ctx.extensions.contributions("nav").map((one) => one.path)

  beforeAll(async () => {
    const recorded = recordingHost()
    documents = recorded.documents
    kernel = await createHubKernel({
      host: recorded.host,
      extensions: [page("test.page", "1.0.0", "/v1"), locked],
    })
    await kernel.start()
  })

  it("withdraws the row and its contributions, and forgets the choice", async () => {
    await kernel.ctx.extensions.remove("test.page")

    expect(entryOf(kernel, "test.page")).toBeUndefined()
    expect(navPaths()).not.toContain("/v1")
    expect(documents.get("extensions")).not.toHaveProperty("test.page")
  })

  it("refuses an unknown id", async () => {
    await expect(kernel.ctx.extensions.remove("test.missing")).rejects.toThrow(/unknown extension/)
  })

  it("refuses a locked extension", async () => {
    await expect(kernel.ctx.extensions.remove("test.locked")).rejects.toThrow(/cannot be removed/)
    expect(entryOf(kernel, "test.locked")).toBeDefined()
  })
})
