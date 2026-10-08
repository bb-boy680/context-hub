/**
 * Behaviour check for the disk-backed workspace list. It runs the store against
 * a temporary hub home and asserts the contract: a home with no document lists
 * nothing, a folder the form reports becomes a row carrying the folder's own
 * name, a path a person reads is derived only when the form knows one, adding
 * and selecting persist and survive a reopen, an unknown workspace is refused
 * rather than silently ignored, and a hand-edited document cannot smuggle in a
 * value that is not a folder.
 *
 * The folder dialog belongs to the form, so it is exercised there, not here.
 *
 * Run from the package: `node scripts/check-workspaces.ts`
 */
import { promises as fs } from "node:fs"
import { homedir, tmpdir } from "node:os"
import path from "node:path"

import { folderId, readWorkspaceState, workspaceName } from "../src/workspace.ts"
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
console.log(`home: ${home}`)

check(
  "a fresh hub lists no workspace",
  JSON.stringify(await store.page()) === JSON.stringify({ folders: [], current: null })
)

/* A form that knows a path: the row shows the path, and selection matches on it. */
const withPath = await store.add({ name: workspaceName(project), path: project })
check("adding a folder makes it the only row", withPath.folders.length === 1, withPath.folders)
check("a row carries the folder's own name", withPath.folders[0]?.name === "marketing-site", withPath.folders[0])
check("a row's id is its path", withPath.folders[0]?.id === project, withPath.folders[0])
check(
  "a path a person reads is the shortened path",
  withPath.folders[0]?.display === project.replace(homedir(), "~"),
  withPath.folders[0]
)
check("the added folder is current", withPath.current === project, withPath.current)

/* A folder inside the home directory is shortened, which is why the disk does it. */
const inside = path.join(homedir(), "hub-notes")
const twoRows = await store.add({ name: "hub-notes", path: inside })
check(
  "a folder under the home directory reads with a tilde",
  twoRows.folders[1]?.display === `~${inside.slice(homedir().length)}`,
  twoRows.folders[1]
)

/* A form that knows only a name, which is what a browser's dialog leaves behind. */
const named = await store.add({ name: "skills" })
check("a folder with no path is still a row", named.folders.length === 3, named.folders)
check("its id is its name", named.folders[2]?.id === "skills", named.folders[2])
check("it shows no path line", named.folders[2]?.display === null, named.folders[2])
check("adding it makes it current", named.current === "skills", named.current)

/* Adding the same folder twice is not a second row. */
const again = await store.add({ name: "skills" })
check("a folder already known is not added twice", again.folders.length === 3, again.folders)
const samePath = await store.add({ name: "ignored-name", path: project })
check("a known path is not added twice either", samePath.folders.length === 3, samePath.folders)
check("the name the hub already had is kept", samePath.folders[0]?.name === "marketing-site", samePath.folders[0])

/* Selecting is a write, and it is what a reload reads back. */
const afterSelect = await store.select(project)
check("selecting makes that folder current", afterSelect.current === project, afterSelect.current)
check(
  "selecting is visible to a store that opens the same home",
  (await createFsWorkspaceStore(home).page()).current === project
)
let refused = ""
try {
  await store.select("nowhere")
} catch (error) {
  refused = error instanceof Error ? error.message : String(error)
}
check("an unknown workspace is refused", refused.includes("not a known workspace"), refused)
check("a refusal changes nothing", (await store.page()).current === project)

/* A hand-edited document is durable JSON, so its values are checked, not trusted. */
check(
  "a document that is not an object is empty",
  JSON.stringify(readWorkspaceState("nope")) === JSON.stringify({ folders: [], current: null })
)
check(
  "an absent document is empty",
  JSON.stringify(readWorkspaceState(null)) === JSON.stringify({ folders: [], current: null })
)
const edited = readWorkspaceState({
  folders: [{ name: "skills" }, { name: "" }, { path: project }, 7, { name: "docs", path: "" }],
  current: "elsewhere",
})
check(
  "only entries that name a folder are kept",
  JSON.stringify(edited.folders) === JSON.stringify([{ name: "skills" }]),
  edited.folders
)
check("a current workspace that is not listed is dropped", edited.current === null, edited.current)
check(
  "a listed workspace stays current",
  readWorkspaceState({ folders: [{ name: "skills" }], current: "skills" }).current === "skills"
)
check(
  "a duplicate id is kept once",
  readWorkspaceState({ folders: [{ name: "skills" }, { name: "skills" }] }).folders.length === 1
)

check("an id is the path when there is one", folderId({ name: "x", path: project }) === project)
check("an id is the name when there is none", folderId({ name: "x" }) === "x")
check("a name comes from the last segment", workspaceName(project) === "marketing-site", workspaceName(project))
check("a Windows path names the same way", workspaceName("D:\\work\\hub") === "hub", workspaceName("D:\\work\\hub"))
check("a trailing separator is not a segment", workspaceName("D:\\work\\hub\\") === "hub", workspaceName("D:\\work\\hub\\"))

await fs.rm(home, { recursive: true, force: true })
console.log(failures === 0 ? "all checks passed" : `${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
