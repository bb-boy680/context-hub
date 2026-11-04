import { promises as fs } from "node:fs"
import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { writeFileAtomic } from "@context-hub/core/host/atomic"
import { createFsPluginLibrary } from "../src/host/library.ts"
import { createInstallerFiles } from "../src/host/installer-files.ts"
import { writeMarketplaceIndexes } from "../src/host/marketplace.ts"
import type { PluginDiskDeclaration, PluginJournalCommit } from "../src/provider.ts"

const declaration: PluginDiskDeclaration = {
  home: ".claude",
  homeEnv: "CLAUDE_CONFIG_DIR",
  state: "plugins",
  stateEnv: "CLAUDE_CODE_PLUGIN_CACHE_DIR",
  config: { write: ["settings.json"], read: ["skills", "skills/*", "skills/*/.claude-plugin/plugin.json"] },
  stateFiles: { write: ["installed_plugins.json", "known_marketplaces.json", "cache/*/*/*", "cache/*/*/*/.orphaned_at"], read: [] },
  workspace: { write: [".claude/settings.json", ".claude/settings.local.json"], read: [".claude/skills", ".claude/skills/*", ".claude/skills/*/.claude-plugin/plugin.json"] },
  library: { write: [], read: [".claude-plugin/marketplace.json", "*/.claude-plugin/plugin.json", "*/.claude-plugin/marketplace.json", "*/plugin.json"] },
  external: ["*", ".claude-plugin/marketplace.json", ".claude-plugin/plugin.json"],
}

let root: string
let workspace: string | null
let env: NodeJS.ProcessEnv

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(tmpdir(), "hub-plugin-files-中文 % "))
  workspace = path.join(root, "workspace")
  env = { CLAUDE_CONFIG_DIR: path.join(root, "config"), CLAUDE_CODE_PLUGIN_CACHE_DIR: path.join(root, "plugin state") }
  await fs.mkdir(workspace, { recursive: true })
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

function files(write?: typeof writeFileAtomic) {
  return createInstallerFiles({
    library: createFsPluginLibrary(path.join(root, "hub")),
    workspace: async () => workspace,
    userHome: path.join(root, "user"),
    env,
    write,
  })
}

async function collect(): Promise<void> {
  const library = createFsPluginLibrary(path.join(root, "hub"))
  const staged = path.join(root, "staged")
  await fs.mkdir(path.join(staged, ".claude-plugin"), { recursive: true })
  await fs.mkdir(path.join(staged, "skills", "one"), { recursive: true })
  await fs.writeFile(path.join(staged, ".claude-plugin", "plugin.json"), '{"name":"demo","version":"1.0.0"}')
  await fs.writeFile(path.join(staged, "skills", "one", "SKILL.md"), "one")
  await library.add("demo", staged, { kind: "local", path: root }, "fixture")
}

function journalScope(): PluginDiskDeclaration {
  return {
    ...declaration,
    directories: [":name"],
    config: { write: ["store/lock", "store/state.json", "store/previous.json", "store/projection.json", "store/transactions/*", "store/staging/*", "store/rollback/*"], read: ["store/transactions", "store/staging", "store/rollback"] },
    stateFiles: { write: ["*"], read: [] },
    library: { write: [], read: ["demo"] },
    lease: { ref: { root: "config", path: "store/lock" }, stale: 60000, update: 5000, retries: { retries: 0, factor: 1, minTimeout: 10, maxTimeout: 10, randomize: false } },
  }
}

function journalRecipe(sourceSnapshot: string): PluginJournalCommit {
  return {
    pending: { root: "config", path: "store/transactions" },
    guardEmpty: [{ root: "config", path: "store/staging" }, { root: "config", path: "store/rollback" }],
    journal: { ref: { root: "config", path: "store/transactions/fixture.json" }, prepared: '{"phase":"prepared"}', swapped: '{"phase":"swapped"}', committed: '{"phase":"committed"}' },
    before: [{ ref: { root: "config", path: "store/previous.json" }, before: null, after: "previous" }],
    commit: { ref: { root: "config", path: "store/state.json" }, before: null, after: "committed" },
    after: [{ ref: { root: "config", path: "store/projection.json" }, before: null, after: "projection" }],
    artifact: { operation: "copy", name: "demo", destination: "demo", sourceSnapshot, before: null, staging: { root: "config", path: "store/staging/fixture" }, backup: { root: "config", path: "store/rollback/fixture" } },
  }
}

