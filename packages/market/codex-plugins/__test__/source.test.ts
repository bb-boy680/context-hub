import { describe, expect, it } from "vitest"

import { CODEX_MARKET_REPO, readCodexMarketplace } from "../src/apis/marketplace.ts"

function logs() {
  const lines: string[] = []
  return {
    lines,
    log: (level: string, message: string) => {
      lines.push(`${level}: ${message}`)
    },
  }
}

describe("readCodexMarketplace", () => {
  it("reads a local directory as one directory of the official repository", () => {
    const seen = logs()
    const entries = readCodexMarketplace(
      { plugins: [{ name: "linear", source: { source: "local", path: "./plugins/linear" }, category: "Productivity" }] },
      seen.log
    )

    expect(entries).toEqual([
      {
        id: "codex:linear",
        name: "linear",
        category: "Productivity",
        sourceId: "codex",
        install: {
          kind: "git-subdir",
          url: CODEX_MARKET_REPO,
          path: "plugins/linear",
          ref: "main",
        },
      },
    ])
    expect(seen.lines).toEqual([])
  })

  it("keeps a repository and a subdirectory source", () => {
    const seen = logs()
    const entries = readCodexMarketplace(
      {
        plugins: [
          { name: "one", source: { source: "url", url: "https://github.com/a/b.git" } },
          { name: "two", source: { source: "git-subdir", url: "https://github.com/a/c.git", path: "codex/two" } },
        ],
      },
      seen.log
    )

    expect(entries.map((entry) => entry.install)).toEqual([
      { kind: "url", url: "https://github.com/a/b.git" },
      { kind: "git-subdir", url: "https://github.com/a/c.git", path: "codex/two" },
    ])
    expect(seen.lines).toEqual([])
  })

  it("skips a source form it does not know, and says so", () => {
    const seen = logs()
    const entries = readCodexMarketplace(
      { plugins: [{ name: "odd", source: { source: "elsewhere", path: "somewhere" } }] },
      seen.log
    )

    expect(entries).toEqual([])
    expect(seen.lines).toHaveLength(1)
    expect(seen.lines[0]).toContain("odd")
  })

  it("skips an entry whose address would be refused", () => {
    const seen = logs()
    const entries = readCodexMarketplace(
      {
        plugins: [
          { name: "bad", source: { source: "url", url: "http://github.com/a/b.git" } },
          { name: "good", source: { source: "url", url: "https://github.com/a/b.git" } },
        ],
      },
      seen.log
    )

    expect(entries.map((entry) => entry.name)).toEqual(["good"])
    expect(seen.lines).toHaveLength(1)
  })

  it("refuses an index with no plugin list", () => {
    expect(() => readCodexMarketplace({}, logs().log)).toThrow("plugins list")
  })
})
