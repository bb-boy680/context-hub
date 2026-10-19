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
  refreshExtensionMarket,
} from "../src/lib/extension-market"

function entry(id: string, version: string): ExtensionView {
  return {
    manifest: {
      id,
      name: id,
      version,
      apiVersion: "^0.1",
      kind: "code",
      category: "integration",
      description: "",
      icon: () => null,
    },
    enabled: true,
    status: "active",
    points: [],
    provides: [],
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
          apiVersion: "^0.1",
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
          apiVersion: "^0.1",
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
    const [one] = marketEntriesFor([], INDEX)
    expect(one?.view.manifest).toMatchObject({
      id: "demo.one",
      name: { en: "One", "zh-cn": "一号" },
      version: "2.0.0",
      apiVersion: "^0.1",
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
      marketEntriesFor([entry("demo.one", "1.0.0")], INDEX).map(
        (item) => item.plugin.id
      )
    ).toEqual(["demo.two"])
  })

  it("keeps the localized title and description for the page to resolve", () => {
    const [one] = marketEntriesFor([], INDEX)
    expect(localized(one!.view.manifest.name, "zh-CN")).toBe("一号")
    expect(localized(one!.view.manifest.description, "zh-CN")).toBe("第一")
  })

  it("keeps the index order", () => {
    expect(marketEntriesFor([], INDEX).map((item) => item.plugin.id)).toEqual([
      "demo.one",
      "demo.two",
    ])
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
