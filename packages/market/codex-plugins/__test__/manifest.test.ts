import { describe, expect, it } from "vitest"

import {
  manifestUrl,
  readCodexManifest,
  resolveLogo,
} from "../src/apis/manifest.ts"

const install = {
  kind: "git-subdir" as const,
  url: "https://github.com/openai/plugins",
  path: "plugins/linear",
  ref: "main",
}

describe("manifestUrl", () => {
  it("names the manifest of the marketplace's own directory entry", () => {
    expect(manifestUrl(install)).toBe(
      "https://raw.githubusercontent.com/openai/plugins/main/plugins/linear/.codex-plugin/plugin.json"
    )
  })

  it("answers nothing for a pack from another repository", () => {
    expect(
      manifestUrl({ ...install, url: "https://github.com/other/repo" })
    ).toBeUndefined()
  })

  it("answers nothing for a whole repository", () => {
    expect(
      manifestUrl({ kind: "url", url: "https://github.com/openai/plugins" })
    ).toBeUndefined()
  })
})

describe("readCodexManifest", () => {
  it("reads the sentence, the logo and the author", () => {
    const manifest = readCodexManifest({
      description: "Search Linear issues",
      interface: { logo: "./assets/logo.png" },
    })
    expect(manifest).toEqual({
      description: "Search Linear issues",
      logo: "./assets/logo.png",
    })
  })

  it("keeps only the fields it has", () => {
    expect(readCodexManifest({ interface: {} })).toEqual({})
    expect(readCodexManifest({})).toEqual({})
    expect(readCodexManifest(null)).toEqual({})
  })
})

describe("resolveLogo", () => {
  it("resolves a logo beside the manifest into a raw address", () => {
    expect(resolveLogo(install, "./assets/logo.png")).toBe(
      "https://raw.githubusercontent.com/openai/plugins/main/plugins/linear/assets/logo.png"
    )
  })

  it("keeps an address that is already absolute", () => {
    expect(resolveLogo(install, "https://example.com/logo.png")).toBe(
      "https://example.com/logo.png"
    )
  })

  it("refuses a path that would leave the pack", () => {
    expect(resolveLogo(install, "../logo.png")).toBeUndefined()
  })
})
