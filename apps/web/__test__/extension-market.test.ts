/**
 * Shaping a market index into catalog rows.
 *
 * The page renders these beside the kernel's own rows, so the shape must match:
 * an uninstalled entry has a manifest, an icon component, and the same category
 * it will land in after installation.
 */
import { describe, expect, it } from "vitest"

import type { ExtensionMarketIndex } from "@context-hub/core/extension-market"
import type { ExtensionView } from "@context-hub/extensions"

import { marketEntriesFor } from "../src/lib/extension-market"

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
    const [one] = marketEntriesFor([], INDEX, "en")
    expect(one?.view.manifest).toMatchObject({
      id: "demo.one",
      name: "One",
      version: "2.0.0",
      apiVersion: "^0.1",
      kind: "code",
      category: "agent",
      description: "First",
    })
    expect(one?.view.enabled).toBe(false)
    expect(one?.view.status).toBe("inactive")
    expect(typeof one?.view.manifest.icon).toBe("function")
  })

  it("does not duplicate an id the kernel already has", () => {
    expect(
      marketEntriesFor([entry("demo.one", "1.0.0")], INDEX, "en").map(
        (item) => item.plugin.id
      )
    ).toEqual(["demo.two"])
  })

  it("localizes the title and description", () => {
    const [one] = marketEntriesFor([], INDEX, "zh-CN")
    expect(one?.view.manifest.name).toBe("一号")
    expect(one?.view.manifest.description).toBe("第一")
  })

  it("keeps the index order", () => {
    expect(marketEntriesFor([], INDEX, "en").map((item) => item.plugin.id)).toEqual([
      "demo.one",
      "demo.two",
    ])
  })
})
