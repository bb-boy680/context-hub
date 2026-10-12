/**
 * Behaviour check for Claude Code's MCP provider: the two files it declares
 * servers in, and the project list that switches one off.
 *
 * Everything runs against real files in a throwaway directory, because what
 * matters is what the provider leaves alone: `.claude.json` also holds every
 * project's settings, and the fixture carries a hand-written comment, a
 * differently-spelled project key and an unrelated project to prove each write
 * goes node by node.
 *
 * Run from the package: `node scripts/check-provider.ts`
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { createFsPlaceFiles } from "@workspace/core/host/place-files"
import { mcpTools, readJsonObject, valueAt, type McpIo } from "@workspace/plugin-mcp/contract"

import { createClaudeCodeMcp } from "../src/provider.ts"

/* The toolkit the extension is handed at activation; the module publishes this
   same value on its service, so what runs here is what runs in the page. */
const claudeCodeMcpProvider = createClaudeCodeMcp(mcpTools)

let failures = 0
let checked = 0

function check(what: string, ok: boolean, detail?: unknown) {
  checked += 1
  if (ok) {
    console.log(`  ok   ${what}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${what}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`)
}

/** The message one call refused with, or null when it did not refuse. */
async function refusalOf(call: () => Promise<unknown>): Promise<string | null> {
  try {
    await call()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  return null
}

/** The bytes of a file, for proving a write came back out without a trace. */
async function bytesOf(file: string): Promise<string> {
  return fs.readFile(file, "utf8")
}

const WORKSPACE_PLACE = "claude-code"
const GLOBAL_PLACE = "claude-code-global"

async function main(): Promise<void> {
  const root = await fs.mkdtemp(path.join(tmpdir(), "hub-claude-code-"))
  const home = path.join(root, "hub")
  const workspace = path.join(root, "project")
  const userHome = path.join(root, "person")
  const globalFile = path.join(userHome, ".claude.json")
  const projectFile = path.join(workspace, ".mcp.json")
  await fs.mkdir(home, { recursive: true })
  await fs.mkdir(workspace, { recursive: true })
  await fs.mkdir(userHome, { recursive: true })

  /* Claude Code spells a project's path with forward slashes; the hub is told
     the platform's spelling. The two must still be the same project. */
  const projectKey = workspace.replaceAll("\\", "/")
  const otherKey = path.join(root, "elsewhere").replaceAll("\\", "/")

  await fs.writeFile(
    globalFile,
    `{
  // Claude Code wrote this
  "projects": {
    "${projectKey}": {
      "mcpServers": {},
      "allowedTools": ["Bash"]
    },
    "${otherKey}": {
      "mcpServers": { "theirs": { "command": "their-cli" } }
    }
  },
  "mcpServers": {},
  "theme": "dark"
}
`
  )
  await fs.writeFile(
    projectFile,
    `{
  "mcpServers": {
    "shared": { "command": "npx", "args": ["-y", "@x/shared"] }
  }
}
`
  )
  const globalBefore = await bytesOf(globalFile)
  const projectBefore = await bytesOf(projectFile)

  const files = createFsPlaceFiles({ home, folder: workspace, userHome })
  const io: McpIo = { files, log: () => undefined }

  console.log("places")

  check("two places are described", claudeCodeMcpProvider.places.length === 2)
  check(
    "the project file reads as a workspace place",
    claudeCodeMcpProvider.places[0]?.scope === "global" &&
      claudeCodeMcpProvider.places[1]?.file === ".mcp.json"
  )
  check("the client can be switched off through it", claudeCodeMcpProvider.setEnabled !== undefined)

  console.log("reads")

  const project = await claudeCodeMcpProvider.read(io, WORKSPACE_PLACE)
  check("the project file's server is read", project.length === 1 && project[0]?.name === "shared", project)
  check("its declaration is read in full", project[0]?.declaration?.command === "npx")
  check("it reads as connected while no list names it", project[0]?.enabled === true)

  const global = await claudeCodeMcpProvider.read(io, GLOBAL_PLACE)
  check("the global file holds no server of its own", global.length === 0, global)

  console.log("installing")

  await claudeCodeMcpProvider.install(io, WORKSPACE_PLACE, "ctx", {
    transport: "stdio",
    command: "npx",
    args: ["-y", "@x/ctx"],
    env: { TOKEN: "abc" },
  })
  const installed = await bytesOf(projectFile)
  check("the new server is in the project file", installed.includes('"ctx"'))
  check("the server that was already there stays", installed.includes('"shared"'))
  check("its own arguments survive", installed.includes("@x/ctx"))

  await claudeCodeMcpProvider.install(io, GLOBAL_PLACE, "remote", {
    transport: "sse",
    url: "https://example.test/mcp",
    headers: { Authorization: "Bearer k" },
  })
  const withRemote = await bytesOf(globalFile)
  const globalDocument = readJsonObject(withRemote)
  check(
    "a remote server carries its transport",
    valueAt(globalDocument, ["mcpServers", "remote", "type"]) === "sse",
    valueAt(globalDocument, ["mcpServers", "remote"])
  )
  check("the comment above the file survives", withRemote.includes("// Claude Code wrote this"))
  check("an unrelated project is untouched", withRemote.includes('"their-cli"'))
  check("the project's own settings are untouched", withRemote.includes('"allowedTools"'))

  const reread = await claudeCodeMcpProvider.read(io, GLOBAL_PLACE)
  check("the remote server reads back", reread.length === 1 && reread[0]?.name === "remote", reread)
  check("it reads back as sse", reread[0]?.declaration?.transport === "sse")
  check("its header reads back", reread[0]?.declaration?.headers?.Authorization === "Bearer k")

  console.log("switching a project off")

  await claudeCodeMcpProvider.setEnabled(io, WORKSPACE_PLACE, "shared", false)
  const off = await bytesOf(globalFile)
  check("the name lands in the project's list", off.includes('"disabledMcpServers"') && off.includes('"shared"'))
  check("the declaration file is not touched", (await bytesOf(projectFile)) === installed)
  check("no second project record is invented", (off.match(/"mcpServers": \{\}/g) ?? []).length === 1)

  const offProject = await claudeCodeMcpProvider.read(io, WORKSPACE_PLACE)
  check("the server reads back switched off", offProject[0]?.enabled === false, offProject)

  await claudeCodeMcpProvider.setEnabled(io, WORKSPACE_PLACE, "shared", false)
  check(
    "switching it off twice writes the same thing",
    (await bytesOf(globalFile)) === off
  )

  await claudeCodeMcpProvider.setEnabled(io, WORKSPACE_PLACE, "shared", true)
  const on = await bytesOf(globalFile)
  check("switching it back on takes the name out", !on.includes('"disabledMcpServers"'))
  check("the other project is still there", on.includes('"their-cli"'))

  console.log("a project Claude Code never opened")

  /* Another workspace the hub can open but Claude Code has no record of: the
     switch has nowhere to go, and inventing a project record would tell Claude
     Code about a folder it never saw. */
  const fresh = path.join(root, "fresh")
  await fs.mkdir(fresh, { recursive: true })
  const loner = createFsPlaceFiles({ home: path.join(root, "other-hub"), folder: fresh, userHome })
  const refused = await refusalOf(() =>
    claudeCodeMcpProvider.setEnabled?.({ files: loner, log: () => undefined }, WORKSPACE_PLACE, "shared", false) ??
    Promise.resolve()
  )
  check("the switch is refused, not invented", (refused ?? "").includes("claudeCode.error.noProject"), refused)
  check(
    "and the client's own file is left alone",
    (await bytesOf(globalFile)) === on
  )

  console.log("taking it back out")

  await claudeCodeMcpProvider.uninstall(io, WORKSPACE_PLACE, "ctx")
  await claudeCodeMcpProvider.uninstall(io, GLOBAL_PLACE, "remote")
  check("the project file is byte for byte what it was", (await bytesOf(projectFile)) === projectBefore)
  check("the global file is byte for byte what it was", (await bytesOf(globalFile)) === globalBefore)

  console.log("a project that had no config file yet")

  /* The hub writes the file for its first server and leaves it behind when that
     server leaves: it cannot tell later that it created the file, and deleting
     one a person keeps is worse than keeping an empty box. Its own hub home, so
     this project is the workspace in use rather than the one above. */
  const blank = path.join(root, "blank-project")
  const blankFile = path.join(blank, ".mcp.json")
  await fs.mkdir(blank, { recursive: true })
  const blankFiles = createFsPlaceFiles({
    home: path.join(root, "blank-hub"),
    folder: blank,
    userHome,
  })
  const blankIo: McpIo = { files: blankFiles, log: () => undefined }
  check("it holds no file yet", (await blankFiles.read({ scope: "workspace", file: ".mcp.json" })) === null)

  await claudeCodeMcpProvider.install(blankIo, WORKSPACE_PLACE, "ctx", {
    transport: "stdio",
    command: "npx",
    args: [],
    env: {},
  })
  check("installing writes one", (await bytesOf(blankFile)).includes("ctx"))
  await claudeCodeMcpProvider.uninstall(blankIo, WORKSPACE_PLACE, "ctx")
  check(
    "uninstalling leaves the key empty rather than taking the file away",
    JSON.stringify(readJsonObject(await bytesOf(blankFile))) === '{"mcpServers":{}}',
    await bytesOf(blankFile)
  )

  console.log("pointing at an entry")

  const lines = await claudeCodeMcpProvider.locate?.(io, WORKSPACE_PLACE, "shared")
  check("the entry's lines are found", lines !== null && lines !== undefined && lines[1] >= lines[0], lines)
  check(
    "those lines hold the name",
    lines === null || lines === undefined ? false : (await bytesOf(projectFile)).split("\n").slice(lines[0] - 1, lines[1]).join("\n").includes("shared")
  )

  await fs.rm(root, { recursive: true, force: true })

  console.log(`\n${checked - failures}/${checked} checks passed`)
  if (failures > 0) process.exitCode = 1
}

await main()
