/**
 * Behaviour of Claude Code's MCP provider: the two files it declares servers in,
 * and the project list that switches one off.
 *
 * Everything runs against real files in a throwaway directory, because what
 * matters is what the provider leaves alone: `.claude.json` also holds every
 * project's settings, and the fixture carries a hand-written comment, a
 * differently-spelled project key and an unrelated project to prove each write
 * goes node by node.
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createFsPlaceFiles } from "@context-hub/core/host/place-files"
import {
  mcpTools,
  readJsonObject,
  valueAt,
  type McpDeclaration,
  type McpIo,
  type McpRemoteDeclaration,
  type McpStdioDeclaration,
} from "@context-hub/mcp/contract"

import { createClaudeCodeMcp } from "../src/provider.ts"

/* The toolkit the extension is handed at activation; the module publishes this
   same value on its service, so what runs here is what runs in the page. */
const claudeCodeMcp = createClaudeCodeMcp(mcpTools)

/* Both of these are on the provider; the types mark them optional because not
   every provider a module accepts declares them. */
const setEnabled = claudeCodeMcp.setEnabled!
const locate = claudeCodeMcp.locate!

/** A declaration is a union of how the server is reached; this file asks for one half at a time. */
const stdioOf = (
  declaration: McpDeclaration | null | undefined
): McpStdioDeclaration | undefined =>
  declaration != null && declaration.transport === "stdio" ? declaration : undefined
const remoteOf = (
  declaration: McpDeclaration | null | undefined
): McpRemoteDeclaration | undefined =>
  declaration != null && declaration.transport !== "stdio" ? declaration : undefined

const WORKSPACE_PLACE = "claude-code"
const GLOBAL_PLACE = "claude-code-global"

/** The bytes of a file, for proving a write came back out without a trace. */
const bytesOf = (file: string) => fs.readFile(file, "utf8")

let root: string
let home: string
let workspace: string
let userHome: string
let globalFile: string
let projectFile: string
let io: McpIo
/** The fixture as it was written, before any case installs anything. */
let projectBefore: string
let globalBefore: string

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(tmpdir(), "hub-claude-code-"))
  home = path.join(root, "hub")
  workspace = path.join(root, "project")
  userHome = path.join(root, "person")
  globalFile = path.join(userHome, ".claude.json")
  projectFile = path.join(workspace, ".mcp.json")
  await fs.mkdir(home, { recursive: true })
  await fs.mkdir(workspace, { recursive: true })
  await fs.mkdir(userHome, { recursive: true })

  /* Claude Code spells a project's path with forward slashes; the hub is told the
     platform's spelling. The two must still be the same project. */
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

  io = {
    files: createFsPlaceFiles({ home, folder: workspace, userHome }),
    log: () => undefined,
  }
  projectBefore = await bytesOf(projectFile)
  globalBefore = await bytesOf(globalFile)
})

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe("places", () => {
  it("describes two, the project file being the switchable one", () => {
    expect(claudeCodeMcp.places).toHaveLength(2)
    expect(claudeCodeMcp.places[0]?.scope).toBe("global")
    expect(claudeCodeMcp.places[1]?.file).toBe(".mcp.json")
    expect(claudeCodeMcp.setEnabled).toBeDefined()
    expect(claudeCodeMcp.places[1]?.switchable, "the switch belongs to the workspace place").toBe(
      true
    )
    expect(claudeCodeMcp.places[0]?.switchable, "the machine-wide one declares none").toBe(false)
  })
})

describe("reads", () => {
  it("reads the project file's server in full, connected while no list names it", async () => {
    const project = await claudeCodeMcp.read(io, WORKSPACE_PLACE)
    expect(project).toHaveLength(1)
    expect(project[0]?.name).toBe("shared")
    expect(stdioOf(project[0]?.declaration)?.command).toBe("npx")
    expect(project[0]?.enabled).toBe(true)
  })

  it("reads the global file as holding no server of its own", async () => {
    expect(await claudeCodeMcp.read(io, GLOBAL_PLACE)).toEqual([])
  })
})

describe("installing", () => {
  it("adds a stdio server beside the one already there, keeping its arguments", async () => {
    await claudeCodeMcp.install(io, WORKSPACE_PLACE, "ctx", {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@x/ctx"],
      env: { TOKEN: "abc" },
    })
    const installed = await bytesOf(projectFile)
    expect(installed).toContain('"ctx"')
    expect(installed).toContain('"shared"')
    expect(installed).toContain("@x/ctx")
  })

  it("writes a remote server node by node, leaving the rest of the file alone", async () => {
    await claudeCodeMcp.install(io, GLOBAL_PLACE, "remote", {
      transport: "sse",
      url: "https://example.test/mcp",
      headers: { Authorization: "Bearer k" },
    })
    const withRemote = await bytesOf(globalFile)
    expect(valueAt(readJsonObject(withRemote), ["mcpServers", "remote", "type"])).toBe("sse")
    expect(withRemote, "the comment above the file").toContain("// Claude Code wrote this")
    expect(withRemote, "an unrelated project").toContain('"their-cli"')
    expect(withRemote, "the project's own settings").toContain('"allowedTools"')
  })

  it("reads the remote server back, with its transport and header", async () => {
    const reread = await claudeCodeMcp.read(io, GLOBAL_PLACE)
    expect(reread).toHaveLength(1)
    expect(reread[0]?.name).toBe("remote")
    expect(reread[0]?.declaration?.transport).toBe("sse")
    expect(remoteOf(reread[0]?.declaration)?.headers?.Authorization).toBe("Bearer k")
  })
})

