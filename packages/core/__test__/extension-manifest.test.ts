/**
 * The manifest and package rules the host and the loader share.
 *
 * The loader's own behaviour is covered through `discoverPlugins`; this suite
 * pins the pure rules a downloaded `plugin.yaml` and `package.json` must
 * satisfy before a plugin is ever imported.
 */
import { describe, expect, it } from "vitest"

import {
  isCompatible,
  parsePluginManifest,
  parsePluginManifestYaml,
  parsePluginPackage,
  readPluginPackage,
} from "../src/extension-manifest.ts"

const RANGE = { contextHub: ">=0.0.0 <0.7.0" }

const VALID = {
  id: "acme.hello",
  name: "Hello",
  engines: RANGE,
}

describe("compatibility with a hub version", () => {
  it("lets a prerelease satisfy the range it belongs to", () => {
    expect(isCompatible(RANGE, "0.0.1-beta.5")).toBe(true)
    expect(isCompatible(RANGE, "0.5.0")).toBe(true)
    expect(isCompatible(RANGE, "0.7.0")).toBe(false)
  })

  it("compares against the hub version, not an API version", () => {
    expect(isCompatible({ contextHub: ">=0.1.0 <0.7.0" }, "0.0.1-beta.5")).toBe(false)
    expect(isCompatible({ contextHub: "^0.0.1" }, "0.0.1")).toBe(true)
  })

  it("accepts a compiled module that declares no range", () => {
    expect(isCompatible(undefined, "0.0.1-beta.5")).toBe(true)
  })

  it("fails closed on an unusable hub version", () => {
    expect(isCompatible(RANGE, "not-a-version")).toBe(false)
  })
})

describe("a plugin.yaml manifest", () => {
  it("accepts the required fields and fills the defaults", () => {
    expect(parsePluginManifest(VALID, "acme.hello")).toEqual({
      id: "acme.hello",
      name: "Hello",
      engines: RANGE,
      description: "",
      category: "source",
      defaultEnabled: false,
    })
  })

  it("accepts localized names and descriptions", () => {
    const manifest = parsePluginManifest(
      {
        ...VALID,
        name: { en: "Hello", "zh-cn": "你好" },
        description: { en: "Says hello.", "zh-cn": "打招呼。" },
      },
      "acme.hello"
    )
    expect(manifest.name).toEqual({ en: "Hello", "zh-cn": "你好" })
    expect(manifest.description).toEqual({ en: "Says hello.", "zh-cn": "打招呼。" })
  })

  it("requires a locale table to carry English", () => {
    expect(() =>
      parsePluginManifest({ ...VALID, name: { "zh-cn": "你好" } }, "acme.hello")
    ).toThrow(/must include "en"/)
  })

  it("refuses an invalid locale id and an empty message", () => {
    expect(() =>
      parsePluginManifest({ ...VALID, name: { en: "Hello", ZH: "你好" } }, "acme.hello")
    ).toThrow(/not a locale id/)
    expect(() =>
      parsePluginManifest({ ...VALID, description: { en: "  " } }, "acme.hello")
    ).toThrow(/"description\.en"/)
  })

  it("requires the id to equal the directory", () => {
    expect(() => parsePluginManifest(VALID, "acme.other")).toThrow(/does not match/)
  })

  it.each(["id", "name", "engines"])("requires %s", (field) => {
    const rest: Record<string, unknown> = { ...VALID }
    delete rest[field]
    expect(() => parsePluginManifest(rest, "acme.hello")).toThrow(new RegExp(`"${field}"`))
  })

  it("requires non-empty strings", () => {
    expect(() => parsePluginManifest({ ...VALID, name: "   " }, "acme.hello")).toThrow(/"name"/)
  })

  it("refuses version and entry, which package.json owns", () => {
    expect(() => parsePluginManifest({ ...VALID, version: "1.0.0" }, "acme.hello")).toThrow(
      /"version" belongs in package.json/
    )
    expect(() => parsePluginManifest({ ...VALID, entry: "index.js" }, "acme.hello")).toThrow(
      /"entry" belongs in package.json/
    )
  })

  it("validates the engines shape and range", () => {
    expect(() => parsePluginManifest({ ...VALID, engines: "0.1" }, "acme.hello")).toThrow(
      /"engines" must be an object/
    )
    expect(() =>
      parsePluginManifest({ ...VALID, engines: { contextHub: 1 } }, "acme.hello")
    ).toThrow(/contextHub must be a non-empty string/)
    expect(() =>
      parsePluginManifest({ ...VALID, engines: { contextHub: "not a range" } }, "acme.hello")
    ).toThrow(/not a valid semver range/)
    expect(
      parsePluginManifest(
        { ...VALID, engines: { contextHub: "^0.1 || >=0.3 <0.7" } },
        "acme.hello"
      ).engines
    ).toEqual({ contextHub: "^0.1 || >=0.3 <0.7" })
  })

  it("ignores the old apiVersion field", () => {
    expect(
      parsePluginManifest({ ...VALID, apiVersion: "^0.1" }, "acme.hello")
    ).not.toHaveProperty("apiVersion")
  })

  it("refuses unknown permissions and categories", () => {
    expect(() =>
      parsePluginManifest({ ...VALID, permissions: ["filesystem", "everything"] }, "acme.hello")
    ).toThrow(/known permissions/)
    expect(() => parsePluginManifest({ ...VALID, category: "other" }, "acme.hello")).toThrow(
      /unknown category/
    )
  })

  it("refuses an installed plugin that locks itself on", () => {
    expect(() => parsePluginManifest({ ...VALID, locked: true }, "acme.hello")).toThrow(/lock/)
  })

  it("only reads defaultEnabled as true", () => {
    expect(
      parsePluginManifest({ ...VALID, defaultEnabled: "yes" }, "acme.hello").defaultEnabled
    ).toBe(false)
    expect(
      parsePluginManifest({ ...VALID, defaultEnabled: true }, "acme.hello").defaultEnabled
    ).toBe(true)
  })

  it("reads an optional author", () => {
    expect(parsePluginManifest({ ...VALID, author: "Acme" }, "acme.hello").author).toBe("Acme")
  })

  it("ignores fields this kernel does not know", () => {
    expect(parsePluginManifest({ ...VALID, future: 1 }, "acme.hello")).not.toHaveProperty("future")
  })

  it("refuses a document that is not an object", () => {
    expect(() => parsePluginManifest(null, "acme.hello")).toThrow(/expected an object/)
  })
})

