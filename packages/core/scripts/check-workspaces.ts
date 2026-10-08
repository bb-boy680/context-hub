/**
 * Behaviour check for the disk-backed workspace list. It runs the store against
 * a temporary hub home and asserts the contract: a home with no document lists
 * nothing, every row carries the folder's own name and readable path, selecting
 * a folder persists and survives a reopen, an unknown folder is refused rather
 * than silently ignored, and a hand-edited document cannot smuggle in a value
 * that is not a folder path.
 *
 * The folder dialog is the one path this check cannot drive; it is exercised
 * from the form that owns the machine.
 *
 * Run from the package: `node scripts/check-workspaces.ts`
 */
import { promises as fs } from "node:fs"
import { homedir, tmpdir } from "node:os"
import path from "node:path"

import { readWorkspaceState, workspaceName } from "../src/workspace.ts"
import { createFsWorkspaceStore } from "../src/host/workspaces-fs.ts"

let failures = 0

function check(what: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`  ok   ${what}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${what}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`)
}

const home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-workspaces-"))
const store = createFsWorkspaceStore(home)
const project = path.join(home, "projects", "marketing-site")
const insideHome = path.join(homedir(), "hub-notes")
console.log(`home: ${home}`)

check("a fresh hub lists no workspace", JSON.stringify(await store.page()) === JSON.stringify({ folders: [], current: null }))

/* Seed the document the way a form would, then read it through the store. */
await fs.mkdir(path.join(home, "state"), { recursive: true })
await fs.writeFile(
  path.join(home, "state", "workspaces.json"),
  `${JSON.stringify({ folders: [project, insideHome], current: project }, null, 2)}\n`
)

const page = await store.page()
check("every stored folder becomes a row", page.folders.length === 2, page.folders)
check("a row carries the folder's own name", page.folders[0]?.name === "marketing-site", page.folders[0])
check("a row carries the folder's own path", page.folders[0]?.path === project, page.folders[0])
check(
  "a folder under the home directory reads with a tilde",
  page.folders[1]?.display === `~${insideHome.slice(homedir().length)}`,
  page.folders[1]
)
check("the stored workspace is the current one", page.current === project, page.current)

/* Selecting is a write, and it is what a reload reads back. */
const afterSelect = await store.select(insideHome)
check("selecting makes that folder current", afterSelect.current === insideHome, afterSelect.current)
check(
  "selecting is visible to a store that opens the same home",
  (await createFsWorkspaceStore(home).page()).current === insideHome
)
let refused = ""
try {
  await store.select(path.join(home, "not-added"))
} catch (error) {
  refused = error instanceof Error ? error.message : String(error)
}
check("an unknown folder is refused", refused.includes("not a known workspace"), refused)
check("a refusal changes nothing", (await store.page()).current === insideHome)

/* A hand-edited document is durable JSON, so its values are checked, not trusted. */
check("a document that is not an object is empty", JSON.stringify(readWorkspaceState("nope")) === JSON.stringify({ folders: [], current: null }))
check("an absent document is empty", JSON.stringify(readWorkspaceState(null)) === JSON.stringify({ folders: [], current: null }))
const edited = readWorkspaceState({ folders: [project, 7, ""], current: "elsewhere" })
check("an entry that is not a path is dropped", JSON.stringify(edited.folders) === JSON.stringify([project]), edited)
check("a current folder that is not listed is dropped", edited.current === null, edited.current)
check("a listed folder stays current", readWorkspaceState({ folders: [project], current: project }).current === project)

check("a name comes from the last segment", workspaceName(project) === "marketing-site", workspaceName(project))
check("a Windows path names the same way", workspaceName("D:\\work\\hub") === "hub", workspaceName("D:\\work\\hub"))
check("a trailing separator is not a segment", workspaceName("D:\\work\\hub\\") === "hub", workspaceName("D:\\work\\hub\\"))

await fs.rm(home, { recursive: true, force: true })
console.log(failures === 0 ? "all checks passed" : `${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
