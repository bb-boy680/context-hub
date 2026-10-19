/**
 * The market index rules.
 *
 * A market document is third-party input that decides where code is fetched
 * from, so every rule here is a refusal: a malformed entry rejects the whole
 * document rather than disappearing from the list.
 */
import { describe, expect, it } from "vitest"

import {
  isMarketIndexUrl,
  isMarketSource,
  localized,
  readMarketIndex,
  recommendedVersion,
  type ExtensionMarketPlugin,
} from "../src/extension-market.ts"

const INDEX_URL = "https://example.test/marketplace.json"

const VERSION = {
  version: "1.0.0",
  apiVersion: "^0.1",
  source: {
    type: "git" as const,
    url: "https://github.com/acme/plugins",
    path: "plugins/acme.hello",
  },
}

const PLUGIN = {
  id: "acme.hello",
  title: { en: "Hello", "zh-cn": "你好" },
  description: "A plugin",
  icon: "icons/hello.svg",
  author: "Acme",
  category: "integration",
  permissions: ["filesystem"],
  versions: [VERSION],
}

function index(plugins: unknown[] = [PLUGIN]): Record<string, unknown> {
  return { format: 1, title: "Test market", plugins }
}

function plugin(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...PLUGIN, ...patch }
}

function version(patch: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...VERSION, ...patch }
}

describe("a market index", () => {
  it("reads the required fields and resolves a relative icon", () => {
    expect(readMarketIndex(index(), INDEX_URL)).toEqual({
      format: 1,
      title: "Test market",
      plugins: [
        {
          id: "acme.hello",
          title: { en: "Hello", "zh-cn": "你好" },
          description: "A plugin",
          icon: "https://example.test/icons/hello.svg",
          author: "Acme",
          category: "integration",
          permissions: ["filesystem"],
          versions: [
            {
              version: "1.0.0",
              apiVersion: "^0.1",
              source: {
                type: "git",
                url: "https://github.com/acme/plugins",
                path: "plugins/acme.hello",
              },
            },
          ],
        },
      ],
    })
  })

  it("allows an empty plugin list", () => {
    expect(readMarketIndex(index([]), INDEX_URL).plugins).toEqual([])
  })

  it("refuses an unsupported format", () => {
    expect(() => readMarketIndex({ ...index(), format: 2 }, INDEX_URL)).toThrow(/format must be 1/)
  })

  it("refuses a plugin list that is not an array", () => {
    expect(() => readMarketIndex({ ...index(), plugins: {} }, INDEX_URL)).toThrow(
      /plugins must be an array/
    )
  })

  it("includes the JSON path of the first violation", () => {
    expect(() =>
      readMarketIndex(
        index([plugin({ versions: [version({ source: { ...VERSION.source, url: "http://example.test/repo" } })] })]),
        INDEX_URL
      )
    ).toThrow(/plugins\[0\]\.versions\[0\]\.source\.url/)
  })

  it("ignores unknown members", () => {
    expect(readMarketIndex({ ...index(), future: true }, INDEX_URL)).not.toHaveProperty("future")
  })
})

describe("localized text", () => {
  it("accepts a string", () => {
    expect(readMarketIndex({ ...index(), title: "Plain" }, INDEX_URL).title).toBe("Plain")
  })

  it("requires English in an object", () => {
    expect(() => readMarketIndex({ ...index(), title: { "zh-cn": "你好" } }, INDEX_URL)).toThrow(
      /must include "en"/
    )
  })

  it("refuses a locale id that is not lowercase", () => {
    expect(() =>
      readMarketIndex({ ...index(), title: { en: "Hello", "zh-CN": "你好" } }, INDEX_URL)
    ).toThrow(/is not a locale id/)
  })

  it("refuses an empty translation", () => {
    expect(() =>
      readMarketIndex({ ...index(), title: { en: "Hello", "zh-cn": " " } }, INDEX_URL)
    ).toThrow(/must be a non-empty string/)
  })
})