describe("a plugin.yaml document", () => {
  it("parses YAML and localizes the text", () => {
    const manifest = parsePluginManifestYaml(
      [
        'id: "acme.hello"',
        "name:",
        "  en: Hello",
        '  "zh-cn": 你好',
        "engines:",
        '  contextHub: ">=0.0.1 <0.7.0"',
        "description: |",
        "  Says hello.",
      ].join("\n"),
      "acme.hello"
    )
    expect(manifest.name).toEqual({ en: "Hello", "zh-cn": "你好" })
    expect(manifest.description).toBe("Says hello.\n")
  })

  it("reports a YAML syntax error as a manifest error", () => {
    expect(() => parsePluginManifestYaml("id: [unclosed", "acme.hello")).toThrow(
      /not valid YAML/
    )
  })
})

describe("package.json declarations", () => {
  it("reads version and defaults the entry", () => {
    expect(parsePluginPackage({ version: "1.0.0" }, "acme.hello")).toEqual({
      version: "1.0.0",
      entry: "index.js",
    })
  })

  it("uses main as the entry", () => {
    expect(
      parsePluginPackage({ version: "1.0.0", main: "lib/index.js" }, "acme.hello")
    ).toEqual({ version: "1.0.0", entry: "lib/index.js" })
  })

  it("requires a usable version and main", () => {
    expect(() => parsePluginPackage({}, "acme.hello")).toThrow(/version/)
    expect(() => parsePluginPackage({ version: 42 }, "acme.hello")).toThrow(/version/)
    expect(() =>
      parsePluginPackage({ version: "1.0.0", main: 42 }, "acme.hello")
    ).toThrow(/main/)
  })

  it("reads an installed package leniently when the fields are absent", () => {
    expect(readPluginPackage({}, "acme.hello")).toEqual({
      version: "0.0.0",
      entry: "index.js",
    })
  })

  it("still refuses a present field of the wrong type", () => {
    expect(() => readPluginPackage({ version: 42 }, "acme.hello")).toThrow(/version/)
    expect(() => readPluginPackage({ main: 42 }, "acme.hello")).toThrow(/main/)
  })
})
