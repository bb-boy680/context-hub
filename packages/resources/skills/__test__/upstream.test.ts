/**
 * Behaviour of reading what a skill was installed from, and of the one hash
 * this hub computes itself.
 *
 * Everything a case compares comes from the skills CLI: it hashes the directory
 * when it installs and records the result in `skills-lock.json`, and a fresh
 * install of the same source gives the number to compare against. The one thing
 * the CLI never says is whether the files on disk were edited after the install,
 * so `skillFolderHash` repeats its algorithm for that — and the golden value
 * below is the CLI's own number for this fixture, taken once from skills@1.7.1
 * (`skills add <fixture> -a universal --copy -y --json`), so a drift here is
 * caught rather than trusted.
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { readLockedUpstream, skillFolderHash } from "../src/host/upstream.ts"

/** The CLI's own number for the fixture below, measured once. */
const GOLDEN = "9db1546341e6034e133aab54bff2169c383758c78333607d4243eb104941c177"

let home: string
let skill: string

beforeAll(async () => {
  home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-upstream-"))
  /* The fixture the golden value was measured on, byte for byte: a manifest, a
     file at the root, and one nested a directory deeper, so path order counts. */
  skill = path.join(home, "fixture-skill")
  await fs.mkdir(path.join(skill, "notes"), { recursive: true })
  await fs.writeFile(
    path.join(skill, "SKILL.md"),
    "---\nname: fixture-skill\ndescription: A fixture for the hash check\n---\n\n# Fixture\n"
  )
  await fs.writeFile(path.join(skill, "alpha.txt"), "alpha\n")
  await fs.writeFile(path.join(skill, "notes", "deep.md"), "deep\n")
})

afterAll(async () => {
  await fs.rm(home, { recursive: true, force: true })
})

describe("the folder hash", () => {
  it("matches the CLI's own number for this fixture", async () => {
    expect(await skillFolderHash(skill)).toBe(GOLDEN)
  })

  /* One byte anywhere under the skill is a different revision. */
  it("changes with one byte, and comes back when it is changed back", async () => {
    await fs.writeFile(path.join(skill, "notes", "deep.md"), "deeper\n")
    expect(await skillFolderHash(skill)).not.toBe(GOLDEN)
    await fs.writeFile(path.join(skill, "notes", "deep.md"), "deep\n")
    expect(await skillFolderHash(skill)).toBe(GOLDEN)
  })

  /* A file the CLI skips is not part of the skill's revision. */
  it("leaves node_modules and .git out", async () => {
    await fs.mkdir(path.join(skill, "node_modules", "x"), { recursive: true })
    await fs.writeFile(path.join(skill, "node_modules", "x", "index.js"), "module\n")
    await fs.mkdir(path.join(skill, ".git"), { recursive: true })
    await fs.writeFile(path.join(skill, ".git", "HEAD"), "ref: refs/heads/main\n")
    expect(await skillFolderHash(skill)).toBe(GOLDEN)
  })
})

describe("the lock the CLI writes", () => {
  const writeLock = (skills: unknown) =>
    fs.writeFile(path.join(home, "skills-lock.json"), `${JSON.stringify({ version: 1, skills })}\n`)

  it("reads back the record, with the package's kind, path and hash", async () => {
    await writeLock({
      "fixture-skill": {
        source: "mattpocock/skills",
        sourceType: "github",
        skillPath: "skills/productivity/fixture-skill/SKILL.md",
        computedHash: GOLDEN,
      },
    })
    const found = await readLockedUpstream(home, "fixture-skill")
    expect(found?.source).toBe("mattpocock/skills")
    expect(found?.sourceType).toBe("github")
    expect(found?.skillPath).toBe("skills/productivity/fixture-skill/SKILL.md")
    expect(found?.hash).toBe(GOLDEN)
  })

  /* A lock written under another display name is still this skill's record. */
  it("finds a record under another display name by its path", async () => {
    await writeLock({
      "Fixture Skill": {
        source: "mattpocock/skills",
        sourceType: "github",
        skillPath: "skills/productivity/fixture-skill/SKILL.md",
        computedHash: GOLDEN,
      },
    })
    expect((await readLockedUpstream(home, "fixture-skill"))?.hash).toBe(GOLDEN)
  })

  /* What the hub cannot trust, it refuses rather than half-reads. */
  it("is no upstream when the manifest path is missing", async () => {
    await writeLock({
      "fixture-skill": { source: "../source", sourceType: "local", computedHash: GOLDEN },
    })
    expect(await readLockedUpstream(home, "fixture-skill")).toBeNull()
  })

  it("is no upstream when the source is a folder on this machine", async () => {
    await writeLock({
      "fixture-skill": {
        source: "../source",
        sourceType: "local",
        skillPath: "fixture-skill/SKILL.md",
        computedHash: GOLDEN,
      },
    })
    expect(await readLockedUpstream(home, "fixture-skill")).toBeNull()
  })

  it("is no record when it cannot be read", async () => {
    await fs.writeFile(path.join(home, "skills-lock.json"), "{ not json")
    expect(await readLockedUpstream(home, "fixture-skill")).toBeNull()
  })

  it("is no record when the file is missing, or never mentions the name", async () => {
    await fs.rm(path.join(home, "skills-lock.json"))
    expect(await readLockedUpstream(home, "fixture-skill")).toBeNull()
    expect(await readLockedUpstream(home, "someone-else")).toBeNull()
  })
})
