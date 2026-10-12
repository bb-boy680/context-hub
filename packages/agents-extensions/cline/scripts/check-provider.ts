/**
 * Behaviour check for Cline's MCP provider: its single settings file, the
 * entries it writes there, the `disabled` field that switches a server off
 * without taking its declaration away, and the two conventions of Cline's own
 * that differ from the other JSON clients.
 *
 * The fixture is written the way a person's own settings look — a comment, an
 * entry that auto-approves some tools, another server beside the one being
 * edited — because what these edits must not do is rewrite what Cline wrote.
 *
 * Run from the package: `node scripts/check-provider.ts`
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { createFsPlaceFiles } from "@workspace/core/host/place-files"
import { mcpTools, type McpIo } from "@workspace/plugin-mcp/contract"

import { createClineMcp } from "../src/provider.ts"

/* The toolkit the extension is handed at activation; the module publishes this
   same value on its service, so what runs here is what runs in the page. */
const clineMcpProvider = createClineMcp(mcpTools)

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

const PLACE = "cline-mcp"

const SETTINGS = `{
  // Cline's own settings
  "mcpServers": {
    "files": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
      "disabled": false,
      "autoApprove": ["read_file"]
    }
  }
}
`

async function main(): Promise<void> {
  const root = await fs.mkdtemp(path.join(tmpdir(), "hub-cline-"))
  const home = path.join(root, "hub")
  const userHome = path.join(root, "person")
  const settings = path.join(userHome, ".cline", "data", "settings", "cline_mcp_settings.json")
  await fs.mkdir(home, { recursive: true })

  const files = createFsPlaceFiles({ home, userHome })
  const io: McpIo = { files, log: () => undefined }

  check("one place is described", clineMcpProvider.places.length === 1)
  check(
    "it is the settings file Cline's CLI reads",
    clineMcpProvider.places[0]?.file === ".cline/data/settings/cline_mcp_settings.json",
    clineMcpProvider.places[0]?.file
  )
  check("that place is machine-wide", clineMcpProvider.places[0]?.scope === "global")
  check("the client can be switched off through it", clineMcpProvider.setEnabled !== undefined)
  check("and its place says so", clineMcpProvider.places[0]?.switchable === true)

  console.log("a client with no settings yet")

  check("reading a file that is not there answers nothing", (await clineMcpProvider.read(io, PLACE)).length === 0)

  await clineMcpProvider.install(io, PLACE, "ctx", {
    transport: "stdio",
    command: "npx",
    args: ["-y", "@x/ctx"],
    env: { TOKEN: "abc" },
  })
  check("and the file appears where Cline reads it", (await fs.readFile(settings, "utf8")).includes('"ctx"'))

  await fs.writeFile(settings, SETTINGS, "utf8")

  console.log("reading what Cline wrote")

  const read = await clineMcpProvider.read(io, PLACE)
  check("the file's own server is read", read.some((entry) => entry.name === "files"), read)
  check("it reads as connected", read.find((entry) => entry.name === "files")?.enabled === true)
  check(
    "its declaration comes back whole",
    read[0]?.declaration?.transport === "stdio" &&
      read[0]?.declaration?.command === "npx" &&
      read[0]?.declaration?.args?.[0] === "-y",
    read[0]?.declaration
  )

  console.log("installing into settings that are there")

  await clineMcpProvider.install(io, PLACE, "ctx", {
    transport: "stdio",
    command: "npx",
    args: ["-y", "@x/ctx"],
    env: { TOKEN: "abc" },
  })
  const installed = await fs.readFile(settings, "utf8")
  check("the new server is in the file", installed.includes('"ctx"'))
  check("its arguments are written", installed.includes('"@x/ctx"'))
  check("its environment is written", installed.includes('"TOKEN": "abc"'))
  check("the comment above the file survives", installed.startsWith("{\n  // Cline's own settings"))
  check("the server that was there stays", installed.includes('"files"'))
  check("and still auto-approves what it did", installed.includes('"read_file"'), installed)

  const both = await clineMcpProvider.read(io, PLACE)
  check("both servers read back", both.length === 2, both)

  console.log("the tools Cline may auto-approve survive a rewrite")

  await clineMcpProvider.install(io, PLACE, "files", {
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
    env: {},
  })
  const rewritten = await fs.readFile(settings, "utf8")
  check("the declaration is the new one", rewritten.includes('"/tmp"'))
  /* The entry is one node, so rewriting it reflows its own fields; what matters
     is that the fields the hub does not own are still there. */
  check("the auto-approved tools are kept", rewritten.includes('"read_file"'), rewritten)
  check("the state Cline recorded is kept", rewritten.includes('"disabled": false'))

  console.log("remote servers, in Cline's own spelling")

  await clineMcpProvider.install(io, PLACE, "remote", {
    transport: "http",
    url: "https://example.com/mcp",
    headers: { Authorization: "Bearer t" },
  })
  const http = await fs.readFile(settings, "utf8")
  check("streamable HTTP is spelled the way Cline spells it", http.includes('"type": "streamableHttp"'), http)
  check(
    "and it reads back as HTTP",
    (await clineMcpProvider.read(io, PLACE)).find((entry) => entry.name === "remote")?.declaration?.transport ===
      "http"
  )

  await clineMcpProvider.install(io, PLACE, "legacy", {
    transport: "sse",
    url: "https://example.com/sse",
    headers: {},
  })
  check("sse keeps its own spelling", (await fs.readFile(settings, "utf8")).includes('"type": "sse"'))

  /* Cline's docs: an entry with no `type` is the legacy SSE transport, where
     the shared reader would call it HTTP. */
  await fs.writeFile(
    settings,
    JSON.stringify({ mcpServers: { bare: { url: "https://example.com/x" } } }, null, 2),
    "utf8"
  )
  const bare = await clineMcpProvider.read(io, PLACE)
  check("an entry with no transport is the legacy one", bare[0]?.declaration?.transport === "sse", bare)

  console.log("switching one off")

  await fs.writeFile(settings, SETTINGS, "utf8")
  await clineMcpProvider.setEnabled(io, PLACE, "global", "files", false)
  const off = await fs.readFile(settings, "utf8")
  check("the field is written into that entry", off.includes('"disabled": true'))
  check("the declaration stays", off.includes('"@modelcontextprotocol/server-filesystem"'))
  check(
    "and it reads back switched off",
    (await clineMcpProvider.read(io, PLACE))[0]?.enabled === false
  )

  await clineMcpProvider.install(io, PLACE, "files", {
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
    env: {},
  })
  check("writing it again keeps it switched off", (await fs.readFile(settings, "utf8")).includes('"disabled": true'))

  await clineMcpProvider.setEnabled(io, PLACE, "global", "files", true)
  check("switching it on says so", (await fs.readFile(settings, "utf8")).includes('"disabled": false'))

  const absent = await refusalOf(() => clineMcpProvider.setEnabled(io, PLACE, "global", "nope", false))
  check("switching a server the file does not hold is refused", (absent ?? "").includes("cline.error.absent"), absent)

  console.log("taking it back out")

  await clineMcpProvider.uninstall(io, PLACE, "files")
  check("the entry is gone", !(await fs.readFile(settings, "utf8")).includes('"files"'))

  console.log("failures")

  const broken = path.join(userHome, ".cline", "data", "settings", "cline_mcp_settings.json")
  await fs.writeFile(broken, "{ not json", "utf8")
  const unreadable = await refusalOf(() => clineMcpProvider.read(io, PLACE))
  check("a file this build cannot read reports Cline's own key", (unreadable ?? "").includes("cline.error.parse"), unreadable)
  const refused = await refusalOf(() => clineMcpProvider.install(io, PLACE, "ctx", {
    transport: "stdio",
    command: "npx",
    args: [],
    env: {},
  }))
  check("and writing it is refused the same way", (refused ?? "").includes("cline.error.parse"), refused)

  const wrongPlace = await refusalOf(() => clineMcpProvider.read(io, "elsewhere"))
  check("naming another place is refused", (wrongPlace ?? "").includes("cline.error.unknownPlace"), wrongPlace)

  await fs.rm(root, { recursive: true, force: true })

  console.log(`\n${checked - failures}/${checked} checks passed`)
  if (failures > 0) process.exitCode = 1
}

await main()
