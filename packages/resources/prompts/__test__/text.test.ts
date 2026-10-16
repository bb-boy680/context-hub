/**
 * Behaviour of the functions that turn a prompt into text on disk and say where
 * it goes: the file name, the command file, the section added to a document, and
 * the target each action resolves to.
 *
 * These are the parts of the module that can be checked without a disk, a
 * browser or a kernel, and they are also the parts where a wrong answer is
 * quiet — a name that escapes its directory, a frontmatter line that stops being
 * YAML, a second click that adds a second section. So each case below pairs a
 * name or a file that must work with one that must not, and the two are asserted
 * together.
 */
import { describe, expect, it } from "vitest"

import { commandFile, describeBody } from "../src/command-file.ts"
import { targetOf } from "../src/deliver.ts"
import type { PromptPlace } from "../src/provider.ts"
import { slugOf } from "../src/slug.ts"
import { withSection } from "../src/instruction.ts"

/* The dangerous names are the point: everything downstream splits the name on
   `/` to check it, so a backslash, a drive letter or a leading dot has to have
   been settled here. Each one is paired with a name that must survive intact. */
describe("slugOf", () => {
  const DANGEROUS: [string, string][] = [
    ["a path separator", "../../etc/passwd"],
    ["a backslash traversal", "..\\..\\windows\\system32"],
    ["a drive letter", "C:\\Users\\me\\.claude"],
    ["a bare parent", ".."],
    ["a bare dot", "."],
    ["a leading dot", ".hidden"],
    ["a comment marker", "<!-- context-hub:x -->"],
    ["a colon", "note: read this"],
    ["a wildcard", "a*b?c"],
    ["a newline", "first\nsecond"],
  ]

  it.each(DANGEROUS)("refuses to carry %s", (_what, name) => {
    const slug = slugOf(name)
    const safe =
      slug !== "" &&
      !slug.includes("/") &&
      !slug.includes("\\") &&
      !slug.includes("..") &&
      !slug.includes(":") &&
      !slug.startsWith(".") &&
      /^[\p{L}\p{N}-]+$/u.test(slug)
    expect(safe, `slugOf(${JSON.stringify(name)}) gave ${JSON.stringify(slug)}`).toBe(true)
  })

  it.each([
    ["Code Review", "code-review"],
    ["  PDF Extract  ", "pdf-extract"],
    ["a  b", "a-b"],
  ])("turns %j into %j", (name, expected) => {
    expect(slugOf(name)).toBe(expected)
  })

  it.each(["CON", "com1", "!!!"])("does not turn %j into a device name", (name) => {
    expect(["con", "com1"]).not.toContain(slugOf(name))
  })

  /* CJK survives: a name written in Chinese should read as itself, not collapse
     into the digest fallback or an empty string. */
  it("keeps a Chinese name's own characters, and keeps two of them apart", () => {
    expect(slugOf("代码审查")).toBe("代码审查")
    expect(slugOf("代码审查")).not.toBe(slugOf("数据查询"))
  })

  it("falls back deterministically for an unusable name, clipped and without a trailing separator", () => {
    expect(slugOf("!!!")).toBe(slugOf("!!!"))
    expect(slugOf("x".repeat(200)).length).toBeLessThanOrEqual(64)
    expect(slugOf(`${"x".repeat(62)} tail`).endsWith("-")).toBe(false)
  })
})

