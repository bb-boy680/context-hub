import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { writeFileAtomic } from "@context-hub/core/host/atomic"
import { createFsPluginLibrary } from "../src/host/library.ts"
import { createInstallerFiles } from "../src/host/installer-files.ts"
import { writeMarketplaceIndexes } from "../src/host/marketplace.ts"
import type { PluginDiskDeclaration } from "../src/provider.ts"

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
