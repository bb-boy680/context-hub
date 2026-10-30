import { describe, expect, it } from "vitest"

import {
  CLAUDE_MARKET_REPO,
  githubOwner,
  ownerAvatar,
  readClaudeMarketplace,
} from "../src/apis/marketplace.ts"

const SHA = "0f487c9b1b98d8e62dfc80ee4d28b29f5471261f"

function logs() {
  const lines: string[] = []
  return {
    lines,
    log: (level: string, message: string) => {
      lines.push(`${level}: ${message}`)
    },
  }
}

describe("readClaudeMarketplace", () => {
  it("reads a relative path as one directory of the official repository", () => {
    const seen = logs()
    const entries = readClaudeMarketplace(
      {
        plugins: [
          {
            name: "agent-sdk-dev",
            description: "Development kit",
            author: { name: "Anthropic" },
            category: "development",
            homepage: "https://example.com",
            source: "./plugins/agent-sdk-dev",
          },
        ],
      },
      seen.log
    )

    expect(entries).toEqual([
      {
        id: "claude-code:agent-sdk-dev",
        name: "agent-sdk-dev",
        description: "Development kit",
        author: "Anthropic",
        category: "development",
        homepage: "https://example.com",
        sourceId: "claude-code",
        install: { kind: "git-subdir", url: CLAUDE_MARKET_REPO, path: "plugins/agent-sdk-dev" },
      },
    ])
    expect(seen.lines).toEqual([])
  })

  it("keeps a repository and a subdirectory source, with their commits", () => {
    const seen = logs()
    const entries = readClaudeMarketplace(
      {
        plugins: [
          { name: "one", source: { source: "url", url: "https://github.com/a/b.git", sha: SHA } },
          {
            name: "two",
            source: {
              source: "git-subdir",
              url: "https://github.com/a/c.git",
              path: "packs/two",
              ref: "main",
              sha: SHA,
            },
          },
        ],
      },
      seen.log
    )

    expect(entries.map((entry) => entry.install)).toEqual([
      { kind: "url", url: "https://github.com/a/b.git", sha: SHA },
      { kind: "git-subdir", url: "https://github.com/a/c.git", path: "packs/two", ref: "main", sha: SHA },
    ])
    expect(seen.lines).toEqual([])
  })

  it("skips a form this hub does not collect, and says so", () => {
    const seen = logs()
    const entries = readClaudeMarketplace(
      { plugins: [{ name: "archived", source: { source: "archive", url: "https://example.com/a.zip" } }] },
      seen.log
    )

    expect(entries).toEqual([])
    expect(seen.lines).toHaveLength(1)
    expect(seen.lines[0]).toContain("archived")
  })

  it("skips an entry whose address would be refused", () => {
    const seen = logs()
    const entries = readClaudeMarketplace(
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
    expect(() => readClaudeMarketplace({}, logs().log)).toThrow("plugins list")
    expect(() => readClaudeMarketplace([], logs().log)).toThrow("plugins list")
  })
})

describe("ownerAvatar", () => {
  it("takes the owner of a GitHub repository", () => {
    expect(githubOwner("https://github.com/adobe/skills.git")).toBe("adobe")
    expect(ownerAvatar("https://github.com/adobe/skills.git")).toBe(
      "https://github.com/adobe.png?size=64"
    )
  })

  it("leaves Anthropic's own entries to the category mark", () => {
    expect(ownerAvatar(CLAUDE_MARKET_REPO)).toBeUndefined()
  })

  it("answers nothing for an address that is not GitHub", () => {
    expect(ownerAvatar("https://example.com/a/b")).toBeUndefined()
    expect(ownerAvatar("not an address")).toBeUndefined()
  })
})
