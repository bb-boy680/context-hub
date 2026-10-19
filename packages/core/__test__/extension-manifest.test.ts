/**
 * The manifest rules the host and the loader share.
 *
 * The loader's own behaviour is covered through `discoverPlugins`; this suite
 * pins the pure rules a downloaded `plugin.json` must satisfy before it is ever
 * imported, so the host can validate the same file without React or a browser.
 */
import { describe, expect, it } from "vitest"

import {
  EXTENSION_API_VERSION,
  isCompatible,
  parsePluginManifest,
} from "../src/extension-manifest.ts"

const VALID = {
  id: "acme.hello",
  name: "Hello",
  version: "1.0.0",
  apiVersion: "^0.1",
}

describe("the extension API version", () => {
  it("accepts the exact version, with or without a range marker", () => {
    expect(isCompatible(EXTENSION_API_VERSION)).toBe(true)
    expect(isCompatible(`^${EXTENSION_API_VERSION}`)).toBe(true)
    expect(isCompatible(`~${EXTENSION_API_VERSION}`)).toBe(true)
  })

  it("refuses a different version", () => {
    expect(isCompatible("0.2")).toBe(false)
  })
})

describe("a manifest", () => {
  it("accepts the required fields and fills the defaults", () => {
    expect(parsePluginManifest(VALID, "acme.hello")).toEqual({
      id: "acme.hello",
      name: "Hello",
      version: "1.0.0",
      apiVersion: "^0.1",
      description: "",
      category: "source",
      defaultEnabled: false,
    })
  })

  it("requires the id to equal the directory", () => {
    expect(() => parsePluginManifest(VALID, "acme.other")).toThrow(/does not match/)
  })

  it.each(["id", "name", "version", "apiVersion"])("requires %s", (field) => {
    const rest: Record<string, unknown> = { ...VALID }
    delete rest[field]
    expect(() => parsePluginManifest(rest, "acme.hello")).toThrow(new RegExp(`"${field}"`))
  })

  it("requires non-empty strings", () => {
    expect(() => parsePluginManifest({ ...VALID, name: "   " }, "acme.hello")).toThrow(/"name"/)
  })

  it("refuses an incompatible apiVersion", () => {
    expect(() => parsePluginManifest({ ...VALID, apiVersion: "0.2" }, "acme.hello")).toThrow(
      /not compatible/
    )
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

  it("ignores fields this kernel does not know", () => {
    expect(parsePluginManifest({ ...VALID, future: 1 }, "acme.hello")).not.toHaveProperty("future")
  })

  it("refuses a document that is not an object", () => {
    expect(() => parsePluginManifest(null, "acme.hello")).toThrow(/expected a JSON object/)
  })
})
