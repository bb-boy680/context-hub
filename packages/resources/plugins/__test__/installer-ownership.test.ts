import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { writeFileAtomic } from "@context-hub/core/host/atomic"
import { createFsPluginLibrary } from "../src/host/library.ts"
import { createInstallerFiles } from "../src/host/installer-files.ts"
import type { PluginDiskDeclaration } from "../src/provider.ts"

let root: string
beforeEach(async () => { root = await fs.mkdtemp(path.join(tmpdir(), "hub-installer-owner-")) })
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }) })

const declaration = {
  home: ".test-agent", state: "plugins",
  config: { write: ["settings.json"], read: [] },
  stateFiles: { write: ["registry.json", "cache/*/*/*"], read: [] },
  workspace: { write: [], read: [] },
  library: { write: [".installer-ownership/test-agent.json"], read: ["*"] }, external: [],
  copyExcludeTop: [".git", "node_modules", ".env", ".env.*"],
  copyRejectNested: [".env", ".env.*"],
} as PluginDiskDeclaration
const owner = { root: "library", path: ".installer-ownership/test-agent.json" } as const
const source = { root: "library", path: "demo" } as const
const destination = { root: "plugins", path: "cache/local/demo/1" } as const
const registry = { root: "plugins", path: "registry.json" } as const

async function fixture(write?: typeof writeFileAtomic) {
  const library = createFsPluginLibrary(path.join(root, "hub"))
  const staged = path.join(root, "staged")
  await fs.mkdir(staged, { recursive: true })
  await fs.writeFile(path.join(staged, "plugin.json"), '{"name":"demo","version":"1"}')
  await library.add("demo", staged, { kind: "local", path: root }, "fixture")
  const pack = path.join(library.root, "demo")
  await fs.mkdir(path.join(pack, ".git"))
  await fs.mkdir(path.join(pack, "node_modules"))
  await fs.mkdir(path.join(pack, "nested"))
  await fs.writeFile(path.join(pack, ".git", "config"), "private git config")
  await fs.writeFile(path.join(pack, "node_modules", "dependency"), "dependency")
  await fs.writeFile(path.join(pack, ".env"), "private secret")
  await fs.writeFile(path.join(pack, ".env.local"), "private secret 2")
  await fs.symlink(root, path.join(pack, ".env.link"), "junction")
  await fs.writeFile(path.join(pack, ".hidden"), "kept")
  if (process.platform !== "win32") await fs.chmod(path.join(pack, ".hidden"), 0o751)
  await fs.writeFile(path.join(pack, "nested", ".hidden"), "nested file is kept")
  const disk = createInstallerFiles({ library, workspace: async () => path.join(root, "workspace"), userHome: path.join(root, "user"), env: {}, write })
  return { disk, pack, library }
}

