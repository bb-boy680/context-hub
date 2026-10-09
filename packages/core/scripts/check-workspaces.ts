/**
 * Behaviour check for the disk-backed workspace list. It runs the store against
 * a temporary hub home and asserts the contract: a home with no document lists
 * nothing, the folder a person picked becomes a row carrying the folder's own
 * name and its path, a name that no folder answers for is refused instead of
 * stored, adding and selecting persist and survive a reopen, an unknown
 * workspace is refused rather than silently ignored, and a hand-edited document
 * cannot smuggle in a value that is not a folder.
 *
 * The system's folder dialog belongs to the form, so it is exercised there.
 *
 * Run from the package: `node scripts/check-workspaces.ts`
 */
import { promises as fs } from "node:fs"
import { homedir, tmpdir } from "node:os"
import path from "node:path"

import { folderId, readWorkspaceState, workspaceName } from "../src/workspace.ts"
import { createFsWorkspaceStore } from "../src/host/workspaces-fs.ts"
import { projectRoot } from "../src/host/fs-browse.ts"

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
  "a fresh hub lists no workspace and no agent",
  JSON.stringify(await store.page()) ===
    JSON.stringify({ folders: [], current: null, agents: [] }),
  await store.page()
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

/* The system dialog reports a folder's name and nothing else, so a name is
   placed among the folders the hub knows; a name that fits nowhere is refused
   rather than guessed at. */
const sibling = path.join(home, "projects", "marketing-site-copy")
await fs.mkdir(sibling, { recursive: true })
const byName = await store.add("marketing-site-copy")
check(
  "a folder's name finds it beside one the hub knows",
  byName.folders.some((folder) => folder.path === sibling),
  byName.folders
)
refused = ""
try {
  await store.add("a-folder-that-is-not-there")
} catch (error) {
  refused = error instanceof Error ? error.message : String(error)
}
check("a name no folder answers for is refused", refused.includes("no folder named"), refused)
refused = ""
try {
  await store.add("projects/marketing-site")
} catch (error) {
  refused = error instanceof Error ? error.message : String(error)
}
check("a name that is a path is refused", refused.includes("not a folder"), refused)

/* The same name beside two known folders names nothing in particular, so the
   hub refuses rather than picking one of somebody else's projects. */
await fs.mkdir(path.join(home, "west", "twin"), { recursive: true })
await fs.mkdir(path.join(home, "east", "twin"), { recursive: true })
await store.add(path.join(home, "west", "twin"))
await store.add(path.join(home, "east", "twin"))
refused = ""
try {
  await store.add("twin")
} catch (error) {
  refused = error instanceof Error ? error.message : String(error)
}
/* Both are already known under this name, which is also a refusal to guess. */
check(
  "a name two folders answer for is refused",
  refused.includes("more than one folder is named"),
  refused
)

/* The agents this hub delivers to are remembered beside the folder. Several
   can be chosen at once, because each one is a directory of its own, and
   choosing one twice is not a second choice. */
const folderCount = (await store.page()).folders.length
check("no agent is chosen to begin with", (await store.page()).agents.length === 0)
check(
  "choosing one records it",
  JSON.stringify((await store.setAgent("hub.target.claude-code", true)).agents) ===
    JSON.stringify(["hub.target.claude-code"])
)
check(
  "choosing a second keeps the first",
  JSON.stringify((await store.setAgent("hub.target.sample", true)).agents) ===
    JSON.stringify(["hub.target.claude-code", "hub.target.sample"]),
  (await store.page()).agents
)
check(
  "choosing one that is already chosen changes nothing",
  (await store.setAgent("hub.target.sample", true)).agents.length === 2
)
check(
  "it survives a folder switch",
  JSON.stringify((await store.select(inside)).agents) ===
    JSON.stringify(["hub.target.claude-code", "hub.target.sample"])
)
check(
  "giving one up keeps the rest",
  JSON.stringify((await store.setAgent("hub.target.claude-code", false)).agents) ===
    JSON.stringify(["hub.target.sample"]),
  (await store.page()).agents
)
check(
  "giving up one that was not chosen changes nothing",
  (await store.setAgent("hub.target.codex", false)).agents.length === 1
)
check("giving up the last one leaves none", (await store.setAgent("hub.target.sample", false)).agents.length === 0)

/* Two choices made at once both land: each is a read-modify-write of one
   document, so an unserialized store would let the later write undo the first. */
await Promise.all([
  store.setAgent("hub.target.alpha", true),
  store.setAgent("hub.target.beta", true),
])
check(
  "two choices made at once both land",
  JSON.stringify((await store.page()).agents) === JSON.stringify(["hub.target.alpha", "hub.target.beta"]),
  (await store.page()).agents
)
check(
  "and the folders are untouched by either",
  (await store.page()).folders.length === folderCount
)
await store.setAgent("hub.target.alpha", false)
await store.setAgent("hub.target.beta", false)
check("clearing both leaves none", (await store.page()).agents.length === 0)
check(
  "and every folder is still there",
  (await store.page()).folders.length === folderCount,
  (await store.page()).folders.length
)