describe("installer file roots and boundaries", () => {
  it("writes marketplace documents only to safe paths", async () => {
    const library = path.join(root, "library")
    await writeMarketplaceIndexes(library, [{ path: ".agents/plugins/marketplace.json", document: { name: "demo" } }])
    expect(await fs.readFile(path.join(library, ".agents/plugins/marketplace.json"), "utf8")).toBe('{\n  "name": "demo"\n}\n')
    for (const target of ["../outside.json", "/outside.json", "a/b/c/d.json", "a/file.txt"]) {
      await expect(writeMarketplaceIndexes(library, [{ path: target, document: {} }])).rejects.toThrow()
    }
    await fs.symlink(root, path.join(library, "linked"), "junction")
    await expect(writeMarketplaceIndexes(library, [{ path: "linked/out.json", document: {} }])).rejects.toThrow(/symbolic link/)
  })
  it("accepts generic scopes and rejects unsafe declarations", async () => {
    const disk = files()
    for (const home of ["..", "../other", "/absolute", "a/b"]) {
      await expect(disk.roots({ ...declaration, home })).rejects.toThrow()
    }
    for (const pattern of ["../x", "/x", "a/*bad"]) {
      await expect(disk.roots({ ...declaration, config: { write: [pattern], read: [] } })).rejects.toThrow()
    }
    const codex = { ...declaration, home: ".codex", homeEnv: undefined, stateEnv: undefined, config: { write: ["config.toml"], read: [] }, stateFiles: { write: [], read: ["cache/*/*"] } }
    const roots = await disk.roots(codex)
    await disk.run(codex, async (locked) => disk.commit(locked, [{ ref: { root: "config", path: "config.toml" }, before: null, after: "test = true" }]))
    expect(await disk.read(roots, { root: "config", path: "config.toml" })).toBe("test = true")
    await expect(disk.read(roots, { root: "plugins", path: "installed_plugins.json" })).rejects.toThrow(/allowlist/)
  })
  it("validates each segment of a nested state root and rejects intermediate links", async () => {
    const disk = files()
    const nested = { ...declaration, state: "cli/plugins", stateEnv: undefined }
    const roots = await disk.roots(nested)
    expect(roots.plugins).toBe(path.join(roots.config, "cli", "plugins"))
    for (const state of ["", "/plugins", "cli//plugins", "cli/../plugins", "cli/./plugins", "C:/plugins", "cli\\plugins"]) {
      await expect(disk.roots({ ...nested, state })).rejects.toThrow()
    }
    await fs.mkdir(roots.config, { recursive: true })
    await fs.symlink(root, path.join(roots.config, "cli"), "junction")
    await expect(disk.roots(nested)).rejects.toThrow(/symbolic link/)
  })

  it("resolves independent overrides and preserves absence", async () => {
    const disk = files()
    const roots = await disk.roots(declaration)
    expect(roots.config).toBe(env.CLAUDE_CONFIG_DIR)
    expect(roots.plugins).toBe(env.CLAUDE_CODE_PLUGIN_CACHE_DIR)
    expect(await disk.read(roots, { root: "config", path: "settings.json" })).toBeNull()
    expect(await disk.list(roots, { root: "config", path: "skills" })).toEqual([])
    await expect(disk.read(roots, { root: "plugins", path: "data/demo/secret" })).rejects.toThrow(/allowlist/)
    await expect(disk.roots({ ...declaration, home: "../other" })).rejects.toThrow(/invalid/)
    delete env.CLAUDE_CODE_PLUGIN_CACHE_DIR
    expect((await disk.roots(declaration)).plugins).toBe(path.join(env.CLAUDE_CONFIG_DIR!, "plugins"))
    env.CLAUDE_CONFIG_DIR = "relative"
    await expect(disk.roots(declaration)).rejects.toThrow(/absolute/)
  })

  it("supports an explicitly declared direct-child plugin directory", async () => {
    await collect()
    const disk = files()
    const scoped = { ...declaration, directories: [":name"], stateFiles: { write: ["*"], read: [] } }
    await disk.run(scoped, async (roots) => {
      await disk.commit(roots, [], { name: "demo", destination: "demo", before: null })
      const ref = { root: "plugins" as const, path: "demo" }
      const snapshot = await disk.snapshotDirectory(roots, ref)
      expect(snapshot).toMatch(/^[a-f0-9]{64}$/)
      await expect(disk.removeDirectory(roots, { root: "plugins", path: ".." })).rejects.toThrow()
      await disk.commit(roots, [], undefined, { ref, before: snapshot })
      expect(await disk.snapshotDirectory(roots, ref)).toBeNull()
    })
    for (const template of ["*", ":name/:name", "../:name", ""]) {
      await expect(disk.roots({ ...scoped, directories: [template] })).rejects.toThrow()
    }
  })

  it("expands declared environment roots and captures canonical workspaces", async () => {
    const disk = files()
    const scoped = { ...declaration, stateEnv: undefined, homeEnvResolution: "workspace" as const, canonicalWorkspace: true }
    env.CLAUDE_CONFIG_DIR = "~/custom"
    const expanded = await disk.roots(scoped)
    expect(expanded.config).toBe(path.join(root, "user", "custom"))
    expect(expanded.workspaceCanonical).toBe(await fs.realpath(workspace!))
    const actualWorkspace = workspace!
    const linkedWorkspace = path.join(root, "linked-workspace")
    await fs.symlink(actualWorkspace, linkedWorkspace, "junction")
    workspace = linkedWorkspace
    expect((await disk.roots(scoped)).workspaceCanonical).toBe(await fs.realpath(actualWorkspace))
    workspace = actualWorkspace
    env.CLAUDE_CONFIG_DIR = "relative/config"
    expect((await disk.roots(scoped)).config).toBe(path.join(workspace!, "relative", "config"))
    workspace = path.join(root, "missing-workspace")
    expect((await disk.roots(scoped)).workspaceCanonical).toBe(workspace)
    workspace = null
    await expect(disk.roots(scoped)).rejects.toThrow(/selected workspace/)
    await expect(disk.roots({ ...declaration, homeEnvResolution: "invalid" as never })).rejects.toThrow(/resolution/)
  })

  it("refuses path escapes, symlinks, and workspace changes", async () => {
    const disk = files()
    const roots = await disk.roots(declaration)
    for (const unsafe of ["../elsewhere", "..\\elsewhere", "C:/other", "/absolute"]) {
      await expect(disk.read(roots, { root: "config", path: unsafe })).rejects.toThrow()
    }
    await fs.mkdir(roots.config, { recursive: true })
    await fs.symlink(root, path.join(roots.config, "skills"), "junction")
    await expect(disk.list(roots, { root: "config", path: "skills" })).rejects.toThrow(/symbolic link/)
    workspace = null
    await expect(disk.read(roots, { root: "config", path: "settings.json" })).rejects.toThrow(/changed/)
    const noWorkspace = await disk.roots(declaration)
    await expect(disk.read(noWorkspace, { root: "workspace", path: ".claude/settings.json" })).rejects.toThrow(/no workspace/)
  })

  it("detects stale snapshots and restores earlier writes on failure", async () => {
    const disk = files(async (file, text) => {
      if (file.endsWith("known_marketplaces.json")) throw new Error("injected failure")
      await writeFileAtomic(file, text)
    })
    const roots = await disk.roots(declaration)
    const first = { root: "config" as const, path: "settings.json" }
    const second = { root: "plugins" as const, path: "known_marketplaces.json" }
    await fs.mkdir(roots.config, { recursive: true })
    await fs.writeFile(path.join(roots.config, "settings.json"), "before")
    await disk.run(declaration, async (locked) => {
      await expect(disk.commit(locked, [
        { ref: first, before: "stale", after: "changed" },
      ])).rejects.toThrow(/changed/)
      await expect(disk.commit(locked, [
        { ref: first, before: "before", after: "after" },
        { ref: second, before: null, after: "second" },
      ])).rejects.toThrow(/injected failure/)
      expect(await disk.read(locked, first)).toBe("before")
      expect(await disk.read(locked, second)).toBeNull()
    })
  })

  it("respects a compatible lock held by another process", async () => {
    const lockPath = path.join(env.CLAUDE_CONFIG_DIR!, "extension-store", "lock")
    await fs.mkdir(path.dirname(lockPath), { recursive: true })
    await fs.writeFile(lockPath, "")
    const modulePath = createRequire(import.meta.url).resolve("proper-lockfile")
    const script = `const lock=require(process.argv[1]); lock(process.argv[2],{stale:60000,update:5000}).then(release=>{process.send('ready');process.on('message',async()=>{await release();process.exit(0)})}).catch(error=>{console.error(error);process.exit(1)})`
    const child = spawn(process.execPath, ["-e", script, modulePath, lockPath], { stdio: ["ignore", "ignore", "pipe", "ipc"] })
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("lock fixture did not start")), 5000)
        child.once("message", () => { clearTimeout(timer); resolve() })
        child.once("exit", code => { clearTimeout(timer); reject(new Error(`lock fixture exited ${code}`)) })
        child.once("error", error => { clearTimeout(timer); reject(error) })
      })
      const disk = files()
      const scoped = {
        ...declaration,
        config: { ...declaration.config, write: [...declaration.config.write, "extension-store/lock"] },
        lease: { ref: { root: "config" as const, path: "extension-store/lock" }, stale: 60000, update: 5000, retries: { retries: 0, factor: 1.2, minTimeout: 50, maxTimeout: 500, randomize: true } },
      }
      await expect(disk.begin(scoped)).rejects.toThrow()
      child.send("release")
      await new Promise<void>((resolve, reject) => child.once("exit", code => code === 0 ? resolve() : reject(new Error(`lock fixture exited ${code}`))))
      await disk.run(scoped, async roots => {
        expect(await fs.stat(`${lockPath}.lock`)).toBeDefined()
        expect(await disk.read(roots, { root: "config", path: "settings.json" })).toBeNull()
      })
      expect(await fs.stat(`${lockPath}.lock`).catch(() => null)).toBeNull()
    } finally {
      if (child.exitCode === null) child.kill()
    }
  })

  it("recovers a stale compatible lock and still rejects symlinked lock targets", async () => {
    const disk = files()
    const scoped = {
      ...declaration,
      config: { ...declaration.config, write: [...declaration.config.write, "extension-store/lock"] },
      lease: { ref: { root: "config" as const, path: "extension-store/lock" }, stale: 60000, update: 5000, retries: { retries: 0, factor: 1, minTimeout: 10, maxTimeout: 10, randomize: false } },
    }
    const dir = path.join(env.CLAUDE_CONFIG_DIR!, "extension-store")
    await fs.mkdir(path.join(dir, "lock.lock"), { recursive: true })
    const old = new Date(Date.now() - 120000)
    await fs.utimes(path.join(dir, "lock.lock"), old, old)
    await disk.run(scoped, async roots => { expect(await fs.stat(`${path.join(roots.config, "extension-store", "lock")}.lock`)).toBeDefined() })
    await fs.rm(path.join(dir, "lock"))
    await fs.symlink(root, path.join(dir, "lock"), "junction")
    await expect(disk.begin(scoped)).rejects.toThrow(/symbolic link/)
  })

  it("refuses further operations after a lease is compromised", async () => {
    const disk = files()
    const scoped = {
      ...declaration,
      config: { ...declaration.config, write: [...declaration.config.write, "extension-store/lock"] },
      lease: { ref: { root: "config" as const, path: "extension-store/lock" }, stale: 5000, update: 1000, retries: { retries: 0, factor: 1, minTimeout: 10, maxTimeout: 10, randomize: false } },
    }
    await expect(disk.run(scoped, async roots => {
      await fs.rmdir(path.join(roots.config, "extension-store", "lock.lock"))
      await new Promise(resolve => setTimeout(resolve, 1800))
      await disk.read(roots, { root: "config", path: "settings.json" })
    })).rejects.toThrow(/compromised/)
  })

  it("commits a journalled artifact and removes its recovery files", async () => {
    await collect()
    const disk = files()
    await disk.run(journalScope(), async roots => {
      const source = await disk.snapshotDirectory(roots, { root: "library", path: "demo" })
      const result = await disk.journalCommit(roots, journalRecipe(source!))
      expect(result).toEqual({ committed: true, warnings: [] })
      expect(await disk.read(roots, { root: "config", path: "store/state.json" })).toBe("committed")
      expect(await disk.read(roots, { root: "config", path: "store/projection.json" })).toBe("projection")
      expect(await disk.snapshotDirectory(roots, { root: "plugins", path: "demo" })).toBe(source)
      expect(await fs.readdir(path.join(roots.config, "store", "transactions"))).toEqual([])
    })
  })

  it("refuses recovery directories containing a symbolic link", async () => {
    await collect()
    const disk = files()
    await disk.run(journalScope(), async roots => {
      const source = await disk.snapshotDirectory(roots, { root: "library", path: "demo" })
      const staging = path.join(roots.config, "store", "staging")
      await fs.mkdir(staging, { recursive: true })
      await fs.symlink(root, path.join(staging, "unknown"), "junction")
      expect(await disk.list(roots, { root: "config", path: "store/staging" })).toEqual([])
      expect(await disk.list(roots, { root: "config", path: "store/staging" }, { includeLinks: true })).toEqual([{ name: "unknown", directory: false }])
      await expect(disk.journalCommit(roots, journalRecipe(source!))).rejects.toThrow(/pending client transaction/)
      expect(await disk.read(roots, { root: "config", path: "store/state.json" })).toBeNull()
    })
  })

  it("refuses an occupied backup path without reading or removing it", async () => {
    await collect()
    const disk = files()
    await disk.run(journalScope(), async roots => {
      const source = await disk.snapshotDirectory(roots, { root: "library", path: "demo" })
      const backup = path.join(roots.config, "store", "rollback", "fixture")
      await fs.mkdir(backup, { recursive: true })
      await fs.writeFile(path.join(backup, "person-file"), "keep")
      await expect(disk.journalCommit(roots, { ...journalRecipe(source!), guardEmpty: [] })).rejects.toThrow(/directory changed/)
      expect(await fs.readFile(path.join(backup, "person-file"), "utf8")).toBe("keep")
      expect(await disk.read(roots, { root: "config", path: "store/state.json" })).toBeNull()
    })
  })

  it("uses the same filtered source snapshot for journalled copies", async () => {
    await collect()
    const disk = files(), scoped = { ...journalScope(), copyExcludeTop: [".env", ".env.*"], copyRejectNested: [".env", ".env.*"] }
    const sourceDir = path.join(root, "hub", "plugins", "demo")
    await fs.writeFile(path.join(sourceDir, ".env"), "fixture private")
    await disk.run(scoped, async roots => {
      const source = await disk.snapshotDirectory(roots, { root: "library", path: "demo" })
      await disk.journalCommit(roots, journalRecipe(source!))
      expect(await disk.snapshotDirectory(roots, { root: "plugins", path: "demo" })).toBe(source)
      expect(await fs.lstat(path.join(roots.plugins, "demo", ".env")).catch(() => null)).toBeNull()
    })
  })

  it("retries transient artifact renames before failing", async () => {
    await collect()
    let attempts = 0
    const disk = createInstallerFiles({
      library: createFsPluginLibrary(path.join(root, "hub")), workspace: async () => workspace, userHome: path.join(root, "user"), env,
      rename: async (from, to) => {
        attempts++
        if (attempts < 3) throw Object.assign(new Error("temporary lock"), { code: "EPERM" })
        await fs.rename(from, to)
      },
    })
    await disk.run(journalScope(), async roots => {
      const source = await disk.snapshotDirectory(roots, { root: "library", path: "demo" })
      expect((await disk.journalCommit(roots, journalRecipe(source!))).committed).toBe(true)
      expect(attempts).toBe(3)
    })
  })

  it("rolls back an artifact when the commit point fails", async () => {
    await collect()
    const disk = files(async (file, text) => {
      if (file.endsWith("state.json")) throw new Error("injected commit failure")
      await writeFileAtomic(file, text)
    })
    await disk.run(journalScope(), async roots => {
      const source = await disk.snapshotDirectory(roots, { root: "library", path: "demo" })
      await expect(disk.journalCommit(roots, journalRecipe(source!))).rejects.toThrow(/injected commit failure/)
      expect(await disk.snapshotDirectory(roots, { root: "plugins", path: "demo" })).toBeNull()
      expect(await disk.read(roots, { root: "config", path: "store/previous.json" })).toBeNull()
      expect(await fs.readdir(path.join(roots.config, "store", "transactions"))).toEqual([])
    })
  })

  it("preserves a concurrent state change immediately before replacement", async () => {
    await collect()
    const disk = files(async (file, text, options) => {
      if (file.endsWith("state.json")) {
        await fs.mkdir(path.dirname(file), { recursive: true })
        await fs.writeFile(file, "external change")
      }
      await writeFileAtomic(file, text, options)
    })
    await disk.run(journalScope(), async roots => {
      const source = await disk.snapshotDirectory(roots, { root: "library", path: "demo" })
      await expect(disk.journalCommit(roots, journalRecipe(source!))).rejects.toThrow(/file changed/)
      expect(await disk.read(roots, { root: "config", path: "store/state.json" })).toBe("external change")
      expect(await disk.snapshotDirectory(roots, { root: "plugins", path: "demo" })).toBeNull()
    })
  })

  it("reports a committed transaction when projection fails", async () => {
    await collect()
    const disk = files(async (file, text) => {
      if (file.endsWith("projection.json")) throw new Error("injected projection failure")
      await writeFileAtomic(file, text)
    })
    await disk.run(journalScope(), async roots => {
      const source = await disk.snapshotDirectory(roots, { root: "library", path: "demo" })
      const result = await disk.journalCommit(roots, journalRecipe(source!))
      expect(result.committed).toBe(true)
      expect(result.warnings.join()).toMatch(/injected projection failure/)
      expect(await disk.read(roots, { root: "config", path: "store/state.json" })).toBe("committed")
      expect(await disk.snapshotDirectory(roots, { root: "plugins", path: "demo" })).toBe(source)
      expect(await disk.read(roots, { root: "config", path: "store/transactions/fixture.json" })).toContain("committed")
      await expect(disk.journalCommit(roots, journalRecipe(source!))).rejects.toThrow(/pending client transaction/)
    })
  })

  it("retains a swapped journal if the commit marker fails after the commit point", async () => {
    await collect()
    const disk = files(async (file, text) => {
      if (file.endsWith("fixture.json") && typeof text === "string" && text.includes('"committed"')) throw new Error("injected marker failure")
      await writeFileAtomic(file, text)
    })
    await disk.run(journalScope(), async roots => {
      const source = await disk.snapshotDirectory(roots, { root: "library", path: "demo" })
      const result = await disk.journalCommit(roots, journalRecipe(source!))
      expect(result.committed).toBe(true)
      expect(result.warnings.join()).toMatch(/injected marker failure/)
      expect(await disk.read(roots, { root: "config", path: "store/state.json" })).toBe("committed")
      expect(await disk.read(roots, { root: "config", path: "store/transactions/fixture.json" })).toContain("swapped")
      expect(await disk.snapshotDirectory(roots, { root: "plugins", path: "demo" })).toBe(source)
    })
  })

  it("recognizes a committed state even if its writer reports an error after writing", async () => {
    await collect()
    const disk = files(async (file, text) => {
      await writeFileAtomic(file, text)
      if (file.endsWith("state.json")) throw new Error("injected post-write failure")
    })
    await disk.run(journalScope(), async roots => {
      const source = await disk.snapshotDirectory(roots, { root: "library", path: "demo" })
      const result = await disk.journalCommit(roots, journalRecipe(source!))
      expect(result.committed).toBe(true)
      expect(result.warnings.join()).toMatch(/injected post-write failure/)
      expect(await disk.read(roots, { root: "config", path: "store/state.json" })).toBe("committed")
      expect(await disk.snapshotDirectory(roots, { root: "plugins", path: "demo" })).toBe(source)
    })
  })

  it("serializes whole read-modify-write operations", async () => {
    const disk = files()
    const ref = { root: "config" as const, path: "settings.json" }
    await Promise.all(Array.from({ length: 8 }, () => disk.run(declaration, async (roots) => {
      const before = await disk.read(roots, ref)
      await new Promise((resolve) => setTimeout(resolve, 2))
      await disk.commit(roots, [{ ref, before, after: String(Number(before ?? "0") + 1) }])
    })))
    expect(await disk.read(await disk.roots(declaration), ref)).toBe("8")
  })

  it("ignores the client's own cache markers when comparing", async () => {
    await collect()
    const disk = files()
    await disk.run(declaration, async (roots) => {
      const copy = { name: "demo", destination: "cache/context-hub/demo/1.0.0" }
      await disk.commit(roots, [], copy)
      const target = path.join(roots.plugins, ...copy.destination.split("/"))
      await fs.writeFile(path.join(target, ".in_use"), "")
      await fs.writeFile(path.join(target, ".orphaned_at"), "")
      await expect(disk.commit(roots, [], copy)).resolves.toBeUndefined()
    })
  })

  it("replaces and prunes only declared cache directories", async () => {
    await collect()
    const disk = files(async (file, text) => {
      if (file.endsWith("settings.json")) throw new Error("injected failure")
      await writeFileAtomic(file, text)
    })
    const scoped = { ...declaration, stateFiles: { write: ["cache/*/*/*", "cache/*/*"], read: ["cache/*/*"] } }
    await disk.run(scoped, async (roots) => {
      const copy = { name: "demo", destination: "cache/context-hub/demo/1.0.0" }
      await disk.commit(roots, [], copy)
      const dir = path.join(roots.plugins, ...copy.destination.split("/"))
      const file = path.join(dir, "skills", "one", "SKILL.md")
      await fs.writeFile(file, "old")
      await expect(disk.commit(roots, [{ ref: { root: "config", path: "settings.json" }, before: null, after: "new" }], { ...copy, replace: true })).rejects.toThrow(/injected/)
      expect(await fs.readFile(file, "utf8")).toBe("old")
      await fs.mkdir(path.join(path.dirname(dir), "0.9.0"))
      await disk.commit(roots, [], { ...copy, replace: true, pruneVersions: true })
      expect(await fs.readFile(file, "utf8")).toBe("one")
      expect(await fs.readdir(path.dirname(dir))).toEqual(["1.0.0"])
      await expect(disk.removeDirectory(roots, { root: "plugins", path: "cache" })).rejects.toThrow()
      await expect(disk.removeDirectory(roots, { root: "config", path: "settings.json" })).rejects.toThrow()
      await disk.removeDirectory(roots, { root: "plugins", path: "cache/context-hub/demo/1.0.0" })
      expect(await fs.stat(dir).catch(() => null)).toBeNull()
    })
  })

  it("copies and removes only declared named directories and rolls back failures", async () => {
    await collect()
    const disk = files(async () => { throw new Error("injected failure") })
    const scoped = { ...declaration, directories: ["local/:name"], stateFiles: { write: ["local/*"], read: [] } }
    await disk.run(scoped, async (roots) => {
      const copy = { name: "demo", destination: "local/demo" }
      await disk.commit(roots, [], copy)
      const target = path.join(roots.plugins, "local", "demo", "skills", "one", "SKILL.md")
      expect(await fs.readFile(target, "utf8")).toBe("one")
      await fs.writeFile(target, "old")
      await expect(disk.commit(roots, [{ ref: { root: "config", path: "settings.json" }, before: null, after: "new" }], { ...copy, replace: true })).rejects.toThrow(/injected/)
      expect(await fs.readFile(target, "utf8")).toBe("old")
      await expect(disk.commit(roots, [], { ...copy, destination: "local/other" })).rejects.toThrow()
      await expect(disk.commit(roots, [], { ...copy, destination: "local/../demo" })).rejects.toThrow()
      await expect(disk.commit(roots, [], { ...copy, pruneVersions: true })).rejects.toThrow()
      await disk.removeDirectory(roots, { root: "plugins", path: "local/demo" })
      expect(await fs.stat(target).catch(() => null)).toBeNull()
      const outside = path.join(root, "outside")
      await fs.mkdir(outside)
      await fs.symlink(outside, path.join(roots.plugins, "local", "demo"), "junction")
      await expect(disk.commit(roots, [], copy)).rejects.toThrow(/symbolic link/)
      await expect(disk.removeDirectory(roots, { root: "plugins", path: "local/demo" })).rejects.toThrow(/symbolic link/)
    })
    for (const template of ["local/*", "../:name", "local/:name/:name", "local/:name/..", "/:name"]) {
      await expect(disk.roots({ ...scoped, directories: [template] })).rejects.toThrow()
    }
  })

  it("protects complete directory snapshots and rolls back directory and state changes", async () => {
    await collect()
    const disk = files(async (file, text) => {
      if (file.endsWith("known_marketplaces.json")) throw new Error("injected failure")
      await writeFileAtomic(file, text)
    })
    const scoped = { ...declaration, directories: ["local/:name"], stateFiles: { write: ["local/*", "known_marketplaces.json"], read: [] }, library: { write: [], read: ["*"] } }
    const ref = { root: "plugins" as const, path: "local/demo" }
    const config = { root: "config" as const, path: "settings.json" }
    const failing = { root: "plugins" as const, path: "known_marketplaces.json" }
    await disk.run(scoped, async (roots) => {
      const copy = { name: "demo", destination: ref.path, replace: true }
      const sourceSnapshot = await disk.snapshotDirectory(roots, { root: "library", path: "demo" })
      expect(sourceSnapshot).toMatch(/^[0-9a-f]{64}$/)
      await expect(disk.commit(roots, [], { ...copy, before: null, sourceSnapshot: "stale" })).rejects.toThrow(/pack changed/)
      expect(await disk.snapshotDirectory(roots, ref)).toBeNull()
      await disk.commit(roots, [], { ...copy, before: null, sourceSnapshot: sourceSnapshot! })
      const dir = path.join(roots.plugins, "local", "demo")
      const initial = await disk.snapshotDirectory(roots, ref)
      expect(initial).toBe(sourceSnapshot)
      await fs.writeFile(path.join(dir, "binary"), Buffer.from([0, 255, 1]))
      const binary = await disk.snapshotDirectory(roots, ref)
      expect(binary).not.toBe(initial)
      await fs.mkdir(path.join(dir, "empty"))
      const changed = await disk.snapshotDirectory(roots, ref)
      expect(changed).not.toBe(binary)
      await expect(disk.commit(roots, [], { ...copy, before: initial })).rejects.toThrow(/directory changed/)
      await expect(disk.commit(roots, [], { ...copy, before: null })).rejects.toThrow(/directory changed/)
      await expect(disk.commit(roots, [{ ref: config, before: null, after: "state" }], undefined, { ref, before: initial })).rejects.toThrow(/directory changed/)
      expect(await disk.read(roots, config)).toBeNull()
      await expect(disk.commit(roots, [
        { ref: config, before: null, after: "state" },
        { ref: failing, before: null, after: "fail" },
      ], undefined, { ref, before: changed })).rejects.toThrow(/injected failure/)
      expect(await disk.snapshotDirectory(roots, ref)).toBe(changed)
      expect(await disk.read(roots, config)).toBeNull()
      await expect(disk.commit(roots, [
        { ref: config, before: null, after: "state" },
        { ref: failing, before: null, after: "fail" },
      ], { ...copy, before: changed })).rejects.toThrow(/injected failure/)
      expect(await disk.snapshotDirectory(roots, ref)).toBe(changed)
      expect(await disk.read(roots, config)).toBeNull()
      await disk.commit(roots, [{ ref: config, before: null, after: "state" }], undefined, { ref, before: changed })
      expect(await disk.snapshotDirectory(roots, ref)).toBeNull()
      expect(await disk.read(roots, config)).toBe("state")
    })
  })

  it("preserves the backup if a client edits the installed directory during rollback", async () => {
    await collect()
    let destination = ""
    const disk = files(async () => {
      await fs.writeFile(path.join(destination, "client-edit"), "keep")
      throw new Error("injected failure")
    })
    const scoped = { ...declaration, directories: ["local/:name"], stateFiles: { write: ["local/*"], read: [] } }
    await disk.run(scoped, async (roots) => {
      const ref = { root: "plugins" as const, path: "local/demo" }
      const copy = { name: "demo", destination: ref.path, replace: true }
      await disk.commit(roots, [], { ...copy, before: null })
      destination = path.join(roots.plugins, "local", "demo")
      await fs.writeFile(path.join(destination, "original"), "preserve")
      const before = await disk.snapshotDirectory(roots, ref)
      await expect(disk.commit(roots, [{ ref: { root: "config", path: "settings.json" }, before: null, after: "x" }], { ...copy, before })).rejects.toThrow(/original saved at/)
      expect(await fs.readFile(path.join(destination, "client-edit"), "utf8")).toBe("keep")
      const backup = (await fs.readdir(path.dirname(destination))).find((entry) => entry.startsWith("demo.backup-"))
      expect(backup).toBeDefined()
      expect(await fs.readFile(path.join(path.dirname(destination), backup!, "original"), "utf8")).toBe("preserve")
    })
  })

  it("rejects links and unsafe directory snapshots", async () => {
    await collect()
    const disk = files()
    const scoped = { ...declaration, directories: ["local/:name"], stateFiles: { write: ["local/*"], read: [] } }
    await disk.run(scoped, async (roots) => {
      const ref = { root: "plugins" as const, path: "local/demo" }
      await disk.commit(roots, [], { name: "demo", destination: ref.path, before: null })
      const dir = path.join(roots.plugins, "local", "demo")
      const snapshot = await disk.snapshotDirectory(roots, ref)
      await fs.symlink(root, path.join(dir, "linked"), "junction")
      await expect(disk.snapshotDirectory(roots, ref)).rejects.toThrow(/symbolic link/)
      await expect(disk.commit(roots, [], undefined, { ref, before: snapshot })).rejects.toThrow(/symbolic link/)
      await expect(disk.snapshotDirectory(roots, { root: "plugins", path: "local/../demo" })).rejects.toThrow()
      await expect(disk.snapshotDirectory(roots, { root: "config", path: "settings.json" })).rejects.toThrow()
    })
  })

  it("copies only collected packs and refuses a conflicting version", async () => {
    await collect()
    const disk = files()
    await disk.run(declaration, async (roots) => {
      const copy = { name: "demo", destination: "cache/context-hub/demo/1.0.0" }
      await disk.commit(roots, [], copy)
      const target = path.join(roots.plugins, ...copy.destination.split("/"))
      expect(await fs.readFile(path.join(target, "skills", "one", "SKILL.md"), "utf8")).toBe("one")
      await disk.commit(roots, [], copy)
      await fs.writeFile(path.join(target, "skills", "one", "SKILL.md"), "other")
      await expect(disk.commit(roots, [], copy)).rejects.toThrow(/different files/)
      await expect(disk.commit(roots, [], { name: "missing", destination: "cache/context-hub/missing/1" })).rejects.toThrow(/not in this library/)
      await expect(disk.commit(roots, [], { name: "demo", destination: "cache/context-hub/demo/../outside" })).rejects.toThrow()
    })
  })
})