describe("installer ownership and filtered payload", () => {
  // 等待共享宿主加入源目录过滤，再启用复制与快照用例。
  it("commits a filtered pack and durable ownership in one transaction", async () => {
    const { disk, pack } = await fixture()
    await disk.run(declaration, async (roots) => {
      const snapshot = await disk.snapshotDirectory(roots, source)
      await fs.writeFile(path.join(pack, ".env"), "new private secret")
      expect(await disk.snapshotDirectory(roots, source)).toBe(snapshot)
      await disk.commit(roots, [
        { ref: registry, before: null, after: "registry" },
        { ref: owner, before: null, after: JSON.stringify({ snapshot }) },
      ], { name: "demo", destination: destination.path, before: null, sourceSnapshot: snapshot! })
      expect(await disk.read(roots, owner)).toBe(JSON.stringify({ snapshot }))
      expect(await disk.snapshotDirectory(roots, destination)).toBe(snapshot)
      const copied = path.join(roots.plugins, "cache/local/demo/1")
      for (const excluded of [".git", "node_modules", ".env", ".env.local", ".env.link"]) {
        expect(await fs.lstat(path.join(copied, excluded)).catch(() => null)).toBeNull()
      }
      expect(await fs.readFile(path.join(copied, ".hidden"), "utf8")).toBe("kept")
      if (process.platform !== "win32") expect((await fs.stat(path.join(copied, ".hidden"))).mode & 0o777).toBe(0o751)
      expect(await fs.readFile(path.join(copied, "nested/.hidden"), "utf8")).toBe("nested file is kept")
      await expect(disk.read(roots, { root: "library", path: ".installer-ownership/other.json" })).rejects.toThrow(/allowlist/)
    })
    const fresh = await disk.roots(declaration)
    expect(await disk.read(fresh, owner)).toContain("snapshot")
  })

  it("rolls back ownership and registry when a later file write fails", async () => {
    const { disk } = await fixture(async (file, text) => {
      if (file.endsWith("settings.json")) throw new Error("injected failure")
      await writeFileAtomic(file, text)
    })
    await disk.run(declaration, async (roots) => {
      await expect(disk.commit(roots, [
        { ref: owner, before: null, after: "owner" },
        { ref: registry, before: null, after: "registry" },
        { ref: { root: "config", path: "settings.json" }, before: null, after: "settings" },
      ])).rejects.toThrow(/injected failure/)
      expect(await disk.read(roots, owner)).toBeNull()
      expect(await disk.read(roots, registry)).toBeNull()
    })
  })

  it("rolls ownership, registry and payload back after a later failure", async () => {
    const { disk } = await fixture(async (file, text) => {
      if (file.endsWith("settings.json")) throw new Error("injected failure")
      await writeFileAtomic(file, text)
    })
    await disk.run(declaration, async (roots) => {
      const snapshot = await disk.snapshotDirectory(roots, source)
      await expect(disk.commit(roots, [
        { ref: owner, before: null, after: "owner" },
        { ref: registry, before: null, after: "registry" },
        { ref: { root: "config", path: "settings.json" }, before: null, after: "settings" },
      ], { name: "demo", destination: destination.path, before: null, sourceSnapshot: snapshot! })).rejects.toThrow(/injected failure/)
      expect(await disk.read(roots, owner)).toBeNull()
      expect(await disk.read(roots, registry)).toBeNull()
      expect(await disk.snapshotDirectory(roots, destination)).toBeNull()
    })
  })

  it("reserves the hidden ownership directory from ordinary pack names", async () => {
    const { library } = await fixture()
    expect(() => library.packDir(".installer-ownership")).toThrow(/unusable/)
  })

  it("refuses changed ownership before any other write", async () => {
    const { disk } = await fixture()
    await disk.run(declaration, async (roots) => {
      await disk.commit(roots, [{ ref: owner, before: null, after: "existing" }])
      await expect(disk.commit(roots, [
        { ref: registry, before: null, after: "registry" },
        { ref: owner, before: null, after: "replacement" },
      ])).rejects.toThrow(/changed/)
      expect(await disk.read(roots, registry)).toBeNull()
      expect(await disk.read(roots, owner)).toBe("existing")
    })
  })

  it("rejects unsafe exclusion patterns and symbolic links in included content", async () => {
    const { disk, pack } = await fixture()
    for (const pattern of ["../secret", "/secret", "a/b", "**", "a*b"]) {
      await expect(disk.roots({ ...declaration, copyExcludeTop: [pattern] } as PluginDiskDeclaration)).rejects.toThrow()
    }
    await fs.symlink(root, path.join(pack, "included-link"), "junction")
    await disk.run(declaration, async (roots) => {
      await expect(disk.snapshotDirectory(roots, source)).rejects.toThrow(/symbolic link/)
      expect(await disk.read(roots, owner)).toBeNull()
    })
  })

  it.each([".env", ".env.local"])("rejects nested %s before writing any state", async (name) => {
    const { disk, pack } = await fixture()
    await fs.writeFile(path.join(pack, "nested", name), "private secret")
    await disk.run(declaration, async (roots) => {
      await expect(disk.snapshotDirectory(roots, source)).rejects.toThrow(/nested/)
      await expect(disk.commit(roots, [
        { ref: owner, before: null, after: "owner" },
        { ref: registry, before: null, after: "registry" },
      ], { name: "demo", destination: destination.path, before: null })).rejects.toThrow(/nested/)
      expect(await disk.read(roots, owner)).toBeNull()
      expect(await disk.read(roots, registry)).toBeNull()
      expect(await disk.snapshotDirectory(roots, destination)).toBeNull()
    })
  })

  it("refuses changed included sources before writing", async () => {
    const { disk, pack } = await fixture()
    await disk.run(declaration, async (roots) => {
      const snapshot = await disk.snapshotDirectory(roots, source)
      await fs.writeFile(path.join(pack, "new-file"), "changed")
      await expect(disk.commit(roots, [{ ref: owner, before: null, after: "owner" }], {
        name: "demo", destination: destination.path, before: null, sourceSnapshot: snapshot!,
      })).rejects.toThrow(/changed/)
      expect(await disk.read(roots, owner)).toBeNull()
      expect(await disk.snapshotDirectory(roots, destination)).toBeNull()
    })
  })
})
