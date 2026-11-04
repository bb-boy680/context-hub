import { execFile } from "node:child_process"
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { createPluginCollector } from "../src/host/collect.ts"
import { readPackContents } from "../src/host/contents.ts"
import { createFsPluginLibrary } from "../src/host/library.ts"
import { previewMarket } from "../src/host/preview.ts"

const roots: string[] = []
async function temp(): Promise<string> {
  const root = await fs.mkdtemp(path.join(tmpdir(), "hub-agent-plugins-mcp-"))
  roots.push(root)
  return root
}
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))) })

const manifest = { $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: "example", version: "1.0.0" }
const mcp = JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json", mcpServers: { local: { type: "stdio", command: "node", args: ["server.js"] } } }, null, 2) + "\n"
const legacy = '{"mcpServers":{"legacy":{"command":"old"}}}\n'

async function git(cwd: string, ...args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, windowsHide: true }, (error, stdout) => {
      if (error) reject(error)
      else resolve(String(stdout).trim())
    })
  })
}

describe("Agent Plugins MCP contents", () => {
  it("collects an Agent Plugins package and reads its original MCP file", async () => {
    const home = await temp(), library = createFsPluginLibrary(home)
    const files = [["plugin.json", JSON.stringify(manifest)], ["mcp.json", mcp]].map(([file, text]) => ({ path: file!, base64: Buffer.from(text!).toString("base64") }))
    await createPluginCollector(library).addFolder("example", files)
    const contents = await readPackContents(library.packDir("example"))
    expect(contents.mcp).toBe(mcp)
    expect(contents.mcpPath).toBe("mcp.json")
  })

  it("prefers the current standard file, while preserving explicit declarations", async () => {
    const dir = await temp()
    await fs.writeFile(path.join(dir, "plugin.json"), JSON.stringify(manifest))
    await fs.writeFile(path.join(dir, "mcp.json"), mcp)
    await fs.writeFile(path.join(dir, ".mcp.json"), legacy)
    expect(await readPackContents(dir)).toMatchObject({ mcp, mcpPath: "mcp.json" })
    await fs.writeFile(path.join(dir, "plugin.json"), JSON.stringify({ ...manifest, mcpServers: ".mcp.json" }))
    expect((await readPackContents(dir)).mcp).toBe(legacy)
    await fs.writeFile(path.join(dir, "custom.json"), mcp)
    await fs.writeFile(path.join(dir, "plugin.json"), JSON.stringify({ ...manifest, mcpServers: "custom.json" }))
    expect(await readPackContents(dir)).toMatchObject({ mcp, mcpPath: "custom.json" })
    await fs.writeFile(path.join(dir, "plugin.json"), JSON.stringify({ ...manifest, mcpServers: ["custom.json", ".mcp.json"] }))
    const combined = await readPackContents(dir)
    expect(combined.mcp).toBe(`${mcp}\n\n${legacy}`)
    expect(combined.mcpPath).toBeUndefined()
  })

  it("keeps legacy behavior without a standard manifest and falls back when needed", async () => {
    const dir = await temp()
    await fs.writeFile(path.join(dir, "mcp.json"), mcp)
    expect((await readPackContents(dir)).mcp).toBeNull()
    await fs.writeFile(path.join(dir, "plugin.json"), JSON.stringify({ ...manifest, $schema: "https://other.example/plugin.schema.json" }))
    expect((await readPackContents(dir)).mcp).toBeNull()
    await fs.writeFile(path.join(dir, ".mcp.json"), legacy)
    expect((await readPackContents(dir)).mcp).toBe(legacy)
    await fs.writeFile(path.join(dir, "plugin.json"), JSON.stringify(manifest))
    await fs.rm(path.join(dir, "mcp.json"))
    expect((await readPackContents(dir)).mcp).toBe(legacy)
  })

  it("refuses a linked standard MCP path", async () => {
    const dir = await temp(), outside = await temp()
    await fs.writeFile(path.join(dir, "plugin.json"), JSON.stringify(manifest))
    await fs.symlink(outside, path.join(dir, "mcp.json"), process.platform === "win32" ? "junction" : "dir")
    await expect(readPackContents(dir)).rejects.toThrow(/symbolic link/)
  })

  it("preserves the same content and file name in a market preview", async () => {
    const repo = await temp()
    await fs.writeFile(path.join(repo, "plugin.json"), JSON.stringify(manifest))
    await fs.writeFile(path.join(repo, "mcp.json"), mcp)
    await git(repo, "init", "--quiet")
    await git(repo, "config", "user.email", "fixture@example.test")
    await git(repo, "config", "user.name", "Fixture")
    await git(repo, "add", "-A")
    await git(repo, "commit", "--quiet", "-m", "fixture")
    const sha = await git(repo, "rev-parse", "HEAD")
    const preview = await previewMarket({ kind: "url", url: repo, sha })
    expect(preview.contents.mcp?.replace(/\r\n/g, "\n")).toBe(mcp)
    expect(preview.contents.mcpPath).toBe("mcp.json")
  })
})
