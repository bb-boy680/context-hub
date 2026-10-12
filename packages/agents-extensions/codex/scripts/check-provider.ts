/**
 * Behaviour check for Codex's MCP provider: its single TOML config, the entry
 * it writes there, and the `enabled` field that switches a server off without
 * taking its declaration away.
 *
 * The fixture is written the way a person's own config looks — a comment, a
 * single-quoted command, a table that comes later, another server beside the one
 * being edited — because what these edits must not do is rewrite what Codex
 * wrote.
 *
 * Run from the package: `node scripts/check-codex.ts`
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { createFsPlaceFiles } from "@workspace/core/host/place-files"
import { mcpTools, type McpIo } from "@workspace/plugin-mcp/contract"

import { createCodexMcp } from "../src/provider.ts"

/* The toolkit the extension is handed at activation; the module publishes this
   same value on its service, so what runs here is what runs in the page. */
const codexMcpProvider = createCodexMcp(mcpTools)

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

const PLACE = "codex-global"

const CONFIG = `# Codex config
model = "gpt-5"

[mcp_servers.node_repl]
command = 'node'
args = ["repl.js"]

[other]
keep = "me"
`

async function main(): Promise<void> {
  const root = await fs.mkdtemp(path.join(tmpdir(), "hub-codex-"))
  const home = path.join(root, "hub")
  const userHome = path.join(root, "person")
  const config = path.join(userHome, ".codex", "config.toml")
  await fs.mkdir(home, { recursive: true })
  await fs.mkdir(path.dirname(config), { recursive: true })

  const files = createFsPlaceFiles({ home, userHome })
  const io: McpIo = { files, log: () => undefined }

  check("one place is described", codexMcpProvider.places.length === 1)
  check("it is the machine-wide config", codexMcpProvider.places[0]?.file === ".codex/config.toml")
  check("the client can be switched off through it", codexMcpProvider.setEnabled !== undefined)
  check("and its place says so", codexMcpProvider.places[0]?.switchable === true)

  console.log("a client with no config yet")

  check("reading a config that is not there answers nothing", (await codexMcpProvider.read(io, PLACE)).length === 0)

  await codexMcpProvider.install(io, PLACE, "ctx", {
    transport: "stdio",
    command: "npx",
    args: ["-y", "@x/ctx"],
    env: { TOKEN: "abc" },
  })
  await fs.writeFile(config, CONFIG, "utf8")
  const written = await codexMcpProvider.read(io, PLACE)
  check("the file's own server is read", written.some((entry) => entry.name === "node_repl"), written)
  check("it reads as connected", written.find((entry) => entry.name === "node_repl")?.enabled === true)
  check(
    "the file's own quoting is kept out of the way",
    (await fs.readFile(config, "utf8")).includes("command = 'node'")
  )

  console.log("installing into a config that is there")

  await codexMcpProvider.install(io, PLACE, "ctx", {
    transport: "stdio",
    command: "npx",
    args: ["-y", "@x/ctx"],
    env: { TOKEN: "abc" },
  })
  const installed = await fs.readFile(config, "utf8")
  check("the new server is in the file", installed.includes("[mcp_servers.ctx]"))
  check("its arguments are written", installed.includes('args = ["-y", "@x/ctx"]'))
  check("its environment is a table of its own", installed.includes("[mcp_servers.ctx.env]"))
  check("the comment above the file survives", installed.startsWith("# Codex config"))
  check("the server that was there stays", installed.includes("[mcp_servers.node_repl]"))
  check("the unrelated table stays", installed.includes('[other]\nkeep = "me"'))

  const read = await codexMcpProvider.read(io, PLACE)
  check("both servers read back", read.length === 2, read)
  check("the environment reads back", read[1]?.declaration?.env?.TOKEN === "abc")

  console.log("switching one off")

  await codexMcpProvider.setEnabled(io, PLACE, "global", "ctx", false)
  const off = await fs.readFile(config, "utf8")
  check("the field is written into that entry", off.includes("[mcp_servers.ctx]\nenabled = false"))
  check("the declaration stays", off.includes('command = "npx"'))
  check("the entry's environment stays", off.includes("[mcp_servers.ctx.env]"))
  check(
    "the file has one `enabled` and no more",
    (off.match(/enabled/g) ?? []).length === 1,
    off.match(/enabled/g)?.length
  )

  const disabled = await codexMcpProvider.read(io, PLACE)
  check("it reads back switched off", disabled.find((entry) => entry.name === "ctx")?.enabled === false)
  check("the other server still reads as on", disabled.find((entry) => entry.name === "node_repl")?.enabled === true)

  await codexMcpProvider.install(io, PLACE, "ctx", {
    transport: "stdio",
    command: "npx",
    args: ["-y", "@x/ctx"],
    env: { TOKEN: "abc" },
  })
  check("writing it again keeps it switched off", (await fs.readFile(config, "utf8")).includes("enabled = false"))

  await codexMcpProvider.setEnabled(io, PLACE, "global", "ctx", true)
  check("switching it on says so", (await fs.readFile(config, "utf8")).includes("enabled = true"))
  check("the entry is otherwise the one it was", (await codexMcpProvider.read(io, PLACE)).length === 2)

  console.log("taking it back out")

  await codexMcpProvider.uninstall(io, PLACE, "ctx")
  const removed = await fs.readFile(config, "utf8")
  check("the entry is gone", !removed.includes("ctx"))
  check("the server that was there stays", removed.includes("[mcp_servers.node_repl]"))
  check("the unrelated table stays", removed.includes('[other]\nkeep = "me"'))
  check("with the field gone it is byte for byte the file it was", removed === CONFIG, removed)

  console.log("a file that cannot be read")

  await fs.writeFile(config, "model = \n", "utf8")
  const broken = await refusalOf(() => codexMcpProvider.read(io, PLACE))
  check("reading it reports the client's own key", (broken ?? "").includes("codex.error.parse"), broken)
  const refused = await refusalOf(() => codexMcpProvider.install(io, PLACE, "ctx", { transport: "stdio", command: "npx", args: [], env: {} }))
  check("writing into it is refused too", (refused ?? "").includes("codex.error"), refused)

  await fs.rm(root, { recursive: true, force: true })

  console.log(`\n${checked - failures}/${checked} checks passed`)
  if (failures > 0) process.exitCode = 1
}

await main()
