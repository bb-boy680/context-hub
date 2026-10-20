/**
 * The built-in workspace place, carried out through the provider contract: the
 * five landings, what it already holds, and taking each one back.
 *
 * All three roots are throwaway directories, so `.agents/` and `AGENTS.md` here
 * are nobody's real files.
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createFsPlaceFiles } from "@context-hub/core/host/place-files"

import { PromptError } from "../src/failure.ts"
import type { PromptIo } from "../src/provider.ts"
import type { Prompt } from "../src/store.ts"
import { workspacePromptProvider } from "../src/workspace-provider.ts"

let home: string
let project: string
let machine: string
let files: ReturnType<typeof createFsPlaceFiles>
let io: PromptIo

const prompt: Prompt = {
  name: "Code Review",
  description: "Reads the diff and says what it changes",
  prompt: "Review the diff.\nReport what it changes.",
  tags: [],
  updatedAt: "",
  assets: [],
}

const provider = workspacePromptProvider(() => null)
const place = "workspace"
const at = (...parts: string[]) => path.join(project, ...parts)
const read = (file: string) => fs.readFile(file, "utf8")
const exists = async (file: string) => (await fs.stat(file).catch(() => null)) !== null

beforeAll(async () => {
  home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-workspace-home-"))
  project = await fs.mkdtemp(path.join(tmpdir(), "context-hub-workspace-ws-"))
  machine = await fs.mkdtemp(path.join(tmpdir(), "context-hub-workspace-user-"))
  files = createFsPlaceFiles({ home, folder: project, userHome: machine })
  io = { files, workspace: () => files.workspace() }
})

afterAll(async () => {
  await fs.rm(home, { recursive: true, force: true })
  await fs.rm(project, { recursive: true, force: true })
  await fs.rm(machine, { recursive: true, force: true })
})

describe("the place as the page reads it", () => {
  it("is the module's own, generated-only place under .agents", () => {
    const [one] = provider.places
    expect(one?.id).toBe(place)
    expect(one?.agent).toBe("hub.prompt.catalog")
    expect(provider.shared).toBe(true)
    expect(one?.generatedOnly).toBe(true)
    expect(one?.where).toBe(".agents")
    expect(one?.forms.map((form) => form.id)).toEqual([
      "commands",
      "rule",
      "agent",
      "instructions",
    ])
  })
})

describe("what it holds", () => {
  it("holds nothing before anything is written", async () => {
    expect(await provider.held(io, place, prompt)).toEqual({})
  })

  it("reports each form it has, and only the documents carrying a section", async () => {
    await provider.install(io, place, prompt, "commands")
    await provider.install(io, place, prompt, "rule")
    await provider.install(io, place, prompt, "agent")
    await provider.install(io, place, prompt, "instructions", "design")

    expect(await provider.held(io, place, prompt)).toEqual({
      commands: true,
      rule: true,
      agent: true,
      "instructions:design": true,
    })
  })
})

describe("the five landings", () => {
  it("writes a command with frontmatter", async () => {
    const command = await read(at(".agents", "commands", "code-review.md"))
    expect(command.startsWith("---\nname: Code Review\n")).toBe(true)
    expect(command).toContain("description: Reads the diff and says what it changes")
  })

  it("writes a rule as the prompt itself", async () => {
    const rule = await read(at(".agents", "rules", "code-review.md"))
    expect(rule.startsWith("---")).toBe(false)
    expect(rule).toContain("Report what it changes.")
  })

  it("writes an agents file with frontmatter", async () => {
    const agent = await read(at(".agents", "agents", "code-review.md"))
    expect(agent.startsWith("---\nname: Code Review\n")).toBe(true)
  })

  it("adds a marked section to AGENTS.md, keeping the person's own text", async () => {
    await fs.writeFile(at("AGENTS.md"), "# House rules\r\n\r\nNobody writes to main.\r\n")
    await provider.install(io, place, prompt, "instructions", "agents")
    const agents = await read(at("AGENTS.md"))
    expect(agents).toContain("Nobody writes to main.")
    expect(agents).toContain("<!-- context-hub:code-review -->")
    /* The file was written on Windows and stays that way. */
    expect(/[^\r]\n/.test(agents.replace(/\r\n/g, "")), "a stray LF").toBe(false)
  })

  it("gives DESIGN.md its own section", async () => {
    const design = await read(at("DESIGN.md"))
    expect(design).toContain("<!-- context-hub:code-review -->")
  })
})

describe("taking one back", () => {
  it("removes a generated file", async () => {
    expect(await provider.remove(io, place, prompt, "rule")).toBe(true)
    expect(await exists(at(".agents", "rules", "code-review.md"))).toBe(false)
    expect(await provider.remove(io, place, prompt, "rule")).toBe(false)
  })

  it("removes a document's section and keeps the rest", async () => {
    expect(await provider.remove(io, place, prompt, "instructions", "agents")).toBe(true)
    const agents = await read(at("AGENTS.md"))
    expect(agents).toContain("Nobody writes to main.")
    expect(agents).not.toContain("context-hub:code-review")
  })
})

describe("a request the place cannot answer", () => {
  it("names an action it does not offer", async () => {
    await expect(provider.install(io, place, prompt, "preset")).rejects.toMatchObject({
      key: "prompts.error.unknownForm",
    } satisfies Partial<PromptError>)
  })

  it("names a place it does not own", async () => {
    await expect(provider.held(io, "elsewhere", prompt)).rejects.toMatchObject({
      key: "prompts.error.unknownPlace",
    } satisfies Partial<PromptError>)
  })
})
