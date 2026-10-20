/**
 * The old places-only provider, carried through the new contract.
 *
 * The Claude Code extension that shipped against the old shape is still
 * installed, so its directories and documents have to keep working until it is
 * updated. These tests use the real workspace root and a throwaway project.
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createFsPlaceFiles } from "@context-hub/core/host/place-files"

import {
  isLegacyPromptProvider,
  legacyPromptProvider,
  type LegacyPromptProvider,
} from "../src/legacy.ts"
import type { PromptIo } from "../src/provider.ts"
import type { Prompt } from "../src/store.ts"

let home: string
let project: string
let machine: string
let files: ReturnType<typeof createFsPlaceFiles>
let io: PromptIo

const prompt: Prompt = {
  name: "Code Review",
  description: "Reads the diff and says what it changes",
  prompt: "Review the diff.",
  tags: [],
  updatedAt: "",
  assets: [],
}

const old: LegacyPromptProvider = {
  id: "hub.target.legacy",
  shared: true,
  places: [
    {
      id: "legacy-global",
      agent: "hub.target.legacy",
      labelKey: "legacy.tab",
      icon: () => null,
      scope: "workspace",
      order: 20,
      commandDir: ".legacy/commands",
      ruleDir: ".legacy/rules",
      agentDir: ".legacy/agents",
      documents: [
        {
          id: "memory",
          labelKey: "legacy.menu.memory",
          removeLabelKey: "legacy.menu.memory.remove",
          file: ".legacy/MEMORY.md",
        },
      ],
    },
  ],
}

const provider = legacyPromptProvider(old)
const place = "legacy-global"
const at = (...parts: string[]) => path.join(project, ...parts)
const read = (file: string) => fs.readFile(file, "utf8")
const exists = async (file: string) => (await fs.stat(file).catch(() => null)) !== null

beforeAll(async () => {
  home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-legacy-home-"))
  project = await fs.mkdtemp(path.join(tmpdir(), "context-hub-legacy-ws-"))
  machine = await fs.mkdtemp(path.join(tmpdir(), "context-hub-legacy-user-"))
  files = createFsPlaceFiles({ home, folder: project, userHome: machine })
  io = { files, workspace: () => files.workspace() }
})

afterAll(async () => {
  await fs.rm(home, { recursive: true, force: true })
  await fs.rm(project, { recursive: true, force: true })
  await fs.rm(machine, { recursive: true, force: true })
})

describe("recognising and translating the old shape", () => {
  it("recognises a places-only provider", () => {
    expect(isLegacyPromptProvider(old)).toBe(true)
    expect(isLegacyPromptProvider(provider)).toBe(false)
  })

  it("keeps the place's identity and turns its directories into forms", () => {
    const [one] = provider.places
    expect(one?.id).toBe(place)
    expect(one?.agent).toBe("hub.target.legacy")
    expect(one?.order).toBe(20)
    expect(one?.where).toBe(".legacy")
    expect(provider.shared).toBe(true)
    expect(one?.forms.map((form) => form.id)).toEqual([
      "commands",
      "rule",
      "agent",
      "instructions",
    ])
  })

  it("keeps the old extension's own words for its documents", () => {
    const instructions = provider.places[0]?.forms.find((form) => form.id === "instructions")
    expect(instructions?.labelKey).toBe("prompts.menu.documents")
    expect(instructions?.options?.[0]).toEqual({
      id: "memory",
      labelKey: "legacy.menu.memory",
      removeLabelKey: "legacy.menu.memory.remove",
    })
  })

  it("shows the machine-wide prefix for a global place", () => {
    const [one] = legacyPromptProvider({
      ...old,
      places: [{ ...old.places[0]!, scope: "global" }],
    }).places
    expect(one?.where).toBe("~/.legacy")
  })
})

describe("writing through the old directories", () => {
  it("holds nothing before anything is written", async () => {
    expect(await provider.held(io, place, prompt)).toEqual({})
  })

  it("installs a command and maps the old answer onto form keys", async () => {
    await provider.install(io, place, prompt, "commands")
    expect((await read(at(".legacy", "commands", "code-review.md"))).startsWith("---")).toBe(true)
    expect(await provider.held(io, place, prompt)).toEqual({ commands: true })
  })

  it("adds to the document the old place declared", async () => {
    await provider.install(io, place, prompt, "instructions", "memory")
    expect(await read(at(".legacy", "MEMORY.md"))).toContain("<!-- context-hub:code-review -->")
    expect(await provider.held(io, place, prompt)).toEqual({
      commands: true,
      "instructions:memory": true,
    })
  })

  it("takes both back", async () => {
    expect(await provider.remove(io, place, prompt, "instructions", "memory")).toBe(true)
    expect(await provider.remove(io, place, prompt, "commands")).toBe(true)
    expect(await exists(at(".legacy", "commands", "code-review.md"))).toBe(false)
    expect(await provider.remove(io, place, prompt, "commands")).toBe(false)
  })
})

describe("a request the old place cannot answer", () => {
  it("names a place it does not own", async () => {
    await expect(provider.held(io, "elsewhere", prompt)).rejects.toMatchObject({
      key: "prompts.error.unknownPlace",
    })
  })

  it("names an action it does not have", async () => {
    await expect(provider.install(io, place, prompt, "preset")).rejects.toMatchObject({
      key: "prompts.error.unknownForm",
    })
  })
})
