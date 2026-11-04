/**
 * Collecting a pack a market pinned to a commit.
 *
 * The repository is made on the spot, so this exercises the real `git` calls:
 * a shallow fetch by commit id, a sparse checkout of one directory, and the
 * collector's answer when the library already holds a different commit.
 */
import { execFile } from "node:child_process"
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { fetchPlugin } from "../src/host/fetch.ts"
import { createPluginCollector } from "../src/host/collect.ts"
import { createFsPluginLibrary } from "../src/host/library.ts"

function git(cwd: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", [...args], { cwd, windowsHide: true }, (error, stdout) => {
      if (error === null) resolve(String(stdout))
      else reject(error)
    })
  })
}

async function writePack(dir: string, version: string): Promise<void> {
  await fs.mkdir(path.join(dir, ".claude-plugin"), { recursive: true })
  await fs.writeFile(
    path.join(dir, ".claude-plugin", "plugin.json"),
    `${JSON.stringify({ name: "pinned-pack", version, description: "A pinned pack." })}\n`,
    "utf8"
  )
}

const root = await fs.mkdtemp(path.join(tmpdir(), "hub-market-check-"))
const repo = path.join(root, "repo")
const packDir = path.join(repo, "packs", "pinned-pack")
const hub = path.join(root, "hub")
const stage = path.join(root, "stage")
const work = path.join(root, "work")

let first = ""
let second = ""

beforeAll(async () => {
  await fs.mkdir(packDir, { recursive: true })
  await fs.mkdir(stage, { recursive: true })
  await fs.mkdir(work, { recursive: true })
  await git(repo, ["init", "--quiet"])
  await git(repo, ["config", "user.email", "check@example.test"])
  await git(repo, ["config", "user.name", "Check"])
  await writePack(packDir, "1.0.0")
  await git(repo, ["add", "-A"])
  await git(repo, ["commit", "--quiet", "-m", "first"])
  first = (await git(repo, ["rev-parse", "HEAD"])).trim()

  await writePack(packDir, "2.0.0")
  await git(repo, ["add", "-A"])
  await git(repo, ["commit", "--quiet", "-m", "second"])
  second = (await git(repo, ["rev-parse", "HEAD"])).trim()
})

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe("fetching one commit", () => {
  it("checks out one directory at the commit the index pinned", async () => {
    const empty = path.join(root, "fetch-one")
    await fs.mkdir(empty, { recursive: true })
    const origin = await fetchPlugin(
      { kind: "git-subdir", url: repo, path: "packs/pinned-pack", sha: first },
      empty,
      work
    )
    expect(origin).toMatchObject({ kind: "git-subdir", revision: first })
    const manifest = await fs.readFile(
      path.join(empty, ".claude-plugin", "plugin.json"),
      "utf8"
    )
    expect(JSON.parse(manifest).version).toBe("1.0.0")
  })

  it("fails when the commit is not there", async () => {
    const empty = path.join(root, "fetch-missing")
    await fs.mkdir(empty, { recursive: true })
    await expect(
      fetchPlugin(
        {
          kind: "git-subdir",
          url: repo,
          path: "packs/pinned-pack",
          sha: "0000000000000000000000000000000000000000",
        },
        empty,
        work
      )
    ).rejects.toThrow()
  })
})

describe("collecting a market entry", () => {
  const library = createFsPluginLibrary(hub)
  const collector = createPluginCollector(library)

  it("records the commit the market pinned", async () => {
    const collected = await collector.addSpec({
      kind: "git-subdir",
      url: repo,
      path: "packs/pinned-pack",
      sha: first,
    })
    expect(collected.already).toBe(false)
    expect(collected.record.source).toMatchObject({ revision: first })
    expect(collected.record.version).toBe("1.0.0")
  })

  it("answers the same commit as already collected", async () => {
    const collected = await collector.addSpec({
      kind: "git-subdir",
      url: repo,
      path: "packs/pinned-pack",
      sha: first,
    })
    expect(collected.already).toBe(true)
    expect(collected.record.version).toBe("1.0.0")
  })

  it("collects again when the market moved the pin", async () => {
    const collected = await collector.addSpec({
      kind: "git-subdir",
      url: repo,
      path: "packs/pinned-pack",
      sha: second,
    })
    expect(collected.already).toBe(false)
    expect(collected.record.source).toMatchObject({ revision: second })
    expect(collected.record.version).toBe("2.0.0")
    expect(await library.list()).toHaveLength(1)
  })
})
