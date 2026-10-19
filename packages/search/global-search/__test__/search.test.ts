/**
 * The two shell searches: settings, whose rows are a table this package owns,
 * and extensions, whose rows are the kernel's live catalog.
 */
import { describe, expect, it } from "vitest"

import type {
  ExtensionView,
  SettingsSectionContribution,
} from "@context-hub/extensions"

import { searchExtensions, searchSettings } from "../src/search.ts"

/** Only the words these cases ask for, so a missing key is visible as the key. */
const words: Record<string, string> = {
  "settings.theme.title": "Theme",
  "settings.theme.description": "Follow the system's dark and light setting.",
  "settings.images.title": "Images",
  "settings.images.description": "Covers can stay remote or be downloaded.",
  "settings.images.download.title": "Download remote cover images",
  "settings.images.download.description": "Save http(s) images locally.",
  "settings.extensions.title": "Extension updates",
  "settings.extensions.description": "When the hub reads the extension market again.",
  "settings.extensions.check": "Check for updates",
  "settings.extensions.check.description": "Manual, startup, or daily.",
  "settings.extensions.dailyAt": "Time of day",
  "settings.extensions.dailyAt.description": "Local time the daily check runs.",
  "settings.extensions.autoUpdate": "Install updates automatically",
  "settings.extensions.autoUpdate.description": "Install a compatible newer version.",
  "settings.appearance.title": "Appearance & layout",
  "settings.appearance.description": "Theme, language, and the default view.",
  "settings.about.title": "About",
  "settings.about.description": "Version and where the files live.",
  "settings.about.version": "Version",
  "skills.settings.title": "Skill updates",
  "skills.settings.description": "When the hub checks skill sources.",
}
const t = (key: string) => words[key] ?? key

const section: SettingsSectionContribution = {
  id: "skills-updates",
  titleKey: "skills.settings.title",
  descriptionKey: "skills.settings.description",
  Component: () => null,
}

const extension = (overrides: Partial<ExtensionView["manifest"]> = {}): ExtensionView => ({
  manifest: {
    id: "acme.hello",
    name: "Hello",
    version: "0.1.0",
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
  stored: false,
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

  it("finds the extension update rows under their own anchor", () => {
    expect(searchSettings(t, "time of day")).toEqual([
      {
        id: "extensions:settings.extensions.dailyAt",
        title: "Time of day",
        description: "Local time the daily check runs.",
        path: "/settings?q=time+of+day#extensions",
      },
    ])
  })

  it("returns nothing for an empty query", () => {
    expect(searchSettings(t, "")).toEqual([])
  })

  it("finds a contributed section and opens its anchor", () => {
    expect(searchSettings(t, "skill updates", [section])).toEqual([
      {
        id: "settings-section:skills-updates",
        title: "Skill updates",
        description: "When the hub checks skill sources.",
        path: "/settings?q=skill+updates#skills-updates",
      },
    ])
  })

  it("leaves contributed sections out when none are passed", () => {
    expect(searchSettings(t, "skill updates")).toEqual([])
  })
})

describe("searching the extensions", () => {
  it("matches the name, id, or description the page's filter reads", () => {
    const entries = [extension(), extension({ id: "acme.other", name: "Other", description: "Different" })]
    expect(searchExtensions(entries, "hello", "en").map((one) => one.title)).toEqual(["Hello"])
    expect(searchExtensions(entries, "acme.other", "en").map((one) => one.title)).toEqual(["Other"])
    expect(searchExtensions(entries, "different", "en").map((one) => one.title)).toEqual(["Other"])
  })

  it("resolves a localized name and description with the active locale", () => {
    const entry = extension({
      name: { en: "Hello", "zh-cn": "你好" },
      description: { en: "Says hello", "zh-cn": "打招呼" },
    })
    expect(searchExtensions([entry], "你好", "zh-cn").map((one) => one.title)).toEqual(["你好"])
    expect(searchExtensions([entry], "hello", "zh-cn").map((one) => one.title)).toEqual(["你好"])
  })

  it("keeps the package's own mark and opens the extensions page", () => {
    const icon = () => null
    const [row] = searchExtensions([extension({ icon })], "hello", "en")
    expect(row?.icon).toBe(icon)
    expect(row?.path).toBe("/extensions?q=hello")
  })

  it("returns nothing for an empty query", () => {
    expect(searchExtensions([extension()], "", "en")).toEqual([])
  })
})
