/**
 * Installing one market version: clone the repository, verify the hash, and
 * move the directory into place.
 *
 * The tests build a real git repository in a temporary directory, so the git
 * command sequence is exercised rather than mocked. The hub home and the
 * repository are both removed afterwards.
 */
import { execFile } from "node:child_process"
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import type { ExtensionMarketPlugin, ExtensionMarketVersion } from "../src/extension-market.ts"
import {
  installExtensionFromMarket,
  removeInstalledExtension,
  replaceDirectory,
} from "../src/host/extension-market.ts"
import { createFsPluginStore } from "../src/host/plugins-fs.ts"
import { createFsStateStore } from "../src/host/state-fs.ts"

const ID = "demo.counter"
const MANIFEST = `id: ${ID}\nname: Demo\napiVersion: "^0.1"\n`

const temporary: string[] = []

afterEach(async () => {
  for (const dir of temporary.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

function git(args: readonly string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", [...args], { cwd, windowsHide: true }, (error, stdout, stderr) => {
      if (error === null) {
        resolve(`${String(stdout)}${String(stderr)}`)
        return
      }
      reject(new Error(`${error.message}\n${String(stderr)}`))
    })
  })
}

async function repository(): Promise<{ repo: string; dir: string }> {
  const repo = await fs.mkdtemp(path.join(tmpdir(), "hub-market-repo-"))
  temporary.push(repo)
  const dir = path.join(repo, "plugins", ID)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, "plugin.yaml"), MANIFEST)
  await fs.writeFile(
    path.join(dir, "package.json"),
    JSON.stringify({ name: ID, version: "1.0.0", type: "module", main: "index.js" })
  )
  await fs.writeFile(path.join(dir, "index.js"), "export function apply() {}\n")
  await git(["init", "--quiet"], repo)
  await git(["add", "."], repo)
  await git(
    ["-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "--quiet", "-m", "one"],
    repo
  )
  return { repo, dir }
}

/** A packed plugin: the entry lives in `lib/` and `package.json` declares it. */
async function packagedRepository(
  main?: string | number,
  packageVersion: string | number = "1.0.0"
): Promise<{ repo: string; dir: string }> {
  const repo = await fs.mkdtemp(path.join(tmpdir(), "hub-market-repo-"))
  temporary.push(repo)
  const dir = path.join(repo, "plugins", ID)
  const entry = typeof main === "string" ? main : "index.js"
  await fs.mkdir(path.dirname(path.join(dir, entry)), { recursive: true })
  await fs.writeFile(path.join(dir, "plugin.yaml"), MANIFEST)
  await fs.writeFile(path.join(dir, entry), "export function apply() {}\n")
  const packageDocument: Record<string, unknown> = {
    name: ID,
    version: packageVersion,
    type: "module",
  }
  if (main !== undefined) packageDocument.main = main
  await fs.writeFile(path.join(dir, "package.json"), JSON.stringify(packageDocument))
  await git(["init", "--quiet"], repo)
  await git(["add", "."], repo)
  await git(
    ["-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "--quiet", "-m", "one"],
    repo
  )
  return { repo, dir }
}

/** A plugin with no package.json: a market install must refuse it. */
async function bareRepository(): Promise<{ repo: string; dir: string }> {
  const repo = await fs.mkdtemp(path.join(tmpdir(), "hub-market-repo-"))
  temporary.push(repo)
  const dir = path.join(repo, "plugins", ID)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, "plugin.yaml"), MANIFEST)
  await fs.writeFile(path.join(dir, "index.js"), "export function apply() {}\n")
  await git(["init", "--quiet"], repo)
  await git(["add", "."], repo)
  await git(
    ["-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "--quiet", "-m", "one"],
    repo
  )
  return { repo, dir }
}

