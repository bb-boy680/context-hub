/**
 * Reading what a market entry carries before the library holds it.
 *
 * The repository is made on the spot, so this exercises the real staging fetch:
 * the pack's README, its skills, its commands and its `.mcp.json`, read from a
 * checkout that is thrown away. The second read runs after the repository is
 * gone, which is what proves it answered from the cache rather than cloning
 * again.
 */
import { execFile } from "node:child_process"
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import type { PluginSourceSpec } from "../src/inspect.ts"
import { previewMarket } from "../src/host/preview.ts"

function git(cwd: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", [...args], { cwd, windowsHide: true }, (error, stdout) => {
      if (error === null) resolve(String(stdout))
      else reject(error)
    })
  })
}

const root = await fs.mkdtemp(path.join(tmpdir(), "hub-market-preview-"))
const repo = path.join(root, "repo")
const pack = path.join(repo, "pack")

let spec: PluginSourceSpec

beforeAll(async () => {
  await fs.mkdir(path.join(pack, "skills", "alpha"), { recursive: true })
  await fs.mkdir(path.join(pack, "commands"), { recursive: true })
  await fs.writeFile(path.join(pack, "README.md"), "# Pack\n\nWhat it does.\n", "utf8")
  await fs.writeFile(
    path.join(pack, "skills", "alpha", "SKILL.md"),
    "---\nname: alpha-skill\ndescription: Does alpha.\n---\n\nBody.\n",
    "utf8"
  )
  await fs.writeFile(
    path.join(pack, "commands", "check.md"),
    "---\ndescription: Checks things.\n---\n\nRun it.\n",
    "utf8"
  )
  await fs.writeFile(pack + path.sep + ".mcp.json", '{"mcpServers":{}}\n', "utf8")

  await git(repo, ["init", "--quiet"])
  await git(repo, ["config", "user.email", "check@example.test"])
  await git(repo, ["config", "user.name", "Check"])
  await git(repo, ["add", "-A"])
  await git(repo, ["commit", "--quiet", "-m", "first"])
  const sha = (await git(repo, ["rev-parse", "HEAD"])).trim()
  spec = { kind: "git-subdir", url: repo, path: "pack", sha }
})

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe("previewing a market entry", () => {
  it("reads the README and the three things the pack carries", async () => {
    const preview = await previewMarket(spec)

    expect(preview.readme).toContain("What it does.")
    expect(preview.contents.skills).toEqual([
      { title: "alpha-skill", description: "Does alpha." },
    ])
    expect(preview.contents.commands).toEqual([
      { title: "check", description: "Checks things." },
    ])
    expect(preview.contents.mcp).toContain("mcpServers")
  })

  it("answers a second read from the cache rather than fetching again", async () => {
    /* The address no longer resolves, so only a cached answer can succeed. */
    await fs.rm(repo, { recursive: true, force: true })

    const again = await previewMarket(spec)
    expect(again.readme).toContain("What it does.")
    expect(again.contents.skills).toHaveLength(1)
  })
})
