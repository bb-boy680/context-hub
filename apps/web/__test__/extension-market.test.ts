/**
 * Shaping a market index into catalog rows.
 *
 * The page renders these beside the kernel's own rows, so the shape must match:
 * an uninstalled entry has a manifest, an icon component, and the same category
 * it will land in after installation.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { localized, type ExtensionMarketIndex } from "@context-hub/core/extension-market"
import type { ExtensionView } from "@context-hub/extensions"

import {
  marketEntriesFor,
  marketUpdatesFor,
  refreshExtensionMarket,
} from "../src/lib/extension-market"

const HUB_VERSION = "0.5.0"

function entry(id: string, version: string): ExtensionView {
  return {
    manifest: {
      id,
      name: id,
      version,
      kind: "code",
      category: "integration",
      description: "",
      icon: () => null,
    },
    enabled: true,
    status: "active",
    points: [],
    provides: [],
    stored: false,
  }
}

const INDEX: ExtensionMarketIndex = {
  format: 1,
  title: "Market",
  plugins: [
    {
      id: "demo.one",
      title: { en: "One", "zh-cn": "一号" },
      description: { en: "First", "zh-cn": "第一" },
      icon: "https://example.test/one.svg",
      author: "Acme",
      category: "agent",
      versions: [
        {
          version: "2.0.0",
          engines: { contextHub: ">=0.0.1 <0.7.0" },
          source: {
            type: "git",
            url: "https://example.test/repo",
          },
        },
      ],
    },
    {
      id: "demo.two",
      title: "Two",
      description: "Second",
      icon: "https://example.test/two.svg",
      author: "Acme",
      category: "integration",
      versions: [
        {
          version: "1.0.0",
          engines: { contextHub: ">=0.0.1 <0.7.0" },
          source: {
            type: "git",
            url: "https://example.test/repo",
          },
        },
      ],
    },
  ],
}

describe("marketEntriesFor", () => {
  it("shapes an uninstalled entry like a catalog row", () => {
    const [one] = marketEntriesFor([], INDEX, HUB_VERSION)
    expect(one?.view.manifest).toMatchObject({
      id: "demo.one",
      name: { en: "One", "zh-cn": "一号" },
      version: "2.0.0",
      engines: { contextHub: ">=0.0.1 <0.7.0" },
      kind: "code",
      category: "agent",
      description: { en: "First", "zh-cn": "第一" },
    })
    expect(one?.view.enabled).toBe(false)
    expect(one?.view.status).toBe("inactive")
    expect(typeof one?.view.manifest.icon).toBe("function")
  })

  it("does not duplicate an id the kernel already has", () => {
    expect(
      marketEntriesFor([entry("demo.one", "1.0.0")], INDEX, HUB_VERSION).map(
        (item) => item.plugin.id
      )
    ).toEqual(["demo.two"])
  })

  it("keeps the localized title and description for the page to resolve", () => {
    const [one] = marketEntriesFor([], INDEX, HUB_VERSION)
    expect(localized(one!.view.manifest.name, "zh-CN")).toBe("一号")
    expect(localized(one!.view.manifest.description, "zh-CN")).toBe("第一")
  })

  it("keeps the index order", () => {
    expect(marketEntriesFor([], INDEX, HUB_VERSION).map((item) => item.plugin.id)).toEqual([
      "demo.one",
      "demo.two",
    ])
  })

  it("marks a plugin with no compatible version instead of hiding it", () => {
    const future: ExtensionMarketIndex = {
      ...INDEX,
      plugins: [
        {
          ...INDEX.plugins[0]!,
          versions: [
            {
              version: "9.0.0",
              engines: { contextHub: ">=9.0.0" },
              source: INDEX.plugins[0]!.versions[0]!.source,
            },
          ],
        },
      ],
    }
    const [one] = marketEntriesFor([], future, HUB_VERSION)
    expect(one?.version).toBeNull()
    expect(one?.view.status).toBe("incompatible")
    expect(one?.view.manifest.version).toBe("9.0.0")
    expect(one?.view.manifest.engines).toEqual({ contextHub: ">=9.0.0" })
  })

  it("picks the first version this hub satisfies", () => {
    const mixed: ExtensionMarketIndex = {
      ...INDEX,
      plugins: [
        {
          ...INDEX.plugins[0]!,
          versions: [
            {
              version: "9.0.0",
              engines: { contextHub: ">=9.0.0" },
              source: INDEX.plugins[0]!.versions[0]!.source,
            },
            {
              version: "2.0.0",
              engines: { contextHub: ">=0.1.0 <0.7.0" },
              source: INDEX.plugins[0]!.versions[0]!.source,
            },
          ],
        },
      ],
    }
    expect(marketEntriesFor([], mixed, HUB_VERSION)[0]?.version?.version).toBe("2.0.0")
  })
})

describe("marketUpdatesFor", () => {
  it("offers a compatible newer version to an installed plugin", () => {
    const updates = marketUpdatesFor([entry("demo.one", "1.0.0")], INDEX, HUB_VERSION)
    expect(updates.get("demo.one")?.target?.version).toBe("2.0.0")
  })

  it("offers nothing when the installed version is the target", () => {
    expect(
      marketUpdatesFor([entry("demo.one", "2.0.0")], INDEX, HUB_VERSION).size
    ).toBe(0)
  })

  it("reports a listing whose only versions are incompatible", () => {
    const future: ExtensionMarketIndex = {
      ...INDEX,
      plugins: [
        {
          ...INDEX.plugins[0]!,
          versions: [
            {
              version: "9.0.0",
              engines: { contextHub: ">=9.0.0" },
              source: INDEX.plugins[0]!.versions[0]!.source,
            },
          ],
        },
      ],
    }
    const update = marketUpdatesFor([entry("demo.one", "1.0.0")], future, HUB_VERSION).get(
      "demo.one"
    )
    expect(update?.target).toBeNull()
    expect(update?.latest.version).toBe("9.0.0")
  })

  it("ignores a plugin this machine does not have", () => {
    expect(marketUpdatesFor([], INDEX, HUB_VERSION).size).toBe(0)
  })
})

describe("refreshExtensionMarket", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("reads past the cache and broadcasts the new index", async () => {
    const fetchMock = vi.fn<
      (url: string, init: RequestInit) => Promise<Response>
    >(
      async () =>
        new Response(JSON.stringify({ index: INDEX }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    )
    const dispatch = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    vi.stubGlobal("window", { dispatchEvent: dispatch })

    const index = await refreshExtensionMarket(
      "https://example.test/market.json"
    )

    expect(index).toEqual(INDEX)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/hub/extension-market")
    expect(init.method).toBe("POST")
    expect(JSON.parse(String(init.body))).toEqual({
      action: "list",
      url: "https://example.test/market.json",
      refresh: true,
    })
    expect(dispatch).toHaveBeenCalledTimes(1)
    const event = dispatch.mock.calls[0]?.[0] as CustomEvent
    expect(event.type).toBe("context-hub:market-refreshed")
    expect(event.detail).toEqual({
      url: "https://example.test/market.json",
      index: INDEX,
    })
  })
})
