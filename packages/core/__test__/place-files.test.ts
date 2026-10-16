/**
 * Behaviour of the client-file seam: the reader and writer that resolve a place
 * against the workspace in use and the user's home, and the wire check every
 * form applies before it touches a file.
 *
 * What matters here is the boundary: a place may only name a relative file under
 * one of the two roots, reading a file that is not there is `null` rather than
 * an error, and a write leaves the file's text exactly as asked.
 *
 * All three roots — the hub home, the workspace, and the person's home — are
 * temporary, because a place is exactly what can climb out of one.
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { readPlaceCall } from "../src/place-files.ts"
import { assertPlaceFile, createFsPlaceFiles } from "../src/host/place-files.ts"

let root: string
let home: string
let workspace: string
let userHome: string

const workspaceFile = { scope: "workspace", file: ".claude/notes.json" } as const
const globalFile = { scope: "global", file: ".codex/config.toml" } as const

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(tmpdir(), "hub-place-files-"))
  home = path.join(root, "hub")
  workspace = path.join(root, "project")
  userHome = path.join(root, "person")
  await fs.mkdir(path.join(home, "state"), { recursive: true })
  await fs.mkdir(path.join(workspace, ".claude"), { recursive: true })
  await fs.mkdir(userHome, { recursive: true })
  /* The workspace list names the folder in use, which is where a workspace
     place resolves; without a row there would be no workspace at all. */
  await fs.writeFile(
    path.join(home, "state", "workspaces.json"),
    JSON.stringify({ folders: [{ name: "project", path: workspace }], current: workspace })
  )
})

afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

const files = () => createFsPlaceFiles({ home, userHome })

describe("a place", () => {
  it("is accepted as it stands", () => {
    expect(assertPlaceFile(globalFile).file).toBe(".codex/config.toml")
  })

  it("is refused when the file is absolute", () => {
    expect(() => assertPlaceFile({ ...globalFile, file: "C:/Users/x/.claude.json" })).toThrow(
      /relative/
    )
  })

  it("is refused when the file climbs out", () => {
    expect(() => assertPlaceFile({ ...globalFile, file: "../secrets.json" })).toThrow(/climb/)
  })

  it("is refused when the file is empty", () => {
    expect(() => assertPlaceFile({ ...globalFile, file: "" })).toThrow()
  })

  it("is refused when the scope is unknown", () => {
    expect(() => assertPlaceFile({ scope: "elsewhere", file: "a.json" })).toThrow(/scope/)
  })

  it("is refused when it is not a place at all", () => {
    expect(() => assertPlaceFile(undefined)).toThrow(/^not a place$/)
  })
})

describe("reading and writing", () => {
  it("answers nothing for a file that is not there", async () => {
    expect(await files().read(workspaceFile)).toBeNull()
  })

  it("reads back exactly what was written", async () => {
    await files().write(workspaceFile, '{\n  "a": 1\n}\n')
    expect(await files().read(workspaceFile)).toBe('{\n  "a": 1\n}\n')
  })

  it("lands a workspace place under the workspace", async () => {
    expect(await fs.readFile(path.join(workspace, ".claude", "notes.json"), "utf8")).toBe(
      '{\n  "a": 1\n}\n'
    )
  })

  it("lands a global place under the person's home", async () => {
    await files().write(globalFile, "model = 'gpt-5'\n")
    expect(await fs.readFile(path.join(userHome, ".codex", "config.toml"), "utf8")).toBe(
      "model = 'gpt-5'\n"
    )
  })

  it("does not touch the workspace on the way", async () => {
    expect(await fs.readdir(path.join(workspace, ".codex")).catch(() => [])).toEqual([])
  })

  it("replaces the whole file on a second write, rather than appending", async () => {
    await files().write(globalFile, "model = 'gpt-5'\n\n[mcp_servers.x]\ncommand = 'npx'\n")
    expect(await files().read(globalFile)).toContain("[mcp_servers.x]")
    expect((await files().read(globalFile))?.split("[mcp_servers.x]")).toHaveLength(2)
  })

  it("leaves nothing behind when the file is removed", async () => {
    await files().remove(globalFile)
    expect(await files().read(globalFile)).toBeNull()
  })

  it("is not an error to remove it again", async () => {
    await expect(files().remove(globalFile)).resolves.toBeUndefined()
  })

  /* A host folder stands in for a stored row, so a form that was handed a folder
     can write without the person having added it to the list first. */
  it("takes the host folder as a workspace with no stored row", async () => {
    const bare = createFsPlaceFiles({ home, folder: workspace, userHome })
    expect(await bare.read({ scope: "workspace", file: "a.txt" })).toBeNull()
    await bare.write({ scope: "workspace", file: "nested/deep/a.txt" }, "hi")
    expect(await bare.read({ scope: "workspace", file: "nested/deep/a.txt" })).toBe("hi")
  })

  it("refuses a workspace place when there is no workspace", async () => {
    const noWorkspace = createFsPlaceFiles({ home: path.join(root, "empty-hub"), userHome })
    await expect(noWorkspace.write(workspaceFile, "x")).rejects.toThrow(/no workspace/)
  })

  it("answers nothing rather than refusing when there is no workspace", async () => {
    const noWorkspace = createFsPlaceFiles({ home: path.join(root, "empty-hub"), userHome })
    expect(await noWorkspace.read(workspaceFile)).toBeNull()
  })

  it("still reads a global place without one", async () => {
    const noWorkspace = createFsPlaceFiles({ home: path.join(root, "empty-hub"), userHome })
    expect(await noWorkspace.read({ scope: "global", file: "absent.json" })).toBeNull()
  })
})

describe("the wire", () => {
  it("accepts a read", () => {
    expect(readPlaceCall({ action: "read", ref: globalFile }).action).toBe("read")
  })

  it("carries the text of a write", () => {
    expect(readPlaceCall({ action: "write", ref: globalFile, text: "x" }).text).toBe("x")
  })

  it("refuses a write with no text", () => {
    expect(() => readPlaceCall({ action: "write", ref: globalFile })).toThrow(/text/)
  })

  it("refuses an unknown action", () => {
    expect(() => readPlaceCall({ action: "drop", ref: globalFile })).toThrow(/action/)
  })

  it("refuses a call that is not an object", () => {
    expect(() => readPlaceCall("x")).toThrow()
  })

  it("refuses a place with no file", () => {
    expect(() => readPlaceCall({ action: "read", ref: { scope: "global" } })).toThrow(/file/)
  })

  it("refuses a place that is not an object", () => {
    expect(() => readPlaceCall({ action: "read", ref: 7 })).toThrow(/place/)
  })
})
