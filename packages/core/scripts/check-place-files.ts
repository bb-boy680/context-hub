/**
 * Behaviour check for the client-file seam: the reader and writer that resolve
 * a place against the workspace in use and the user's home, and the wire check
 * every form applies before it touches a file.
 *
 * What matters here is the boundary: a place may only name a relative file
 * under one of the two roots, reading a file that is not there is `null` rather
 * than an error, and a write leaves the file's text exactly as asked.
 *
 * Run from the package: `node scripts/check-place-files.ts`
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { readPlaceCall } from "../src/place-files.ts"
import { assertPlaceFile, createFsPlaceFiles } from "../src/host/place-files.ts"

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
async function refusalOf(call: () => unknown | Promise<unknown>): Promise<string | null> {
  try {
    await call()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  return null
}

async function main(): Promise<void> {
  const root = await fs.mkdtemp(path.join(tmpdir(), "hub-place-files-"))
  const home = path.join(root, "hub")
  const workspace = path.join(root, "project")
  const userHome = path.join(root, "person")
  await fs.mkdir(path.join(home, "state"), { recursive: true })
  await fs.mkdir(path.join(workspace, ".claude"), { recursive: true })
  await fs.mkdir(userHome, { recursive: true })
  /* The workspace list names the folder in use, which is where a workspace
     place resolves; without a row there would be no workspace at all. */
  await fs.writeFile(
    path.join(home, "state", "workspaces.json"),
    JSON.stringify({ folders: [{ name: "project", path: workspace }], current: workspace })
  )

  const files = createFsPlaceFiles({ home, userHome })
  const workspaceFile = { scope: "workspace", file: ".claude/notes.json" }
  const globalFile = { scope: "global", file: ".codex/config.toml" }

  console.log("places")

  check("a place is accepted as it stands", assertPlaceFile(globalFile).file === ".codex/config.toml")
  check(
    "an absolute file is refused",
    (await refusalOf(() => assertPlaceFile({ ...globalFile, file: "C:/Users/x/.claude.json" })))?.includes(
      "relative"
    ) === true
  )
  check(
    "a file climbing out is refused",
    (await refusalOf(() => assertPlaceFile({ ...globalFile, file: "../secrets.json" })))?.includes("climb") === true
  )
  check("an empty file is refused", (await refusalOf(() => assertPlaceFile({ ...globalFile, file: "" }))) !== null)
  check(
    "an unknown scope is refused",
    (await refusalOf(() => assertPlaceFile({ scope: "elsewhere", file: "a.json" })))?.includes("scope") === true
  )
  check("something that is not a place is refused", (await refusalOf(() => assertPlaceFile(undefined))) === "not a place")

  console.log("reads and writes")

  check("a file that is not there reads as nothing", (await files.read(workspaceFile)) === null)
  await files.write(workspaceFile, '{\n  "a": 1\n}\n')
  check("a written file reads back as written", (await files.read(workspaceFile)) === '{\n  "a": 1\n}\n')
  check(
    "a workspace place lands under the workspace",
    (await fs.readFile(path.join(workspace, ".claude", "notes.json"), "utf8")) === '{\n  "a": 1\n}\n'
  )

  await files.write(globalFile, "model = 'gpt-5'\n")
  check(
    "a global place lands under the home directory",
    (await fs.readFile(path.join(userHome, ".codex", "config.toml"), "utf8")) === "model = 'gpt-5'\n"
  )
  check("a global place does not touch the workspace", (await fs.readdir(path.join(workspace, ".codex")).catch(() => [] as string[])).length === 0)

  await files.write(globalFile, "model = 'gpt-5'\n\n[mcp_servers.x]\ncommand = 'npx'\n")
  check("a second write replaces the whole file", (await files.read(globalFile))?.includes("[mcp_servers.x]") === true)
  check("it does not append", (await files.read(globalFile))?.split("[mcp_servers.x]").length === 2)

  await files.remove(globalFile)
  check("a removed file is gone", (await files.read(globalFile)) === null)
  check("removing it again is not an error", (await refusalOf(() => files.remove(globalFile))) === null)

  const bare = createFsPlaceFiles({ home, folder: workspace, userHome })
  check("a host folder is a workspace without a stored row", (await bare.read({ scope: "workspace", file: "a.txt" })) === null)
  await bare.write({ scope: "workspace", file: "nested/deep/a.txt" }, "hi")
  check("a write creates the directories on the way", (await bare.read({ scope: "workspace", file: "nested/deep/a.txt" })) === "hi")

  const noWorkspace = createFsPlaceFiles({ home: path.join(root, "empty-hub"), userHome })
  check(
    "a workspace place with no workspace refuses to write",
    (await refusalOf(() => noWorkspace.write(workspaceFile, "x")))?.includes("no workspace") === true
  )
  check("reading it answers nothing instead of refusing", (await noWorkspace.read(workspaceFile)) === null)
  check(
    "a global place still reads without one",
    (await noWorkspace.read({ scope: "global", file: "absent.json" })) === null
  )

  console.log("the wire")

  check("a read is accepted", readPlaceCall({ action: "read", ref: globalFile }).action === "read")
  check(
    "a write carries its text",
    readPlaceCall({ action: "write", ref: globalFile, text: "x" }).text === "x"
  )
  check(
    "a write without text is refused",
    (await refusalOf(() => readPlaceCall({ action: "write", ref: globalFile })))?.includes("text") === true
  )
  check(
    "an unknown action is refused",
    (await refusalOf(() => readPlaceCall({ action: "drop", ref: globalFile })))?.includes("action") === true
  )
  check("a call that is not an object is refused", (await refusalOf(() => readPlaceCall("x"))) !== null)
  check(
    "a place without a file is refused",
    (await refusalOf(() => readPlaceCall({ action: "read", ref: { scope: "global" } })))?.includes("file") === true
  )
  check(
    "a place that is not an object is refused",
    (await refusalOf(() => readPlaceCall({ action: "read", ref: 7 })))?.includes("place") === true
  )

  await fs.rm(root, { recursive: true, force: true })

  console.log(`\n${checked - failures}/${checked} checks passed`)
  if (failures > 0) process.exitCode = 1
}

await main()
