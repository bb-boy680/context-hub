/**
 * Behaviour of the update check: what one "Check updates" run measures, what it
 * records on the rows, and what a source that cannot be read leaves behind.
 *
 * The upstream is a small git repository on this machine, reached through a
 * `file://` URL exactly as a real source would be, so the whole chain — install
 * through the skills CLI, `git ls-remote`, the recorded answer — is exercised
 * without a network. **`git` must be on PATH**, and this file is the slow one:
 * an install or update still runs the CLI once per package.
 */
import { execFile } from "node:child_process"
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { promisify } from "node:util"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

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

/** The fixture repository's current commit, which is what a check records. */
async function head(): Promise<string> {
  return (await run("git", ["rev-parse", "HEAD"], { cwd: source })).stdout.trim()
}

/** One row of a store's current catalog, read fresh. */
const row = async (library: Library, name: string) =>
  (await library.list()).items.find((item) => item.name === name)

beforeAll(async () => {
  home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-updates-"))
  source = await fs.mkdtemp(path.join(tmpdir(), "context-hub-source-"))
  await run("git", ["init", "-q", "-b", "main"], { cwd: source })
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

/* Both skills arrive from one source, and the install records the commit the
   CLI installed from — what a later check compares against. */
describe("installing from a git source", () => {
  it("installs both skills and records the source, the commit and the hash", async () => {
    const imported = await store.installPackage(url, ["alpha", "beta"])
    expect(imported.installed).toHaveLength(2)

    const installed = await row(store, "alpha")
    expect(installed?.upstream?.source).toBe(url)
    expect(installed?.upstream?.hash).toHaveLength(64)
    expect(installed?.upstream?.revision).toBe(await head())
    expect(installed?.checked, "no check has run yet").toBeUndefined()
  })
})

/* One batch check asks the repository once and records every answer. */
describe("a batch check at the installed commit", () => {
  it("measures both skills, finds nothing outdated, and records the answer", async () => {
    const first = await store.checkUpdates()
    expect(first.checked).toBe(2)
    expect(first.outdated).toBe(0)
    expect(first.failed).toEqual([])

    const checked = await row(store, "alpha")
    expect(checked?.checked?.latest, "the commit the source held").toBe(
      checked?.upstream?.revision
    )
    expect(checked?.checked?.currentHash, "what this copy held at the same moment").toBe(
      checked?.upstream?.hash
    )
  })
})

/* The repository moves on, which is a repository-wide signal: every skill taken
   from it is measured against the new HEAD, whether or not its own directory
   changed. The update below is where the directory is compared. */
describe("a source that moved on", () => {
  beforeAll(async () => {
    await writeSkill("alpha", "Alpha body, second revision")
    await commit("second")
  })

  it("reports every skill from the moved repository outdated, and measures both", async () => {
    const second = await store.checkUpdates()
    expect(second.outdated).toBe(2)
    expect(second.checked).toBe(2)
  })

  it("keeps the installed revision on the row, with the disk matching it", async () => {
    const advanced = await row(store, "alpha")
    expect(advanced?.upstream?.revision, "what was installed").not.toBe(
      advanced?.checked?.latest
    )
    expect(advanced?.checked?.currentHash).toBe(advanced?.upstream?.hash)
  })
})

/* Updating installs the source's revision over the copy and records it. */
describe("updating", () => {
  it("records the new revision as what is on disk and on the row", async () => {
    const before = await row(store, "alpha")
    await store.updateFromUpstream("alpha")
    const updated = await row(store, "alpha")
    expect(updated?.upstream?.revision).toBe(await head())
    expect(updated?.upstream?.revision).toBe(updated?.checked?.latest)
    expect(updated?.upstream?.hash).not.toBe(before?.upstream?.hash)
    expect(updated?.checked?.currentHash).toBe(updated?.upstream?.hash)
    expect(await fs.readFile(path.join(home, "skills", "alpha", "SKILL.md"), "utf8")).toContain(
      "second revision"
    )
  })

  it("advances the revision without replacing files the source did not change", async () => {
    /* A hand edit is the canary: a swap would take it away. */
    const marker = path.join(home, "skills", "beta", "edited-here.txt")
    await fs.writeFile(marker, "kept\n")
    const before = await row(store, "beta")

    await store.updateFromUpstream("beta")

    const after = await row(store, "beta")
    expect(after?.upstream?.revision).toBe(await head())
    expect(after?.upstream?.hash).toBe(before?.upstream?.hash)
    expect(await fs.readFile(marker, "utf8")).toBe("kept\n")
    expect(after?.checked?.currentHash).not.toBe(after?.upstream?.hash)
  })

  it("leaves nothing outdated, and still reports the changed copy", async () => {
    const settled = await store.checkUpdates()
    expect(settled.outdated).toBe(0)
    expect(settled.modified).toBe(1)
  })
})

/* One skill asked on its own answers the same question. */
describe("a single check", () => {
  it("finds an unmoved source current, with a copy edited here", async () => {
    const single = await store.checkUpdate("beta")
    expect(single.outdated).toBe(false)
    expect(single.modified).toBe(true)
    expect(single.latestRevision).toBe((await row(store, "beta"))?.upstream?.revision)
    expect(single.recordedRevision).toBe((await row(store, "beta"))?.upstream?.revision)
  })
})

/* A fresh process reads the recorded answers back from the catalog, so the badge
   and the dialog survive a reload. */
describe("a fresh process", () => {
  beforeAll(async () => {
    store.dispose()
    const catalogPath = path.join(home, "skills", "skills.json")
    const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8")) as Record<
      string,
      unknown
    >[]
    catalog.push({
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
    })
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
    expect((await row(store2, "alpha"))?.checked?.latest).toBe(
      (await row(store2, "alpha"))?.upstream?.revision
    )
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
    await expect(store2.checkUpdate(created.name)).rejects.toThrow(/no recorded source/)
  })
})

/* A row written before checks compared commits has no revision. It is not
   guessed current: one update establishes the commit and then settles. */
describe("a row written before revisions were recorded", () => {
  let legacyHome: string
  let legacy: Library

  beforeAll(async () => {
    legacyHome = await fs.mkdtemp(path.join(tmpdir(), "context-hub-legacy-"))
    const first = await createFsSkillStore({ home: legacyHome })
    await first.installPackage(url, ["alpha"])
    first.dispose()

    const catalogPath = path.join(legacyHome, "skills", "skills.json")
    const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8")) as Record<
      string,
      unknown
    >[]
    const entry = catalog.find((one) => one.name === "alpha") as
      | { upstream?: { revision?: string } }
      | undefined
    if (entry?.upstream !== undefined) delete entry.upstream.revision
    await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`)

    legacy = await createFsSkillStore({ home: legacyHome })
  })

  afterAll(async () => {
    legacy.dispose()
    await fs.rm(legacyHome, { recursive: true, force: true })
  })

  it("is not current until one update records its commit", async () => {
    const before = await legacy.checkUpdate("alpha")
    expect(before.recordedRevision).toBeNull()
    expect(before.outdated).toBe(true)

    await legacy.updateFromUpstream("alpha")
    const after = await legacy.checkUpdate("alpha")
    expect(after.recordedRevision).toBe(await head())
    expect(after.outdated).toBe(false)
  })
})

/* One remote answers for every skill taken from it. */
describe("two skills from one source", () => {
  it("asks the remote once", async () => {
    const dedupeHome = await fs.mkdtemp(path.join(tmpdir(), "context-hub-dedupe-"))
    let asks = 0
    const counted = await createFsSkillStore({
      home: dedupeHome,
      resolveRevision: async () => {
        asks += 1
        return "c".repeat(40)
      },
    })
    try {
      await counted.installPackage(url, ["alpha", "beta"])
      asks = 0
      const summary = await counted.checkUpdates()
      expect(summary.checked).toBe(2)
      expect(asks, "one ls-remote for the one remote").toBe(1)
    } finally {
      counted.dispose()
      await fs.rm(dedupeHome, { recursive: true, force: true })
    }
  })
})

/* A version mark is the only thing that makes the next check meaningful, so an
   update that cannot read one must refuse before it moves any file. */
describe("an update whose source cannot be read", () => {
  it("refuses before touching the files", async () => {
    const updateHome = await fs.mkdtemp(path.join(tmpdir(), "context-hub-broken-"))
    const first = await createFsSkillStore({
      home: updateHome,
      resolveRevision: async () => "d".repeat(40),
    })
    await first.installPackage(url, ["alpha"])
    first.dispose()

    const broken = await createFsSkillStore({
      home: updateHome,
      resolveRevision: async () => {
        throw new Error("git is not on PATH")
      },
    })
    try {
      const file = path.join(updateHome, "skills", "alpha", "SKILL.md")
      const before = await fs.readFile(file, "utf8")
      await expect(broken.updateFromUpstream("alpha")).rejects.toThrow(/git is not on PATH/)
      expect(await fs.readFile(file, "utf8")).toBe(before)
    } finally {
      broken.dispose()
      await fs.rm(updateHome, { recursive: true, force: true })
    }
  })
})
