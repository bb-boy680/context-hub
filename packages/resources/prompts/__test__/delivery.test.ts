/**
 * Behaviour of where a prompt actually lands on disk.
 *
 * The pieces are each checked on their own elsewhere — the file name, the
 * command file, the section markers — and this is the one that puts them
 * together through the real port, against a throwaway workspace. What it is
 * looking for is the mistakes a unit test cannot see: a directory that was never
 * created, a document that got overwritten instead of added to, a second click
 * that left two sections, a file whose newlines were rewritten.
 *
 * It never touches the form that runs it: all three roots — the hub home, the
 * project and the machine-wide home — are temporary directories, so `.agents/`
 * and `AGENTS.md` here are nobody's real files.
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createFsPlaceFiles } from "@context-hub/core/host/place-files"

import { deliver, delivered, targetOf, undeliver } from "../src/deliver.ts"
import type { PromptPlace } from "../src/provider.ts"
import type { Prompt } from "../src/store.ts"

let home: string
let project: string
/**
 * Somewhere for the machine-wide scope to read under.
 *
 * `userHome` is passed rather than left to default, because its default is the
 * person's real home — and this writes. A global place under the real one would
 * put `.agents/rules/` in the middle of somebody's machine.
 */
let machine: string
let files: ReturnType<typeof createFsPlaceFiles>