describe("switching a project off", () => {
  let installed: string
  let off: string

  beforeAll(async () => {
    await claudeCodeMcp.install(io, WORKSPACE_PLACE, "ctx", {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@x/ctx"],
      env: { TOKEN: "abc" },
    })
    installed = await bytesOf(projectFile)
  })

  it("lands the name in the project's list without touching the declaration file", async () => {
    await setEnabled(io, WORKSPACE_PLACE, "workspace", "shared", false)
    off = await bytesOf(globalFile)
    expect(off).toContain('"disabledMcpServers"')
    expect(off).toContain('"shared"')
    expect(await bytesOf(projectFile), "the declaration file").toBe(installed)
    expect(off.match(/"mcpServers": \{\}/g), "no second project record is invented").toHaveLength(1)
  })

  it("reads the server back switched off, and writes the same thing twice", async () => {
    const offProject = await claudeCodeMcp.read(io, WORKSPACE_PLACE)
    expect(offProject[0]?.enabled).toBe(false)

    await setEnabled(io, WORKSPACE_PLACE, "workspace", "shared", false)
    expect(await bytesOf(globalFile)).toBe(off)
  })

  it("takes the name out again when it is switched back on", async () => {
    await setEnabled(io, WORKSPACE_PLACE, "workspace", "shared", true)
    const on = await bytesOf(globalFile)
    expect(on).not.toContain('"disabledMcpServers"')
    expect(on).toContain('"their-cli"')
  })

  /* The list is a project's, so a switch asked for under the machine-wide scope
     has nowhere to land and must be refused rather than written somewhere. */
  it("is refused under the machine-wide scope, writing nothing", async () => {
    const on = await bytesOf(globalFile)
    await expect(
      setEnabled(io, GLOBAL_PLACE, "global", "remote", false)
    ).rejects.toThrow(/claudeCode\.error\.machineScope/)
    expect(await bytesOf(globalFile)).toBe(on)
  })

  /* Another workspace the hub can open but Claude Code has no record of: the
     switch has nowhere to go, and inventing a project record would tell Claude
     Code about a folder it never saw. */
  it("is refused for a project Claude Code never opened, leaving its file alone", async () => {
    const on = await bytesOf(globalFile)
    const fresh = path.join(root, "fresh")
    await fs.mkdir(fresh, { recursive: true })
    const loner = createFsPlaceFiles({
      home: path.join(root, "other-hub"),
      folder: fresh,
      userHome,
    })
    await expect(
      setEnabled(
        { files: loner, log: () => undefined },
        WORKSPACE_PLACE,
        "workspace",
        "shared",
        false
      )
    ).rejects.toThrow(/claudeCode\.error\.noProject/)
    expect(await bytesOf(globalFile)).toBe(on)
  })
})

/* Taking both back out leaves the two files as the fixture wrote them, which is
   the whole point of writing node by node. */
describe("taking it back out", () => {
  it("leaves both files byte for byte as they were", async () => {
    await claudeCodeMcp.uninstall(io, WORKSPACE_PLACE, "ctx")
    await claudeCodeMcp.uninstall(io, GLOBAL_PLACE, "remote")
    expect(await bytesOf(projectFile)).toBe(projectBefore)
    expect(await bytesOf(globalFile)).toBe(globalBefore)
  })
})

describe("a project that had no config file yet", () => {
  let blankFiles: ReturnType<typeof createFsPlaceFiles>
  let blankIo: McpIo
  let blankFile: string

  beforeAll(async () => {
    /* Its own hub home, so this project is the workspace in use rather than the
       one above. */
    const blank = path.join(root, "blank-project")
    blankFile = path.join(blank, ".mcp.json")
    await fs.mkdir(blank, { recursive: true })
    blankFiles = createFsPlaceFiles({ home: path.join(root, "blank-hub"), folder: blank, userHome })
    blankIo = { files: blankFiles, log: () => undefined }
  })

  it("holds no file, and installing writes one", async () => {
    expect(await blankFiles.read({ scope: "workspace", file: ".mcp.json" })).toBeNull()
    await claudeCodeMcp.install(blankIo, WORKSPACE_PLACE, "ctx", {
      transport: "stdio",
      command: "npx",
      args: [],
      env: {},
    })
    expect(await bytesOf(blankFile)).toContain("ctx")
  })

  /* The hub writes the file for its first server and leaves it behind when that
     server leaves: it cannot tell later that it created the file, and deleting
     one a person keeps is worse than keeping an empty box. */
  it("leaves the key empty rather than taking the file away", async () => {
    await claudeCodeMcp.uninstall(blankIo, WORKSPACE_PLACE, "ctx")
    expect(readJsonObject(await bytesOf(blankFile))).toEqual({ mcpServers: {} })
  })
})

describe("pointing at an entry", () => {
  it("finds the lines the entry occupies, and those lines hold its name", async () => {
    const lines = await locate(io, WORKSPACE_PLACE, "shared")
    expect(lines).toBeDefined()
    expect(lines![1]).toBeGreaterThanOrEqual(lines![0])
    const held = (await bytesOf(projectFile))
      .split("\n")
      .slice(lines![0] - 1, lines![1])
      .join("\n")
    expect(held).toContain("shared")
  })
})
