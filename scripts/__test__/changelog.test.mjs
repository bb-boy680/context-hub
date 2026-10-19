import { describe, expect, it } from "vitest"

import { buildSection, parseCommit, parseLog, prependChangelog } from "../changelog.mjs"

const commit = (subject, hash = "abcdef1234567890", body = "") => ({ subject, hash, body })

describe("parseCommit", () => {
  it("reads type, scope and the breaking marker", () => {
    expect(parseCommit("feat(desktop)!: drop the old carrier")).toEqual({
      type: "feat",
      scope: "desktop",
      subject: "drop the old carrier",
      breaking: true,
    })
    expect(parseCommit("fix: keep the tray alive")).toEqual({
      type: "fix",
      scope: "",
      subject: "keep the tray alive",
      breaking: false,
    })
  })

  it("keeps a non-conventional subject under other", () => {
    expect(parseCommit("plain change")).toEqual({
      type: "other",
      scope: "",
      subject: "plain change",
      breaking: false,
    })
  })
})

describe("buildSection", () => {
  it("groups commits, links hashes and skips merges and release bumps", () => {
    const section = buildSection({
      commits: [
        commit("feat(web): add the market"),
        commit("fix: keep the tray alive", "1234567890abcdef"),
        commit("Merge pull request #4 from owner/branch", "ffffffffffffffff"),
        commit("chore(release): v1.2.3", "eeeeeeeeeeeeeeee"),
        commit("docs: explain the flow", "dddddddddddddddd"),
      ],
      tag: "v1.2.3",
      previousTag: "v1.2.2",
      repo: "owner/repo",
      date: "2026-10-19",
    })

    expect(section).toContain("## v1.2.3 (2026-10-19)")
    expect(section).toContain("### Features")
    expect(section).toContain("**web:** add the market")
    expect(section).toContain("### Bug Fixes")
    expect(section).toContain("### Documentation")
    expect(section).not.toContain("Merge pull request")
    expect(section).not.toContain("chore(release)")
    expect(section).toContain(
      "https://github.com/owner/repo/compare/v1.2.2...v1.2.3"
    )
    expect(section).toContain("https://github.com/owner/repo/commit/1234567890abcdef")
  })

  it("puts a breaking change first, including a BREAKING CHANGE body", () => {
    const section = buildSection({
      commits: [
        commit("feat: remove the old API", "aaaaaaaaaaaaaaaa", "BREAKING CHANGE: use the new one"),
        commit("fix: patch the tray", "bbbbbbbbbbbbbbbb"),
      ],
      tag: "v2.0.0",
      previousTag: "v1.9.0",
      repo: "owner/repo",
      date: "2026-10-19",
    })
    const breaking = section.indexOf("### Breaking Changes")
    const fixes = section.indexOf("### Bug Fixes")
    expect(breaking).toBeGreaterThan(-1)
    expect(breaking).toBeLessThan(fixes)
    expect(section).toContain("remove the old API")
  })
})

describe("parseLog", () => {
  it("reads the record-separated git log format", () => {
    const raw = "abc\x1ffeat: one\x1fbody\x1e\ndef\x1ffix: two\x1f\x1e"
    expect(parseLog(raw)).toEqual([
      { hash: "abc", subject: "feat: one", body: "body" },
      { hash: "def", subject: "fix: two", body: "" },
    ])
  })
})

describe("prependChangelog", () => {
  it("keeps one header and puts the newest section first", () => {
    const older = "# Changelog\n\n## v1.0.0 (2026-01-01)\n\n### Features\n\n- old\n"
    const section = "## v1.1.0 (2026-02-01)\n\n### Bug Fixes\n\n- new\n"
    const merged = prependChangelog(older, section)
    expect(merged.startsWith("# Changelog")).toBe(true)
    expect(merged.indexOf("v1.1.0")).toBeLessThan(merged.indexOf("v1.0.0"))
    expect(merged.match(/# Changelog/g)).toHaveLength(1)
  })

  it("does not add the same tag twice", () => {
    const section = "## v1.1.0 (2026-02-01)\n\n### Bug Fixes\n\n- new\n"
    const once = prependChangelog("# Changelog\n\n", section)
    expect(prependChangelog(once, section)).toBe(once)
  })
})
