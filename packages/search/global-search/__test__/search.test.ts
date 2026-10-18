/**
 * The two shell searches: settings, whose rows are a table this package owns,
 * and extensions, whose rows are the kernel's live catalog.
 */
import { describe, expect, it } from "vitest"

import type { ExtensionView } from "@context-hub/extensions"

import { searchExtensions, searchSettings } from "../src/search.ts"

/** Only the words these cases ask for, so a missing key is visible as the key. */
const words: Record<string, string> = {
  "settings.theme.title": "Theme",
  "settings.theme.description": "Follow the system's dark and light setting.",
  "settings.images.title": "Images",
  "settings.images.description": "Covers can stay remote or be downloaded.",
  "settings.images.download.title": "Download remote cover images",
  "settings.images.download.description": "Save http(s) images locally.",
  "settings.appearance.title": "Appearance & layout",
  "settings.appearance.description": "Theme, language, and the default view.",
  "settings.about.title": "About",
  "settings.about.description": "Version and where the files live.",
  "settings.about.version": "Version",
}
const t = (key: string) => words[key] ?? key

const extension = (overrides: Partial<ExtensionView["manifest"]> = {}): ExtensionView => ({
  manifest: {
    id: "acme.hello",
    name: "Hello",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "integration",
    description: "Says hello",
    icon: () => null,
    ...overrides,
  },
  enabled: true,
  status: "active",
  points: [],
  provides: [],
})

describe("searching the settings", () => {
  it("finds a row by its own words and opens its group", () => {
    expect(searchSettings(t, "dark")).toEqual([
      {
        id: "appearance:settings.theme.title",
        title: "Theme",
        description: "Follow the system's dark and light setting.",
        path: "/settings?q=dark#appearance",
      },
    ])
  })

  it("finds a row through the group it sits in", () => {
    const [row] = searchSettings(t, "images")
    expect(row?.title).toBe("Download remote cover images")
    expect(row?.path).toBe("/settings?q=images#images")
  })

  it("returns nothing for an empty query", () => {
    expect(searchSettings(t, "")).toEqual([])
  })
})

describe("searching the extensions", () => {
  it("matches the name, id, or description the page's filter reads", () => {
    const entries = [extension(), extension({ id: "acme.other", name: "Other", description: "Different" })]
    expect(searchExtensions(entries, "hello").map((one) => one.title)).toEqual(["Hello"])
    expect(searchExtensions(entries, "acme.other").map((one) => one.title)).toEqual(["Other"])
    expect(searchExtensions(entries, "different").map((one) => one.title)).toEqual(["Other"])
  })

  it("keeps the package's own mark and opens the extensions page", () => {
    const icon = () => null
    const [row] = searchExtensions([extension({ icon })], "hello")
    expect(row?.icon).toBe(icon)
    expect(row?.path).toBe("/extensions?q=hello")
  })

  it("returns nothing for an empty query", () => {
    expect(searchExtensions([extension()], "")).toEqual([])
  })
})