describe("a plugin entry", () => {
  it("refuses an unusable id", () => {
    expect(() => readMarketIndex(index([plugin({ id: "Bad Id" })]), INDEX_URL)).toThrow(
      /is not a usable plugin id/
    )
  })

  it("refuses two ids that differ only in case", () => {
    expect(() => readMarketIndex(index([plugin(), plugin({ id: "acme.hellO" })]), INDEX_URL)).toThrow(
      /is listed twice/
    )
  })

  it("requires a description and an author", () => {
    expect(() => readMarketIndex(index([plugin({ description: "" })]), INDEX_URL)).toThrow(
      /plugins\[0\]\.description/
    )
    expect(() => readMarketIndex(index([plugin({ author: " " })]), INDEX_URL)).toThrow(
      /plugins\[0\]\.author/
    )
  })

  it("refuses an unknown category or permission", () => {
    expect(() => readMarketIndex(index([plugin({ category: "other" })]), INDEX_URL)).toThrow(
      /is not a known category/
    )
    expect(() => readMarketIndex(index([plugin({ permissions: ["everything"] })]), INDEX_URL)).toThrow(
      /must list known permissions/
    )
  })
})

describe("an icon", () => {
  it("keeps an absolute https URL", () => {
    expect(
      readMarketIndex(index([plugin({ icon: "https://cdn.example.test/hello.svg" })]), INDEX_URL)
        .plugins[0]!.icon
    ).toBe("https://cdn.example.test/hello.svg")
  })

  it("accepts an inline image", () => {
    const icon = `data:image/png;base64,${"A".repeat(4)}`
    expect(readMarketIndex(index([plugin({ icon })]), INDEX_URL).plugins[0]!.icon).toBe(icon)
  })

  it("refuses an inline image larger than 32 KiB", () => {
    const icon = `data:image/png;base64,${"A".repeat(43700)}`
    expect(() => readMarketIndex(index([plugin({ icon })]), INDEX_URL)).toThrow(/larger than/)
  })

  it("refuses a plain http icon", () => {
    expect(() =>
      readMarketIndex(index([plugin({ icon: "http://example.test/hello.svg" })]), INDEX_URL)
    ).toThrow(/must resolve to https/)
  })

  it("refuses a fragment or credentials", () => {
    expect(() =>
      readMarketIndex(index([plugin({ icon: "https://example.test/hello.svg#x" })]), INDEX_URL)
    ).toThrow(/credentials or a fragment/)
  })
})

describe("a version", () => {
  it("refuses an empty list", () => {
    expect(() => readMarketIndex(index([plugin({ versions: [] })]), INDEX_URL)).toThrow(
      /non-empty array/
    )
  })

  it("refuses a duplicate version", () => {
    expect(() =>
      readMarketIndex(index([plugin({ versions: [VERSION, VERSION] })]), INDEX_URL)
    ).toThrow(/lists version "1.0.0" twice/)
  })

  it("refuses whitespace or an overlong version", () => {
    expect(() =>
      readMarketIndex(index([plugin({ versions: [version({ version: "1.0.0 beta" })] })]), INDEX_URL)
    ).toThrow(/without whitespace/)
    expect(() =>
      readMarketIndex(
        index([plugin({ versions: [version({ version: "1".repeat(65) })] })]),
        INDEX_URL
      )
    ).toThrow(/at most 64/)
  })

  it("refuses a source that is not git", () => {
    expect(() =>
      readMarketIndex(
        index([plugin({ versions: [version({ source: { ...VERSION.source, type: "npm" } })] })]),
        INDEX_URL
      )
    ).toThrow(/must be "git"/)
  })

  it("refuses a repository URL that is not https or not a repository", () => {
    for (const url of [
      "http://github.com/acme/plugins",
      "https://user:secret@github.com/acme/plugins",
      "https://github.com/acme/plugins?x=1",
      "https://github.com/acme/plugins#readme",
      "https://github.com/acme",
      "https://github.com/acme/plugins/",
      "https://github.com/acme/plugins.tar.gz",
    ]) {
      expect(() =>
        readMarketIndex(
          index([plugin({ versions: [version({ source: { ...VERSION.source, url } })] })]),
          INDEX_URL
        )
      ).toThrow()
    }
  })

  it("refuses a path that leaves the repository", () => {
    for (const at of ["../plugins", "/plugins", "plugins\\hello", "plugins//hello"]) {
      expect(() =>
        readMarketIndex(
          index([plugin({ versions: [version({ source: { ...VERSION.source, path: at } })] })]),
          INDEX_URL
        )
      ).toThrow(/relative POSIX path|unusable segment/)
    }
  })

  it("refuses an incompatible apiVersion", () => {
    expect(() =>
      readMarketIndex(
        index([plugin({ versions: [version({ apiVersion: "9.9" })] })]),
        INDEX_URL
      )
    ).toThrow(/apiVersion/)
  })
})