/* A hand-edited document is durable JSON, so its values are checked, not trusted. */
check(
  "a document that is not an object is empty",
  JSON.stringify(readWorkspaceState("nope")) ===
    JSON.stringify({ folders: [], current: null, agents: [] })
)
check(
  "an absent document is empty",
  JSON.stringify(readWorkspaceState(null)) ===
    JSON.stringify({ folders: [], current: null, agents: [] })
)
check(
  "an agent that is not a name is dropped",
  readWorkspaceState({ folders: [], agents: [7] }).agents.length === 0
)
check(
  "a document written before agents were multiple reads as its one choice",
  JSON.stringify(readWorkspaceState({ folders: [], agent: "hub.target.codex" }).agents) ===
    JSON.stringify(["hub.target.codex"])
)
check(
  "and a repeated name is one choice",
  JSON.stringify(readWorkspaceState({ folders: [], agents: ["a", "a", ""] }).agents) ===
    JSON.stringify(["a"])
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

/* The host's own folder is a workspace without anyone picking it. */
const hostHome = await fs.mkdtemp(path.join(tmpdir(), "context-hub-host-"))
const repo = path.join(hostHome, "my-project")
await fs.mkdir(path.join(repo, "sub"), { recursive: true })
check("a folder with no repository above it stands on its own", (await projectRoot(path.join(repo, "sub"))) === path.join(repo, "sub"))
await fs.mkdir(path.join(repo, ".git"), { recursive: true })
check(
  "a folder inside a repository belongs to the repository",
  (await projectRoot(path.join(repo, "sub"))) === repo,
  await projectRoot(path.join(repo, "sub"))
)

const hostStore = createFsWorkspaceStore(path.join(hostHome, "hub"), { folder: repo })
const adopted = await hostStore.page()
check("the host's folder is a workspace by itself", adopted.folders.length === 1, adopted.folders)
check("it carries the folder's name", adopted.folders[0]?.name === "my-project", adopted.folders[0])
check("it carries the folder's path", adopted.folders[0]?.path === repo, adopted.folders[0])
check("it is current when nothing else was", adopted.current === repo, adopted.current)
check(
  "adopting it is written down, not repeated",
  JSON.stringify((await createFsWorkspaceStore(path.join(hostHome, "hub"), { folder: repo }).page()).folders) ===
    JSON.stringify(adopted.folders)
)

/* A row from before the hub kept paths names the host's folder: it takes the path. */
const legacyHome = path.join(hostHome, "legacy")
await fs.mkdir(path.join(legacyHome, "state"), { recursive: true })
await fs.writeFile(
  path.join(legacyHome, "state", "workspaces.json"),
  JSON.stringify({ folders: [{ name: "my-project" }, { name: "elsewhere" }], current: "my-project" })
)
const healed = await createFsWorkspaceStore(legacyHome, { folder: repo }).page()
check("the name-only row is replaced, not duplicated", healed.folders.length === 2, healed.folders)
check(
  "it keeps its place and now points at the host's folder",
  healed.folders[0]?.name === "my-project" && healed.folders[0]?.path === repo,
  healed.folders[0]
)
check("and it stays the current workspace", healed.current === repo, healed.current)
check(
  "a row the host does not name is left alone",
  healed.folders[1]?.name === "elsewhere" && healed.folders[1]?.path === null,
  healed.folders[1]
)

/* A row naming a folder beside one the hub knows takes that folder's path:
   workspaces are folders a person keeps side by side. */
const besideHome = path.join(hostHome, "beside")
await fs.mkdir(path.join(besideHome, "state"), { recursive: true })
const neighbour = path.join(hostHome, "neighbour-project")
await fs.mkdir(neighbour, { recursive: true })
await fs.writeFile(
  path.join(besideHome, "state", "workspaces.json"),
  JSON.stringify({
    folders: [{ name: "my-project" }, { name: "neighbour-project" }, { name: "nowhere" }],
    current: "neighbour-project",
  })
)
const beside = await createFsWorkspaceStore(besideHome, { folder: repo }).page()
check("the neighbour keeps its place as it takes a path", beside.folders[1]?.path === neighbour, beside.folders[1])
check("and stays the current one", beside.current === neighbour, beside.current)
check(
  "a name nothing answers for stays name-only",
  beside.folders[2]?.name === "nowhere" && beside.folders[2]?.path === null,
  beside.folders[2]
)
check(
  "the host's own name still takes the host's folder",
  beside.folders[0]?.path === repo,
  beside.folders[0]
)
check(
  "healing is written down, not repeated",
  JSON.stringify((await createFsWorkspaceStore(besideHome, { folder: repo }).page()).folders) ===
    JSON.stringify(beside.folders)
)

/* A host with no folder of its own adopts nothing. */
const plain = await createFsWorkspaceStore(path.join(hostHome, "plain")).page()
check("a store with no host folder stays empty", plain.folders.length === 0, plain.folders)

await fs.rm(home, { recursive: true, force: true })
await fs.rm(hostHome, { recursive: true, force: true })
console.log(failures === 0 ? "all checks passed" : `${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
