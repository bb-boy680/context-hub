import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { pluginManifestPaths } from "../src/contract.ts"
import { createPluginCollector } from "../src/host/collect.ts"
import { readPackContents } from "../src/host/contents.ts"
import { createFsPluginLibrary } from "../src/host/library.ts"
import { readManifestFields } from "../src/host/describe.ts"

const roots: string[] = []
async function temp(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hub-native-manifest-"))
  roots.push(root)
  return root
}
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))) })

const manifests = [".example-plugin/plugin.json"]
const document = {
  name: "example", version: "1.0", description: "Native pack",
  skills: ["custom/skills"], commands: "custom/commands",
  mcpServers: { local: { command: "fixture" } },
}

describe("extension manifest paths", () => {
  it("collects native-only packs and keeps their components visible", async () => {
    const home = await temp()
    const library = createFsPluginLibrary(home)
    const collector = createPluginCollector(library)
    const files = [
      [manifests[0]!, JSON.stringify(document)],
      ["custom/skills/one/SKILL.md", "---\nname: Custom skill\n---\n"],
      ["custom/commands/run.md", "---\nname: Custom command\n---\n"],
    ].map(([file, text]) => ({ path: file!, base64: Buffer.from(text!).toString("base64") }))
    await expect(collector.addFolder("example", files)).rejects.toThrow()
    const result = await collector.addFolder("example", files, manifests)
    expect(result.record).toMatchObject({ name: "example", version: "1.0", description: "Native pack" })
    expect(await library.has("example", manifests)).toBe(true)
    expect(await library.missing(manifests)).toEqual([])
    const content = await readPackContents(library.packDir("example"), manifests)
    expect(content.skills.map((item) => item.title)).toEqual(["Custom skill"])
    expect(content.commands.map((item) => item.title)).toEqual(["Custom command"])
    expect(JSON.parse(content.mcp!)).toEqual({ mcpServers: document.mcpServers })
  })

  it("refuses unsafe declaration and component paths", async () => {
    for (const invalid of ["../secret", "/absolute", "C:/secret", "foo\\bar", "foo//bar"]) {
      expect(() => pluginManifestPaths([invalid])).toThrow()
    }
    const dir = await temp()
    await fs.mkdir(path.join(dir, ".example-plugin"))
    await fs.writeFile(path.join(dir, manifests[0]!), JSON.stringify({ ...document, skills: "../outside" }))
    await expect(readPackContents(dir, manifests)).rejects.toThrow()
  })

  it("refuses a manifest reached through a link", async () => {
    const dir = await temp()
    const outside = await temp()
    await fs.writeFile(path.join(outside, "plugin.json"), JSON.stringify(document))
    await fs.symlink(outside, path.join(dir, ".example-plugin"), process.platform === "win32" ? "junction" : "dir")
    await expect(readManifestFields(dir, manifests)).rejects.toThrow(/symbolic link/)
  })
})