describe("commandFile", () => {
  it("writes a plain prompt as it stands", () => {
    expect(commandFile({ name: "Code Review", body: "Review the diff.\n", frontmatter: false })).toBe(
      "Review the diff.\n"
    )
  })

  it("lands a Windows body as LF, and does not carry a BOM", () => {
    expect(
      commandFile({ name: "Code Review", body: "line one\r\nline two\r\n", frontmatter: false })
    ).toBe("line one\nline two\n")
    expect(commandFile({ name: "x", body: "\uFEFF# Title\n", frontmatter: false })).toBe("# Title\n")
  })

  it("opens a generated command with a block closed exactly once", () => {
    const described = commandFile({ name: "Code Review", body: "Review the diff.", frontmatter: true })
    expect(described.startsWith("---\nname: Code Review\n")).toBe(true)
    expect(described).toContain("\n---\n\n")
    expect(described.split("\n").filter((line) => line === "---")).toHaveLength(2)
  })

  /* A description is one bare scalar, so the characters that mean something to a
     YAML reader have to be quoted — otherwise the agent reads a broken block. */
  it("quotes a colon in the description", () => {
    const quoted = commandFile({
      name: "Note",
      description: "Use: this, then #that",
      body: "body",
      frontmatter: true,
    })
    expect(quoted).toContain('description: "Use: this')
  })

  it("quotes a leading indicator", () => {
    expect(commandFile({ name: "-dash", body: "body", frontmatter: true })).toContain(
      'name: "-dash"'
    )
  })

  it("keeps a description with a newline on one line", () => {
    const multiline = commandFile({
      name: "x",
      description: "first\nsecond",
      body: "body",
      frontmatter: true,
    })
    expect(multiline.split("\n").filter((line) => line.startsWith("description:"))).toHaveLength(1)
    expect(multiline).toContain("description: first second")
  })

  it("falls back to the first line when there is no description", () => {
    expect(commandFile({ name: "x", body: "## Do the thing\nmore", frontmatter: true })).toContain(
      "description: Do the thing"
    )
  })

  it("ignores blank and marked lines when describing a body, and clips a long one", () => {
    expect(describeBody("\n\n> real\n")).toBe("real")
    expect(describeBody("   \n\n")).toBe("")
    expect(describeBody("y".repeat(300)).length).toBeLessThanOrEqual(80)
  })
})

describe("withSection", () => {
  const section = (body: string) => ({ slug: "code-review", title: "Code Review", body })

  it("turns an absent file into just the section, marked, ending with one newline", () => {
    const one = withSection(null, section("Review it."))
    expect(one).toContain("## Code Review")
    expect(one).toContain("<!-- context-hub:code-review -->")
    expect(one.endsWith("<!-- /context-hub:code-review -->\n")).toBe(true)
    expect(one.endsWith("\n\n")).toBe(false)
  })

  /* The idempotency that matters: the second click must not add a second copy. */
  it("changes nothing on a second click", () => {
    const one = withSection(null, section("Review it."))
    const twice = withSection(one, section("Review it."))
    expect(twice).toBe(one)
    expect(twice.split("## Code Review")).toHaveLength(2)
  })

  /* Editing the prompt replaces the section rather than adding another. */
  it("replaces the section when the prompt was edited, leaving one", () => {
    const one = withSection(null, section("Review it."))
    const edited = withSection(one, section("Review it twice."))
    expect(edited).toContain("twice")
    expect(edited).not.toContain("Review it.\n")
    expect(edited.split("<!-- context-hub:code-review -->")).toHaveLength(2)
  })

  /* Somebody else's file comes back whole. */
  it("appends to a file it did not write, leaving that file's own text untouched", () => {
    const theirs = "# My rules\n\nAlways use tabs.\n"
    const appended = withSection(theirs, section("Review it."))
    expect(appended.startsWith(theirs)).toBe(true)
    expect(appended.trimEnd().endsWith("<!-- /context-hub:code-review -->")).toBe(true)
    expect(withSection(appended, section("Review it."))).toBe(appended)
  })

  /* A file written on Windows stays a Windows file. */
  it("keeps CRLF, in the file and in the section it adds", () => {
    const crlfOut = withSection("# My rules\r\n\r\nAlways use tabs.\r\n", {
      slug: "r",
      title: "R",
      body: "line\nline",
    })
    expect(crlfOut).toContain("Always use tabs.\r\n")
    expect(/[^\r]\n/.test(crlfOut)).toBe(false)
  })

  /* A section already there is replaced where it stands, keeping what follows. */
  it("replaces a section in the middle in place, idempotently", () => {
    const middle = withSection(
      `top\n\n${withSection(null, { slug: "s", title: "S", body: "old" }).trimEnd()}\n\nbottom`,
      { slug: "s", title: "S", body: "new" }
    )
    expect(middle.startsWith("top\n\n")).toBe(true)
    expect(middle).toContain("bottom")
    expect(middle).toContain("new")
    expect(middle).not.toContain("old")
    expect(withSection(middle, { slug: "s", title: "S", body: "new" })).toBe(middle)
  })

  /* A hand-deleted closing marker must not start a second section. */
  it("replaces a half-marked section rather than doubling it", () => {
    const healed = withSection(`top\n\n<!-- context-hub:s -->\n## S\n\nold\n`, {
      slug: "s",
      title: "S",
      body: "new",
    })
    expect(healed).toContain("new")
    expect(healed).not.toContain("old")
    expect(healed.split("<!-- context-hub:s -->")).toHaveLength(2)
  })

  /* Two prompts in one file are two sections, and neither disturbs the other. */
  it("keeps two prompts in one file as two sections, each idempotent on its own", () => {
    const one = withSection(null, section("Review it."))
    const pair = withSection(one, { slug: "other", title: "Other", body: "Other body." })
    expect(pair).toContain("## Code Review")
    expect(pair).toContain("## Other")
    expect(withSection(pair, { slug: "other", title: "Other", body: "Other body." })).toBe(pair)
    expect(pair.split("<!-- context-hub:code-review -->")).toHaveLength(2)
  })
})

