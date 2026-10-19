/**
 * The search point and the two helpers every provider shares.
 *
 * A real kernel is composed so the test proves the mechanism the product uses:
 * a module declares `search`, registers a function, and the palette reads it
 * through the catalog — and the registration goes out with the module.
 */
import { beforeAll, describe, expect, it } from "vitest"

import type { PlatformHost } from "../src/host.ts"
import { createHubKernel } from "../src/kernel.ts"
import { matchesQuery, searchPath } from "../src/search.ts"
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

const searchable: ExtensionModule = {
  name: "test.search",
  manifest: {
    name: "Search",
    version: "0.1.0",
    kind: "code",
    category: "integration",
    description: "Offers one search provider.",
    icon: () => null,
    defaultEnabled: true,
  },
  inject: ["search"],

  apply(ctx) {
    ctx.search.register({
      labelKey: "test.search.label",
      icon: () => null,
      search: (query) => [{ id: "one", title: "One", path: searchPath("/test", query) }],
    })
  },
}

type Kernel = Awaited<ReturnType<typeof createHubKernel>>

const entryOf = (kernel: Kernel, id: string) =>
  kernel.ctx.extensions.snapshot().entries.find((entry) => entry.manifest.id === id)

describe("a search provider", () => {
  let kernel: Kernel

  beforeAll(async () => {
    kernel = await createHubKernel({ host: testHost(), extensions: [searchable] })
    await kernel.start()
  })

  it("is contributed under the search point", () => {
    expect(kernel.ctx.extensions.contributions("search").map((one) => one.labelKey)).toEqual([
      "test.search.label",
    ])
    expect(entryOf(kernel, "test.search")?.points).toContain("search")
  })

  it("goes out with the module that registered it", async () => {
    await kernel.ctx.extensions.disable("test.search")
    expect(kernel.ctx.extensions.contributions("search")).toEqual([])
  })
})

describe("the shared search helpers", () => {
  it("builds a page address with the query and the page's own parameters", () => {
    expect(searchPath("/skills", "a&b", { view: "list" })).toBe(
      "/skills?q=a%26b&view=list"
    )
    expect(searchPath("/skills", "  ")).toBe("/skills")
  })

  it("matches a field case-insensitively, and an empty query matches nothing", () => {
    expect(matchesQuery("  PDF ", "pdf-extract", undefined)).toBe(true)
    expect(matchesQuery("pdf", "notes", null)).toBe(false)
    expect(matchesQuery("", "anything")).toBe(false)
  })
})
