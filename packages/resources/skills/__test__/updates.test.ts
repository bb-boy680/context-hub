/**
 * Behaviour of the update check: what one "Check updates" run measures, what it
 * records on the rows, and what a source that cannot be read leaves behind.
 *
 * The upstream is a small git repository on this machine, cloned through the
 * skills CLI exactly as a real source would be, so the whole chain — one CLI run
 * per package, the CLI's own hashes, the recorded answer — is exercised without
 * a network. **`git` must be on PATH**, and this file is the slow one: one CLI
 * run per package per check.
 */
import { execFile } from "node:child_process"
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { promisify } from "node:util"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { fetchUpstreamRecords } from "../src/host/skills-cli.ts"
import { createFsSkillStore } from "../src/host/skills-fs.ts"

const run = promisify(execFile)

type Library = Awaited<ReturnType<typeof createFsSkillStore>>

let home: string
let source: string
let url: string
let store: Library
let store2: Library

/** Write one skill into the fixture repository, replacing whatever was there. */
async function writeSkill(id: string, body: string) {
  const dir = path.join(source, "skills", id)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(
    path.join(dir, "SKILL.md"),
    `---\nname: ${id}\ndescription: ${body}\n---\n\n# ${id}\n\n${body}\n`
  )
}

async function commit(message: string) {
  await run("git", ["add", "-A"], { cwd: source })
  await run(
    "git",
    ["-c", "user.email=check@localhost", "-c", "user.name=check", "commit", "-q", "-m", message],
    { cwd: source }
  )
}

/** One row of a store's current catalog, read fresh. */
const row = async (library: Library, id: string) =>
  (await library.list()).items.find((item) => item.id === id)

beforeAll(async () => {
  home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-updates-"))
  source = await fs.mkdtemp(path.join(tmpdir(), "context-hub-source-"))
  await run("git", ["init", "-q"], { cwd: source })
  await writeSkill("alpha", "Alpha body")
  await writeSkill("beta", "Beta body")
  await commit("first")
  url = pathToFileURL(source).href
  store = await createFsSkillStore({ home })
})

afterAll(async () => {
  store2?.dispose()
  store?.dispose()
  await fs.rm(home, { recursive: true, force: true })
  await fs.rm(source, { recursive: true, force: true })
})

/* Both skills arrive from one source, and the install records the revision the
   CLI hashed, which is what a check later compares against. */
describe("installing from a git source", () => {
  it("installs both skills and records the source and the CLI's own hash", async () => {
    const imported = await store.installPackage(url, ["alpha", "beta"])
    expect(imported.installed).toHaveLength(2)

    const installed = await row(store, "alpha")
    expect(installed?.upstream?.source).toBe(url)
    expect(installed?.upstream?.hash).toHaveLength(64)
    expect(installed?.checked, "no check has run yet").toBeUndefined()
  })
})

/* One batch check asks each source once and records every answer. */
describe("a batch check", () => {
  it("measures both skills, finds nothing outdated, and records the answer", async () => {
    const first = await store.checkUpdates()
    expect(first.checked).toBe(2)
    expect(first.outdated).toBe(0)
    expect(first.failed).toEqual([])

    const checked = await row(store, "alpha")
    expect(checked?.checked?.latest).toBeDefined()
    expect(checked?.checked?.currentHash, "what this copy held at the same moment").toBe(
      checked?.checked?.latest
    )
  })
})

/* The source moves on: one skill changes, the other does not. */
describe("a source that moved on", () => {
  beforeAll(async () => {
    await writeSkill("alpha", "Alpha body, second revision")
    await commit("second")
  })

  it("reports the moved skill outdated, and still measures the other", async () => {
    const second = await store.checkUpdates()
    expect(second.outdated).toBe(1)
    expect(second.checked).toBe(2)
  })

  it("keeps the installed revision on the row, with the disk matching it", async () => {
    const advanced = await row(store, "alpha")
    expect(advanced?.upstream?.hash, "what was installed").not.toBe(advanced?.checked?.latest)
    expect(advanced?.checked?.currentHash).toBe(advanced?.upstream?.hash)
  })
})