async function versionOf(args: {
  repo: string
  version?: string
}): Promise<ExtensionMarketVersion> {
  return {
    version: args.version ?? "1.0.0",
    apiVersion: "^0.1",
    source: {
      type: "git",
      url: args.repo,
      path: `plugins/${ID}`,
    },
  }
}

function pluginOf(version: ExtensionMarketVersion): ExtensionMarketPlugin {
  return {
    id: ID,
    title: "Demo",
    description: "Demo",
    icon: "https://example.test/icon.svg",
    author: "Test",
    permissions: [],
    versions: [version],
  }
}

async function newHome(): Promise<{
  home: string
  store: ReturnType<typeof createFsPluginStore>
  state: ReturnType<typeof createFsStateStore>
}> {
  const home = await fs.mkdtemp(path.join(tmpdir(), "hub-market-home-"))
  temporary.push(home)
  return { home, store: createFsPluginStore(home), state: createFsStateStore(home) }
}

describe("installing a market version", () => {
  it("clones the repository, verifies the hash and enables a fresh install", async () => {
    const source = await repository()
    const { home, store, state } = await newHome()
    const version = await versionOf(source)

    const result = await installExtensionFromMarket({
      store,
      state,
      plugin: pluginOf(version),
      version,
    })

    expect(result).toMatchObject({ id: ID, version: "1.0.0", enabled: true, fresh: true })
    expect(await fs.readFile(path.join(home, "extensions", ID, "index.js"), "utf8")).toContain(
      "apply"
    )
    expect(await store.records()).toMatchObject({
      [ID]: { version: "1.0.0" },
    })
    expect(await state.read("extensions")).toEqual({ [ID]: true })
  })

  it("installs a packed plugin whose package declares its entry", async () => {
    const source = await packagedRepository("lib/index.js")
    const { home, store, state } = await newHome()
    const version = await versionOf(source)

    const result = await installExtensionFromMarket({
      store,
      state,
      plugin: pluginOf(version),
      version,
    })

    expect(result).toMatchObject({ id: ID, version: "1.0.0", enabled: true, fresh: true })
    expect(
      await fs.readFile(path.join(home, "extensions", ID, "lib", "index.js"), "utf8")
    ).toContain("apply")
  })

  it("installs a packed plugin whose package declares no main", async () => {
    const source = await packagedRepository()
    const { home, store, state } = await newHome()
    const version = await versionOf(source)

    const result = await installExtensionFromMarket({
      store,
      state,
      plugin: pluginOf(version),
      version,
    })

    expect(result.id).toBe(ID)
    expect(
      await fs.readFile(path.join(home, "extensions", ID, "index.js"), "utf8")
    ).toContain("apply")
  })

  it("refuses a package main whose entry file is missing", async () => {
    const source = await packagedRepository("lib/index.js")
    await fs.rm(path.join(source.dir, "lib", "index.js"))
    await git(["add", "-A"], source.repo)
    await git(
      [
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.test",
        "commit",
        "--quiet",
        "-m",
        "missing entry",
      ],
      source.repo
    )
    const { store, state } = await newHome()
    const version = await versionOf(source)

    await expect(
      installExtensionFromMarket({ store, state, plugin: pluginOf(version), version })
    ).rejects.toThrow(/is missing/)
  })

  it("refuses a package with no package.json", async () => {
    const source = await bareRepository()
    const { store, state } = await newHome()
    const version = await versionOf(source)

    await expect(
      installExtensionFromMarket({ store, state, plugin: pluginOf(version), version })
    ).rejects.toThrow(/package\.json is missing/)
  })

  it("refuses a package main that is not a string", async () => {
    const source = await packagedRepository(42)
    const { store, state } = await newHome()
    const version = await versionOf(source)

    await expect(
      installExtensionFromMarket({ store, state, plugin: pluginOf(version), version })
    ).rejects.toThrow(/main must be a non-empty string/)
  })

  it("replaces an installed version and keeps the user's enablement choice", async () => {
    const source = await repository()
    const { home, store, state } = await newHome()
    const first = await versionOf(source)
    await installExtensionFromMarket({ store, state, plugin: pluginOf(first), version: first })
    await state.write("extensions", { [ID]: false })

    await fs.writeFile(
      path.join(source.dir, "package.json"),
      JSON.stringify({ name: ID, version: "1.1.0", type: "module", main: "index.js" })
    )
    await fs.writeFile(path.join(source.dir, "index.js"), "export function apply() { return 2 }\n")
    await git(["add", "."], source.repo)
    await git(
      [
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.test",
        "commit",
        "--quiet",
        "-m",
        "two",
      ],
      source.repo
    )
    const second = await versionOf({ ...source, version: "1.1.0" })

    const result = await installExtensionFromMarket({
      store,
      state,
      plugin: pluginOf(second),
      version: second,
    })

    expect(result).toMatchObject({ version: "1.1.0", enabled: false, fresh: false })
    expect(await fs.readFile(path.join(home, "extensions", ID, "index.js"), "utf8")).toContain(
      "return 2"
    )
    expect(await state.read("extensions")).toEqual({ [ID]: false })
  })

  it("refuses a package version that disagrees with the index", async () => {
    const source = await packagedRepository(undefined, "1.0.1")
    const { store, state } = await newHome()
    const version = await versionOf(source)

    await expect(
      installExtensionFromMarket({ store, state, plugin: pluginOf(version), version })
    ).rejects.toThrow(/package\.json says/)
  })

  it("refuses a package version that is not a string", async () => {
    const source = await packagedRepository(undefined, 42)
    const { store, state } = await newHome()
    const version = await versionOf(source)

    await expect(
      installExtensionFromMarket({ store, state, plugin: pluginOf(version), version })
    ).rejects.toThrow(/version must be a non-empty string/)
  })

  it("refuses a source path that leaves the repository", async () => {
    const source = await repository()
    const { store, state } = await newHome()
    const version = await versionOf(source)
    const outside = {
      ...version,
      source: { ...version.source, path: "../outside" },
    }

    await expect(
      installExtensionFromMarket({ store, state, plugin: pluginOf(outside), version: outside })
    ).rejects.toThrow(/leaves the repository/)
  })

  it("removes an installed extension and its enablement key", async () => {
    const source = await repository()
    const { home, store, state } = await newHome()
    const version = await versionOf(source)
    await installExtensionFromMarket({ store, state, plugin: pluginOf(version), version })

    await removeInstalledExtension({ store, state, id: ID })

    await expect(fs.stat(path.join(home, "extensions", ID))).rejects.toThrow()
    expect(await state.read("extensions")).toEqual({})
  })

  it("refuses to remove an id that is not installed", async () => {
    const { store, state } = await newHome()
    await expect(removeInstalledExtension({ store, state, id: ID })).rejects.toThrow(
      /is not installed/
    )
  })
})

describe("replaceDirectory", () => {
  it("puts the old directory back when the second move fails", async () => {
    const home = await fs.mkdtemp(path.join(tmpdir(), "hub-market-home-"))
    temporary.push(home)
    const target = path.join(home, "extensions", ID)
    await fs.mkdir(target, { recursive: true })
    await fs.writeFile(path.join(target, "old.txt"), "old")
    const staging = path.join(home, "extensions", ".staging-test")
    await fs.mkdir(staging, { recursive: true })
    await fs.writeFile(path.join(staging, "new.txt"), "new")

    const rename = async (from: string, to: string): Promise<void> => {
      if (from === staging && to === target) {
        throw Object.assign(new Error("busy"), { code: "EACCES" })
      }
      await fs.rename(from, to)
    }

    await expect(replaceDirectory({ staging, target, rename })).rejects.toThrow(
      /previous files remain/
    )
    expect(await fs.readFile(path.join(target, "old.txt"), "utf8")).toBe("old")
  })
})