/** The place the prompts module registers, as it registers it. */
const WORKSPACE: PromptPlace = {
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

/** The same place in the machine-wide scope, where the roots differ. */
const GLOBAL: PromptPlace = { ...WORKSPACE, id: "workspace-global", scope: "global" }

/* The title and the description are deliberately different sentences with
   different file names: every assertion below about `code-review.md` is an
   assertion that the delivered file is named after the title. */
const prompt: Prompt = {
  name: "Code Review",
  description: "Reads the diff and says what it changes",
  prompt: "Review the diff.\nReport what it changes.",
  tags: [],
  updatedAt: "",
  assets: [],
}

const at = (...parts: string[]) => path.join(project, ...parts)
const read = (file: string) => fs.readFile(file, "utf8")
const exists = async (file: string) => (await fs.stat(file).catch(() => null)) !== null

beforeAll(async () => {
  home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-delivery-home-"))
  project = await fs.mkdtemp(path.join(tmpdir(), "context-hub-delivery-ws-"))
  machine = await fs.mkdtemp(path.join(tmpdir(), "context-hub-delivery-user-"))
  files = createFsPlaceFiles({ home, folder: project, userHome: machine })
})

afterAll(async () => {
  await fs.rm(home, { recursive: true, force: true })
  await fs.rm(project, { recursive: true, force: true })
  await fs.rm(machine, { recursive: true, force: true })
})

describe("the two directories", () => {
  it("writes nothing before a delivery", async () => {
    expect(await exists(at(".agents"))).toBe(false)
  })

  it("lands a command under .agents/commands, directory and all", async () => {
    await deliver(files, WORKSPACE, prompt, "commands")
    const command = await read(at(".agents", "commands", "code-review.md"))
    expect(command).not.toBeNull()
    expect(command.startsWith("---\nname:"), "the block an agent reads").toBe(true)
    expect(command).toContain("name: Code Review")
    /* The block's description is the row's own, not the body's opening line cut
       to eighty characters — which is what a row with no description falls back
       to. */
    expect(command).toContain("description: Reads the diff and says what it changes")
    expect(command).toContain("Review the diff.")
    expect(await delivered(files, WORKSPACE, prompt, "commands")).toBe(true)
  })

  it("lands a rule in a directory of its own, without the frontmatter", async () => {
    await deliver(files, WORKSPACE, prompt, "rule")
    const rule = await read(at(".agents", "rules", "code-review.md"))
    expect(rule).not.toBeNull()
    expect(rule.startsWith("---")).toBe(false)
    expect(rule).toContain("Report what it changes.")
  })

  /* An install and a command are one file, not two: a second copy beside the
     first would be the one that goes stale. */
  it("writes the same file for an install as for a command, and only one of them", async () => {
    await deliver(files, WORKSPACE, prompt, "install")
    const plain = await read(at(".agents", "commands", "code-review.md"))
    expect(plain.startsWith("---"), "an install carries no block").toBe(false)
    expect(await fs.readdir(at(".agents", "commands"))).toEqual(["code-review.md"])
  })
})

describe("the documents", () => {
  /* A project file that already says something of its own, CRLF and all. */
  const HAND = "# House rules\r\n\r\nNobody writes to main.\r\n"
  let added: string

  it("keeps the person's own text, line endings and all, and fences the section", async () => {
    await fs.writeFile(at("AGENTS.md"), HAND)
    await deliver(files, WORKSPACE, prompt, "instructions", "agents")
    added = await read(at("AGENTS.md"))

    expect(added).toContain("Nobody writes to main.")
    expect(added, "the file's own line endings").toContain("\r\n")
    expect(/[^\r]\n/.test(added.replace(/\r\n/g, "")), "a stray LF").toBe(false)
    expect(added).toContain("<!-- context-hub:code-review -->")
    expect(added).toContain("<!-- /context-hub:code-review -->")
    expect(added).toContain("## Code Review")
    expect(await delivered(files, WORKSPACE, prompt, "instructions", "agents")).toBe(true)
  })

  /* The whole point of the marker: clicking twice leaves one section. */
  it("leaves one section when delivered twice", async () => {
    await deliver(files, WORKSPACE, prompt, "instructions", "agents")
    const twice = await read(at("AGENTS.md"))
    expect(twice.split("<!-- context-hub:code-review -->")).toHaveLength(2)
    expect(twice.split("Nobody writes to main.")).toHaveLength(2)
  })

  it("gives the second document its own section, without disturbing the first", async () => {
    const twice = await read(at("AGENTS.md"))
    await deliver(files, WORKSPACE, prompt, "instructions", "design")
    const design = await read(at("DESIGN.md"))
    expect(design).toContain("<!-- context-hub:code-review -->")
    expect(await read(at("AGENTS.md")), "AGENTS.md changed when DESIGN.md was written").toBe(twice)
    expect(await delivered(files, WORKSPACE, prompt, "instructions", "agents")).toBe(true)
    expect(await delivered(files, WORKSPACE, prompt, "instructions", "design")).toBe(true)
  })

  it("does not report a prompt that was never added to a document", async () => {
    const other: Prompt = { ...prompt, name: "Something Else", prompt: "Else." }
    expect(await delivered(files, WORKSPACE, other, "instructions", "agents")).toBe(false)
  })
})

describe("taking things back", () => {
  it("refuses to take a document's section back, and changes nothing", async () => {
    const before = await read(at("AGENTS.md"))
    await expect(undeliver(files, WORKSPACE, prompt, "instructions", "agents")).rejects.toThrow()
    expect(await read(at("AGENTS.md"))).toBe(before)
  })

  it("takes a rule back, and reports nothing done the second time", async () => {
    expect(await undeliver(files, WORKSPACE, prompt, "rule")).toBe(true)
    expect(await exists(at(".agents", "rules", "code-review.md"))).toBe(false)
    expect(await undeliver(files, WORKSPACE, prompt, "rule")).toBe(false)
  })
})

/* A path a place cannot name. Nothing but the two scopes and a relative path
   gets through, which is what keeps a document name from reaching anywhere but
   the workspace root. */
describe("a document that climbs out of its scope", () => {
  it("is refused, and nothing is written beside the workspace", async () => {
    const climbing: PromptPlace = {
      ...WORKSPACE,
      documents: [{ id: "bad", labelKey: "x", file: "../outside.md" }],
    }
    await expect(deliver(files, climbing, prompt, "instructions", "bad")).rejects.toThrow()
    expect(await exists(path.join(project, "..", "outside.md"))).toBe(false)
  })
})

describe("the machine-wide root", () => {
  it("writes under the machine-wide root rather than the workspace", async () => {
    await deliver(files, GLOBAL, prompt, "rule")
    expect(await exists(path.join(machine, ".agents", "rules", "code-review.md"))).toBe(true)
    expect(await exists(at(".agents", "rules", "code-review.md"))).toBe(false)
  })

  it("reads its own documents there", async () => {
    expect(targetOf(GLOBAL, prompt, "instructions", "agents").scope).toBe("global")
    await deliver(files, GLOBAL, prompt, "instructions", "design")
    expect(await exists(path.join(machine, "DESIGN.md"))).toBe(true)
  })
})