/* Where each action writes, which is the other thing a wrong answer to would be
   quiet about: a path that climbs, or a document the place never declared. */
describe("where each action writes", () => {
  const place: PromptPlace = {
    id: "workspace",
    agent: "hub.prompt.catalog",
    labelKey: "prompts.location.workspace",
    icon: () => null,
    scope: "workspace",
    commandDir: ".agents/commands",
    ruleDir: ".agents/rules",
    documents: [
      { id: "agents", labelKey: "prompts.menu.document.agents", file: "AGENTS.md" },
      { id: "design", labelKey: "prompts.menu.document.design", file: "DESIGN.md" },
    ],
    generatedOnly: true,
    order: 0,
  }
  /* The title, not the description, is what these files are named after: the two
     say different things here so a path built from the wrong one shows up. */
  const prompt = {
    name: "Code Review",
    description: "Reads the diff and says what it changes",
    prompt: "Body.",
    tags: [],
    updatedAt: "",
    assets: [],
  }

  it("puts a command under the place's command directory, and a rule under its own", () => {
    expect(targetOf(place, prompt, "commands").file).toBe(".agents/commands/code-review.md")
    expect(targetOf(place, prompt, "rule").file).toBe(".agents/rules/code-review.md")
  })

  it("sends an install where a command goes, at the place's own scope", () => {
    expect(targetOf(place, prompt, "install").file).toBe(
      targetOf(place, prompt, "commands").file
    )
    expect(targetOf(place, prompt, "rule").scope).toBe("workspace")
  })

  it("reads a document as the file the place declared", () => {
    expect(targetOf(place, prompt, "instructions", "design").file).toBe("DESIGN.md")
  })

  /* A document this place does not keep is a caller that made the action up, not
     a write somewhere surprising. */
  it("refuses a document the place does not declare, naming the place", () => {
    expect(() => targetOf(place, prompt, "instructions", "nope")).toThrow(/workspace/)
  })

  it("refuses a document asked for by no name", () => {
    expect(() => targetOf(place, prompt, "instructions")).toThrow()
  })

  it("refuses a place that keeps no documents, while its rules still work", () => {
    const bare: PromptPlace = { ...place, documents: undefined }
    expect(() => targetOf(bare, prompt, "instructions", "agents")).toThrow()
    expect(targetOf(bare, prompt, "rule").file).toBe(".agents/rules/code-review.md")
  })
})
