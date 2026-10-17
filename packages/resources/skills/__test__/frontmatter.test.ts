/**
 * Reading and writing SKILL.md frontmatter.
 *
 * The block is YAML, so the cases that matter are the ones a line-by-line
 * reader gets wrong: a description written as a block scalar, a block that
 * never received its value, a value that looks like a date, and a block that
 * does not parse at all. A manifest the hub cannot read must still list, so
 * every failure here is expected to yield no fields rather than an error.
 */
import { describe, expect, it } from "vitest"

import { parseSkillFile, starterSkillFile } from "../src/frontmatter.ts"

/* The description of the real `browser-automation` skill, verbatim. */
const BLOCK_DESCRIPTION = `---
name: browser-automation
description: |
  Vision-driven browser automation using Midscene. Operates from screenshots — no DOM or accessibility labels needed.

  Runs in headless Puppeteer — does NOT take over the user's mouse or keyboard.
  Also supports CDP mode and Bridge mode to connect to an existing Chrome.

  Use this skill when the user wants to:
  - Browse, navigate, or open web pages
  - Scrape, extract, or collect data from websites
  - Fill out forms, upload local files, click buttons, or interact with web elements

  Powered by Midscene.js (https://midscenejs.com)
---

# Browser automation
`

describe("a block scalar description", () => {
  it("reads the lines under the indicator, breaks and bullets included", () => {
    const { frontmatter, body } = parseSkillFile(BLOCK_DESCRIPTION)
    expect(frontmatter.name).toBe("browser-automation")
    expect(frontmatter.description, "the indicator is not the value").not.toBe("|")
    expect(frontmatter.description).toContain("Vision-driven browser automation")
    expect(frontmatter.description, "a blank line inside survives").toContain(
      "needed.\n\nRuns in headless Puppeteer"
    )
    expect(frontmatter.description).toContain("- Browse, navigate, or open web pages")
    expect(frontmatter.description, "no padding from the block").toBe(
      frontmatter.description?.trim()
    )
    expect(body.trim(), "the body is what follows the block").toBe(
      "# Browser automation"
    )
  })

  it("reads an empty block as an empty description", () => {
    const text = `---\nname: find-docs\ndescription: >-\ntags: [docs, context7]\n---\n\n# Docs\n`
    const { frontmatter } = parseSkillFile(text)
    expect(frontmatter.description).toBe("")
    expect(frontmatter.tags).toEqual(["docs", "context7"])
  })
})

describe("the other fields", () => {
  it("reads tags written inline or as a block list", () => {
    expect(parseSkillFile(`---\ntags: [a, b]\n---\n`).frontmatter.tags).toEqual(["a", "b"])
    expect(parseSkillFile(`---\ntags:\n  - a\n  - b\n---\n`).frontmatter.tags).toEqual([
      "a",
      "b",
    ])
  })

  it("keeps a description that looks like a date as text", () => {
    const { frontmatter } = parseSkillFile(`---\ndescription: 2026-01-01\n---\n`)
    expect(frontmatter.description).toBe("2026-01-01")
  })

  it("does not take a nested key for a top-level one", () => {
    const { frontmatter } = parseSkillFile(
      `---\nname: tool\nmetadata:\n  tags: [inner]\n---\n`
    )
    expect(frontmatter.name).toBe("tool")
    expect(frontmatter.tags).toBeUndefined()
  })
})

describe("a manifest that does not parse", () => {
  it("answers no fields and still reads the body", () => {
    const { frontmatter, body } = parseSkillFile(
      `---\nname: broken\ndescription: [unclosed\n---\n\n# Body\n`
    )
    expect(frontmatter).toEqual({})
    expect(body.trim()).toBe("# Body")
  })

  it("answers no fields when the block is a scalar", () => {
    expect(parseSkillFile(`---\njust a string\n---\n`).frontmatter).toEqual({})
  })

  it("answers no fields when the frontmatter never closes", () => {
    const text = `---\nname: open\n\n# Body\n`
    expect(parseSkillFile(text).frontmatter).toEqual({})
    expect(parseSkillFile(text).body).toBe(text)
  })
})

describe("a file without frontmatter", () => {
  it("is all body", () => {
    const text = "# Just a document\n"
    expect(parseSkillFile(text)).toEqual({ frontmatter: {}, body: text })
  })

  it("still reads a block behind a BOM and CRLF line endings", () => {
    const text = "﻿---\r\nname: wins\r\ndescription: from Windows\r\n---\r\n\r\n# Body\r\n"
    const { frontmatter, body } = parseSkillFile(text)
    expect(frontmatter.name).toBe("wins")
    expect(frontmatter.description).toBe("from Windows")
    expect(body.trim()).toBe("# Body")
  })
})

describe("the starter manifest", () => {
  it("round-trips the fields it was given", () => {
    const draft = {
      name: "pdf-extract",
      description: "Extract tables from PDFs and scans",
      tags: ["Documents", "PDF"],
    }
    expect(parseSkillFile(starterSkillFile(draft)).frontmatter).toEqual(draft)
  })

  it("round-trips a description carrying colons, hashes and line breaks", () => {
    const draft = {
      name: "tricky",
      description: "Use when: the task mentions #tags\nand spans lines",
      tags: [],
    }
    expect(parseSkillFile(starterSkillFile(draft)).frontmatter).toEqual(draft)
  })
})
