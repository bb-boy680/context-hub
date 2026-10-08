/**
 * Behaviour check for the disk-backed workspace list. It runs the store against
 * a temporary hub home and asserts the contract: a home with no document lists
 * nothing, the folder a form walked to becomes a row carrying the folder's own
 * name and its path, a folder that is not there is refused instead of stored,
 * adding and selecting persist and survive a reopen, an unknown workspace is
 * refused rather than silently ignored, and a hand-edited document cannot
 * smuggle in a value that is not a folder.
 *
 * The folder tree belongs to the form, so it is exercised there, not here.
 *
 * Run from the package: `node scripts/check-workspaces.ts`
 */
import { promises as fs } from "node:fs"
import { homedir, tmpdir } from "node:os"
import path from "node:path"

import { folderId, readWorkspaceState, workspaceName } from "../src/workspace.ts"
import { createFsWorkspaceStore } from "../src/host/workspaces-fs.ts"
import { listDirectory } from "../src/host/fs-browse.ts"

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

/* The form reports a folder it walked to: the row carries the name and the path. */
await fs.mkdir(project, { recursive: true })
const withPath = await store.add(project)
check("adding a folder makes it the only row", withPath.folders.length === 1, withPath.folders)
check("a row carries the folder's own name", withPath.folders[0]?.name === "marketing-site", withPath.folders[0])
check("a row's id is its path", withPath.folders[0]?.id === project, withPath.folders[0])
check("a row carries the path itself", withPath.folders[0]?.path === project, withPath.folders[0])
check(
  "a path a person reads is the shortened path",
  withPath.folders[0]?.display === project.replace(homedir(), "~"),
  withPath.folders[0]
)
check("the added folder is current", withPath.current === project, withPath.current)

/* A folder inside the home directory is shortened, which is why the disk does it. */
const inside = path.join(homedir(), "hub-notes")
await fs.mkdir(inside, { recursive: true })
const twoRows = await store.add(inside)
check(
  "a folder under the home directory reads with a tilde",
  twoRows.folders[1]?.display === `~${inside.slice(homedir().length)}`,
  twoRows.folders[1]
)

/* A path the hub cannot read is not a workspace, and storing it would be a lie. */
let missing = ""
try {
  await store.add(path.join(home, "nowhere-at-all"))
} catch (error) {
  missing = error instanceof Error ? error.message : String(error)
}
check("a folder that does not exist is refused", missing.includes("not a folder"), missing)
check("the refusal stores nothing", (await store.page()).folders.length === 2)

/* Adding the same folder twice is not a second row. */
const again = await store.add(project)
check("a folder already known is not added twice", again.folders.length === 2, again.folders)
check("adding it again makes it current", again.current === project, again.current)

/* Selecting is a write, and it is what a reload reads back. */
const afterSelect = await store.select(inside)
check("selecting makes that folder current", afterSelect.current === inside, afterSelect.current)
check(
  "selecting is visible to a store that opens the same home",
  (await createFsWorkspaceStore(home).page()).current === inside
)
let refused = ""
try {
  await store.select("nowhere")
} catch (error) {
  refused = error instanceof Error ? error.message : String(error)
}
check("an unknown workspace is refused", refused.includes("not a known workspace"), refused)
check("a refusal changes nothing", (await store.page()).current === inside)

/* Browsing: one level at a time, folders only, links reported as links. */
const listing = await listDirectory(path.join(home, "projects"))
check(
  "a listing shows the folders it holds and nothing else",
  JSON.stringify(listing.entries.map((entry) => entry.name)) === JSON.stringify(["marketing-site"]),
  listing.entries
)
check("a listing carries an absolute path", listing.path === path.join(home, "projects"), listing.path)
check(
  "a listing names its parent",
  listing.parent === home,
  listing.parent
)
check(
  "a listing carries the trail down from the home directory",
  listing.crumbs.at(-1)?.path === path.join(home, "projects"),
  listing.crumbs
)
await fs.mkdir(path.join(home, ".hidden-project"), { recursive: true })
check(
  "a hidden folder is still a folder a person can walk into",
  (await listDirectory(home)).entries.some((entry) => entry.name === ".hidden-project")
)

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
check(
  "a row written before the hub kept paths is still readable",
  readWorkspaceState({ folders: [{ name: "skills" }] }).folders[0]?.path === undefined
)

check("an id is the path when there is one", folderId({ name: "x", path: project }) === project)
check("an id is the name when there is none", folderId({ name: "x" }) === "x")
check("a name comes from the last segment", workspaceName(project) === "marketing-site", workspaceName(project))
check("a Windows path names the same way", workspaceName("D:\\work\\hub") === "hub", workspaceName("D:\\work\\hub"))
check("a trailing separator is not a segment", workspaceName("D:\\work\\hub\\") === "hub", workspaceName("D:\\work\\hub\\"))

await fs.rm(home, { recursive: true, force: true })
console.log(failures === 0 ? "all checks passed" : `${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