/* One skill asked on its own answers the same question. */
describe("a single check", () => {
  it("finds an unmoved skill current, with nothing modified by hand", async () => {
    const single = await store.checkUpdate("beta")
    expect(single.outdated).toBe(false)
    expect(single.modified).toBe(false)
    expect(single.latestHash).toBe((await row(store, "beta"))?.upstream?.hash)
  })
})

/* A hand-edited copy is visible without cloning anything. */
describe("a hand-edited copy", () => {
  it("reports modified without becoming outdated", async () => {
    await fs.writeFile(
      path.join(home, "skills", "beta", "SKILL.md"),
      "---\nname: beta\ndescription: Beta body\n---\n\n# beta\n\nEdited by hand\n"
    )
    const modified = await store.checkUpdate("beta")
    expect(modified.modified).toBe(true)
    expect(modified.outdated).toBe(false)
  })
})

/* Updating installs the source's revision over the copy and records it. */
describe("updating", () => {
  it("records the new revision as what is on disk and on the row", async () => {
    await store.updateFromUpstream("alpha")
    const updated = await row(store, "alpha")
    expect(updated?.upstream?.hash).toBe(updated?.checked?.latest)
    expect(updated?.checked?.currentHash).toBe(updated?.checked?.latest)
    expect(await fs.readFile(path.join(home, "skills", "alpha", "SKILL.md"), "utf8")).toContain(
      "second revision"
    )
  })

  it("leaves nothing outdated", async () => {
    expect((await store.checkUpdates()).outdated).toBe(0)
  })
})

/* A fresh process reads the recorded answers back from the catalog, so the badge
   and the dialog survive a reload. */
describe("a fresh process", () => {
  beforeAll(async () => {
    store.dispose()
    const catalogPath = path.join(home, "skills", "index.json")
    const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8")) as {
      skills: Record<string, Record<string, unknown>>
    }
    catalog.skills["ghost-test"] = {
      name: "ghost-test",
      description: "The source for this one cannot be read",
      tags: [],
      enabled: true,
      source: "registry",
      assets: [],
      mtimeMs: 1,
      updatedAt: "",
      upstream: {
        source: `${url}-missing`,
        sourceType: "git",
        skillPath: "skills/ghost-test/SKILL.md",
        hash: "0".repeat(64),
      },
    }
    await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`)
    await fs.mkdir(path.join(home, "skills", "ghost-test"), { recursive: true })
    await fs.writeFile(
      path.join(home, "skills", "ghost-test", "SKILL.md"),
      "---\nname: ghost-test\ndescription: The source for this one cannot be read\n---\n\n# ghost\n"
    )
    store2 = await createFsSkillStore({ home })
  })

  it("still sees the recorded check", async () => {
    expect((await row(store2, "alpha"))?.checked?.latest).toBeDefined()
  })

  it("keeps the source a hand-written row declares", async () => {
    expect((await row(store2, "ghost-test"))?.upstream?.source).toBe(`${url}-missing`)
  })
})

/* One unreachable source is named, and the others still answer. */
describe("an unreachable source", () => {
  it("leaves the readable ones answering, and names the failure with a reason", async () => {
    const mixed = await store2.checkUpdates()
    expect(mixed.checked).toBe(2)
    expect(mixed.failed).toHaveLength(1)
    expect(mixed.failed[0]?.name).toBe("ghost-test")
    expect(mixed.failed[0]?.reason.length).toBeGreaterThan(0)
  })
})

/* What cannot be answered says so rather than guessing. */
describe("what cannot be answered", () => {
  it("refuses an unknown skill, and one with no recorded source", async () => {
    await expect(store2.checkUpdate("nope")).rejects.toThrow(/unknown skill/)
    const created = await store2.create({ name: "No Source", description: "Written here" })
    await expect(store2.checkUpdate(created.id)).rejects.toThrow(/no recorded source/)
  })

  it("touches nothing when asked about no skills", async () => {
    const none = await fetchUpstreamRecords(url, [])
    expect(none.records.size).toBe(0)
    expect(none.failed.size).toBe(0)
  })
})
