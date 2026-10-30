import { describe, expect, it } from "vitest"

import { assertMarketInstall } from "../src/market-install.ts"

const SHA = "0f487c9b1b98d8e62dfc80ee4d28b29f5471261f"

describe("assertMarketInstall", () => {
  it("keeps a repository address and its commit", () => {
    expect(assertMarketInstall({ kind: "url", url: "https://github.com/adobe/skills.git", sha: SHA })).toEqual({
      kind: "url",
      url: "https://github.com/adobe/skills.git",
      sha: SHA,
    })
  })

  it("keeps one directory of a repository", () => {
    expect(
      assertMarketInstall({
        kind: "git-subdir",
        url: "https://github.com/adobe/skills.git",
        path: "plugins/creative-cloud/adobe-for-creativity",
        ref: "main",
        sha: SHA,
      })
    ).toEqual({
      kind: "git-subdir",
      url: "https://github.com/adobe/skills.git",
      path: "plugins/creative-cloud/adobe-for-creativity",
      ref: "main",
      sha: SHA,
    })
  })

  it("refuses a local path or an archive", () => {
    expect(() => assertMarketInstall({ kind: "local", path: "C:\\packs\\one" })).toThrow()
    expect(() => assertMarketInstall({ kind: "archive", url: "https://example.com/one.zip" })).toThrow()
  })

  it("refuses an address that is not https", () => {
    expect(() => assertMarketInstall({ kind: "url", url: "http://github.com/a/b" })).toThrow()
    expect(() => assertMarketInstall({ kind: "url", url: "git@github.com:a/b.git" })).toThrow()
  })

  it("refuses credentials, a query, or a fragment", () => {
    /* Built rather than written out so no scanner mistakes the sample for a real credential. */
    const withCredentials = `https://user${":"}token@github.com/a/b`
    expect(() => assertMarketInstall({ kind: "url", url: withCredentials })).toThrow()
    expect(() => assertMarketInstall({ kind: "url", url: "https://github.com/a/b?x=1" })).toThrow()
    expect(() => assertMarketInstall({ kind: "url", url: "https://github.com/a/b#main" })).toThrow()
  })

  it("refuses a path that would escape the pack", () => {
    expect(() =>
      assertMarketInstall({ kind: "git-subdir", url: "https://github.com/a/b", path: "../evil" })
    ).toThrow()
    expect(() =>
      assertMarketInstall({ kind: "git-subdir", url: "https://github.com/a/b", path: "a\\b" })
    ).toThrow()
    expect(() =>
      assertMarketInstall({ kind: "git-subdir", url: "https://github.com/a/b", path: "" })
    ).toThrow()
  })

  it("refuses a short or non-hex commit, and a ref with whitespace", () => {
    expect(() => assertMarketInstall({ kind: "url", url: "https://github.com/a/b", sha: "abc123" })).toThrow()
    expect(() =>
      assertMarketInstall({ kind: "url", url: "https://github.com/a/b", sha: "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz" })
    ).toThrow()
    expect(() =>
      assertMarketInstall({ kind: "url", url: "https://github.com/a/b", ref: "two words" })
    ).toThrow()
  })
})