describe("localized", () => {
  const text = { en: "Hello", "zh-cn": "你好", zh: "繁體" }

  it("prefers the exact locale, then the language, then English", () => {
    expect(localized(text, "zh-CN")).toBe("你好")
    expect(localized({ en: "Hello", zh: "繁體" }, "zh-CN")).toBe("繁體")
    expect(localized(text, "fr")).toBe("Hello")
    expect(localized("Plain", "fr")).toBe("Plain")
  })
})

describe("recommendedVersion", () => {
  it("returns the first listed version", () => {
    const entry: ExtensionMarketPlugin = {
      id: "acme.hello",
      title: "Hello",
      description: "A plugin",
      icon: "https://example.test/hello.svg",
      author: "Acme",
      versions: [
        { version: "2.0.0", apiVersion: "^0.1", source: VERSION.source },
        { version: "1.0.0", apiVersion: "^0.1", source: VERSION.source },
      ],
    }
    expect(recommendedVersion(entry).version).toBe("2.0.0")
  })
})

describe("isMarketIndexUrl", () => {
  it("returns the canonical https URL", () => {
    expect(isMarketIndexUrl("  https://example.test/marketplace.json  ")).toBe(
      "https://example.test/marketplace.json"
    )
  })

  it("maps a GitHub repository URL to the raw default-branch index", () => {
    expect(isMarketIndexUrl("https://github.com/bb-boy680/context-hub-extensions")).toBe(
      "https://raw.githubusercontent.com/bb-boy680/context-hub-extensions/main/marketplace.json"
    )
    expect(isMarketIndexUrl("https://github.com/acme/plugins.git")).toBe(
      "https://raw.githubusercontent.com/acme/plugins/main/marketplace.json"
    )
  })

  it("refuses a GitHub page that is not a repository root", () => {
    expect(() => isMarketIndexUrl("https://github.com/acme/plugins/tree/main")).toThrow(
      /repository URL/
    )
  })

  it("refuses http, credentials, fragments and non-URLs", () => {
    for (const value of [
      "http://example.test/marketplace.json",
      "https://user:secret@example.test/marketplace.json",
      "https://example.test/marketplace.json#x",
      "not a url",
    ]) {
      expect(() => isMarketIndexUrl(value)).toThrow()
    }
  })
})

describe("isMarketSource", () => {
  it("accepts an https URL or an absolute local path", () => {
    expect(isMarketSource("https://example.test/marketplace.json")).toBe(
      "https://example.test/marketplace.json"
    )
    expect(isMarketSource("https://github.com/acme/plugins")).toBe(
      "https://raw.githubusercontent.com/acme/plugins/main/marketplace.json"
    )
    expect(isMarketSource("D:\\work\\extensions")).toBe("D:\\work\\extensions")
    expect(isMarketSource("/home/me/extensions")).toBe("/home/me/extensions")
  })

  it("refuses http and a local path with a fragment", () => {
    expect(() => isMarketSource("http://example.test/marketplace.json")).toThrow()
    expect(() => isMarketSource("D:\\work\\extensions#x")).toThrow()
  })
})

describe("a local version source", () => {
  it("is accepted only when the index came from disk", () => {
    const local = plugin({
      icon: "https://example.test/icon.svg",
      versions: [version({ source: { ...VERSION.source, url: "D:/repo" } })],
    })
    expect(
      readMarketIndex(index([local]), "file:///D:/repo/marketplace.json", {
        allowLocalGit: true,
      }).plugins[0]!.versions[0]!.source.url
    ).toBe("D:/repo")
    expect(() => readMarketIndex(index([local]), INDEX_URL)).toThrow()
  })
})
