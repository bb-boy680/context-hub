/**
 * Behaviour check for the workspace half of the skill library: the skills a
 * workspace folder holds, and the link that installs one into it. It runs
 * against temporary directories and asserts the contract — reading never
 * creates anything, an install is a link whose target says where it came from,
 * the hub removes only links it made, and the store answers for the workspace
 * the hub is pointed at.
 *
 * Run from the package: `node scripts/check-workspace-skills.ts`
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { createFsSkillStore } from "../src/host/skills-fs.ts"
import {
  deleteSkillFromWorkspace,
  installSkillIntoWorkspace,
  linkSkillIntoLibrary,
  readWorkspaceSkill,
  readWorkspaceSkills,
  removeSkillFromWorkspace,
  workspaceSkillRoot,
} from "../src/host/workspace-skills.ts"

let failures = 0

function check(what: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`  ok   ${what}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${what}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`)
}

/** Write one skill directory with a manifest the reader can parse. */
async function writeSkill(dir: string, name: string, description: string) {
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(
    path.join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`
  )
}

const step = async (what: string, run: () => Promise<void>) => {
  try {
    await run()
  } catch (error) {
    failures += 1
    console.log(`  FAIL ${what} — ${error instanceof Error ? error.message : String(error)}`)
  }
}

const home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-ws-skills-"))
const library = path.join(home, "skills")
const workspace = path.join(home, "project")
console.log(`home: ${home}`)

await writeSkill(path.join(library, "alpha"), "Alpha", "First skill")
await writeSkill(path.join(library, "beta"), "Beta", "Second skill")
await fs.mkdir(workspace, { recursive: true })

/* Reading a workspace the hub has never touched creates nothing. */
const empty = await readWorkspaceSkills(workspace, library)
check("a workspace with no skills directory reads as empty", empty.skills.length === 0, empty.skills)
check("it names the directory it looked in", empty.root === workspaceSkillRoot(workspace), empty.root)
check(
  "reading creates nothing",
  (await fs.stat(workspaceSkillRoot(workspace)).catch(() => null)) === null
)

/* Installing is a link, and the link is the record of where it came from. */
const first = await installSkillIntoWorkspace(workspace, library, "alpha")
check("installing answers how it landed", first === "link", first)
const installed = path.join(workspaceSkillRoot(workspace), "alpha")
const stat = await fs.lstat(installed).catch(() => null)
check("the entry is a link", stat?.isSymbolicLink() === true, stat?.isSymbolicLink())
check(
  "the link points at the library's own directory",
  path.resolve(path.dirname(installed), await fs.readlink(installed)) === path.join(library, "alpha")
)
check(
  "the link reads through to the manifest",
  (await fs.readFile(path.join(installed, "SKILL.md"), "utf8")).includes("Alpha")
)

const held = await readWorkspaceSkills(workspace, library)
check("the workspace now holds one skill", held.skills.length === 1, held.skills)
check("an installed skill reads as the hub's", held.skills[0]?.origin === "hub", held.skills[0])
check("its name comes from the manifest", held.skills[0]?.name === "Alpha", held.skills[0])
check("its description comes from the manifest", held.skills[0]?.description === "First skill")

/* The project's own skills belong to the project, and are read, never claimed. */
await writeSkill(path.join(workspaceSkillRoot(workspace), "own-one"), "Own one", "Written here")
await fs.mkdir(path.join(workspaceSkillRoot(workspace), "not-a-skill"), { recursive: true })
const withOwn = await readWorkspaceSkills(workspace, library)
check("the project's own skill is listed", withOwn.skills.some((skill) => skill.id === "own-one"))
check(
  "the project's own skill reads as its own",
  withOwn.skills.find((skill) => skill.id === "own-one")?.origin === "own"
)
check(
  "a directory with no manifest is not a skill",
  !withOwn.skills.some((skill) => skill.id === "not-a-skill"),
  withOwn.skills.map((skill) => skill.id)
)

/* A link the library no longer answers for is what cleanup is for. */
await installSkillIntoWorkspace(workspace, library, "beta")
await fs.rm(path.join(library, "beta"), { recursive: true, force: true })
const broken = await readWorkspaceSkills(workspace, library)
const stale = broken.skills.find((skill) => skill.id === "beta")
check("a link with no library skill reads as stale", stale?.origin === "stale", stale)
check("a stale link keeps its id as a name", stale?.name === "beta", stale?.name)

/* Removing: the hub takes back its own link, and refuses everything else. */
await step("removing an installed skill", () => removeSkillFromWorkspace(workspace, library, "alpha"))
check(
  "the link is gone",
  (await fs.lstat(installed).catch(() => null)) === null
)
check(
  "the library's own copy stays",
  (await fs.stat(path.join(library, "alpha"))).isDirectory()
)
let refused = ""
try {
  await removeSkillFromWorkspace(workspace, library, "own-one")
} catch (error) {
  refused = error instanceof Error ? error.message : String(error)
}
check("the hub refuses to remove a skill it did not install", refused.includes("not installed by Context Hub"), refused)
check(
  "the refused skill is still there",
  (await fs.stat(path.join(workspaceSkillRoot(workspace), "own-one"))).isDirectory()
)
refused = ""
try {
  await removeSkillFromWorkspace(workspace, library, "missing")
} catch (error) {
  refused = error instanceof Error ? error.message : String(error)
}
check("removing what is not there is refused", refused.includes("not in this workspace"), refused)

/* A skill the workspace owns is read where it lives, manifest and files both. */
const own = await readWorkspaceSkill(workspace, "own-one")
check("a workspace skill reads its own manifest", own?.name === "Own one", own?.name)
check("and its description", own?.description === "Written here", own?.description)
check("and the manifest as written, frontmatter included", own?.text.startsWith("---\n") === true, own?.text)
check(
  "and the files beside it",
  JSON.stringify(own?.files.map((file) => file.path)) === JSON.stringify(["SKILL.md"]),
  own?.files
)
await fs.writeFile(path.join(workspaceSkillRoot(workspace), "own-one", "notes.md"), "note")
const withFile = await readWorkspaceSkill(workspace, "own-one")
check(
  "a file added beside the manifest shows up",
  withFile?.files.some((file) => file.path === "notes.md") === true,
  withFile?.files
)
check("a skill that is not there reads as nothing", (await readWorkspaceSkill(workspace, "missing")) === null)
check(
  "a name that would read outside the root is refused",
  await readWorkspaceSkill(workspace, "../escape").then(
    () => false,
    (error: unknown) => (error as Error).message.includes("unusable skill name")
  )
)

/* Deleting takes the directory, which is what the row's delete offers. */
await writeSkill(path.join(workspaceSkillRoot(workspace), "doomed"), "Doomed", "About to go")
await fs.writeFile(path.join(workspaceSkillRoot(workspace), "doomed", "extra.md"), "x")
await step("deleting a workspace skill", () => deleteSkillFromWorkspace(workspace, "doomed"))
check(
  "the directory is gone",
  (await fs.stat(path.join(workspaceSkillRoot(workspace), "doomed")).catch(() => null)) === null
)
refused = ""
try {
  await deleteSkillFromWorkspace(workspace, "doomed")
} catch (error) {
  refused = error instanceof Error ? error.message : String(error)
}
check("deleting what is not there is refused", refused.includes("not in this workspace"), refused)
await fs.mkdir(path.join(workspaceSkillRoot(workspace), "not-a-skill"), { recursive: true })
refused = ""
try {
  await deleteSkillFromWorkspace(workspace, "not-a-skill")
} catch (error) {
  refused = error instanceof Error ? error.message : String(error)
}
check("a directory with no manifest is refused", refused.includes("not a skill in this workspace"), refused)
check(
  "the refused directory is still there",
  (await fs.stat(path.join(workspaceSkillRoot(workspace), "not-a-skill"))).isDirectory()
)
refused = ""
try {
  await deleteSkillFromWorkspace(workspace, "../escape")
} catch (error) {
  refused = error instanceof Error ? error.message : String(error)
}
check("a name that would delete outside the root is refused", refused.includes("unusable skill name"), refused)

/* The library links a workspace skill in, so the two are one skill. */
await writeSkill(path.join(workspaceSkillRoot(workspace), "linked-one"), "Linked one", "Lives here")
const linkMode = await linkSkillIntoLibrary(workspace, library, "linked-one")
check("linking into the library answers how it landed", linkMode === "link", linkMode)
const inLibrary = path.join(library, "linked-one")
check(
  "the library entry is a link",
  (await fs.lstat(inLibrary).catch(() => null))?.isSymbolicLink() === true
)
check(
  "pointing at the workspace's own directory",
  path.resolve(library, await fs.readlink(inLibrary)) === path.join(workspaceSkillRoot(workspace), "linked-one"),
  await fs.readlink(inLibrary)
)
check(
  "the workspace keeps the files",
  (await fs.readFile(path.join(workspaceSkillRoot(workspace), "linked-one", "SKILL.md"), "utf8")).includes("Linked one")
)
refused = ""
try {
  await linkSkillIntoLibrary(workspace, library, "linked-one")
} catch (error) {
  refused = error instanceof Error ? error.message : String(error)
}
check("linking the same name twice is refused", refused.includes("already in the library"), refused)
refused = ""
try {
  await linkSkillIntoLibrary(workspace, library, "not-here")
} catch (error) {
  refused = error instanceof Error ? error.message : String(error)
}
check("linking a skill the workspace lacks is refused", refused.includes("not a skill in this workspace"), refused)
refused = ""
try {
  await linkSkillIntoLibrary(workspace, library, "..")
} catch (error) {
  refused = error instanceof Error ? error.message : String(error)
}
check("a name that would write outside the library is refused", refused.includes("unusable skill name"), refused)
check(
  "the library gained no stray entry",
  (await fs.lstat(path.join(library, "adopted-one")).catch(() => null)) === null
)

/* Installing twice is a mistake, not a second entry. */
refused = ""
await installSkillIntoWorkspace(workspace, library, "alpha")
try {
  await installSkillIntoWorkspace(workspace, library, "alpha")
} catch (error) {
  refused = error instanceof Error ? error.message : String(error)
}
check("installing a skill twice is refused", refused.includes("already in this workspace"), refused)
refused = ""
try {
  await installSkillIntoWorkspace(workspace, library, "nowhere")
} catch (error) {
  refused = error instanceof Error ? error.message : String(error)
}
check("installing a skill the library does not have is refused", refused.includes("not a skill in the library"), refused)
refused = ""
try {
  await installSkillIntoWorkspace(workspace, library, "../escape")
} catch (error) {
  refused = error instanceof Error ? error.message : String(error)
}
check("a name that would write outside the root is refused", refused.includes("unusable skill name"), refused)

/* The store answers for the workspace the hub is pointed at. */
await removeSkillFromWorkspace(workspace, library, "alpha")
const store = await createFsSkillStore({ home })
check("with no workspace picked the store answers nothing", (await store.workspaceSkills()) === null)
const state = path.join(home, "state")
await fs.mkdir(state, { recursive: true })
await fs.writeFile(
  path.join(state, "workspaces.json"),
  JSON.stringify({ folders: [{ name: "project", path: workspace }], current: workspace })
)
const forWorkspace = await store.workspaceSkills()
check("the store reads the picked workspace", forWorkspace?.skills.some((skill) => skill.id === "own-one") === true, forWorkspace)
check("it reads the same root the reader named", forWorkspace?.root === workspaceSkillRoot(workspace), forWorkspace?.root)
const landed = await store.installToWorkspace("alpha")
check("the store installs into that workspace", landed === "link", landed)
check(
  "and the workspace now holds it",
  (await readWorkspaceSkills(workspace, library)).skills.some((skill) => skill.id === "alpha")
)
await store.removeFromWorkspace("alpha")
check(
  "and takes it back out",
  (await readWorkspaceSkills(workspace, library)).skills.every((skill) => skill.id !== "alpha")
)

/* The library lists a linked skill like any other, and says it is a link. */
await store.refresh()
const page = await store.list()
const linkedRow = page.items.find((item) => item.id === "linked-one")
check("a linked skill is listed by the library", linkedRow !== undefined, page.items.map((item) => item.id))
check(
  "and the row says where its files live",
  linkedRow?.link === path.join(workspaceSkillRoot(workspace), "linked-one"),
  linkedRow?.link
)
check("a linked row carries no date", linkedRow?.updatedAt === "", linkedRow?.updatedAt)
const heldRow = page.items.find((item) => item.id === "alpha")
check("a skill the library holds itself carries no link", heldRow?.link === undefined, heldRow?.link)
check("and it carries the date of its own files", (heldRow?.updatedAt ?? "") !== "", heldRow?.updatedAt)

/* Adopting carries the workspace's own CLI record into the library, so the
   row knows which revision it holds and can be checked against the source. */
await writeSkill(path.join(workspaceSkillRoot(workspace), "tracked-one"), "Tracked one", "From a package")
await fs.writeFile(
  path.join(workspace, "skills-lock.json"),
  `${JSON.stringify({
    version: 1,
    skills: {
      "tracked-one": {
        source: "mattpocock/skills",
        sourceType: "github",
        skillPath: "skills/productivity/tracked-one/SKILL.md",
        computedHash: "a".repeat(64),
      },
    },
  })}\n`
)
await store.importFromWorkspace("tracked-one")
const tracked = (await store.list()).items.find((item) => item.id === "tracked-one")
check("an adopted skill keeps the source its lock recorded", tracked?.upstream?.source === "mattpocock/skills", tracked?.upstream)
check("with the recorded revision", tracked?.upstream?.hash === "a".repeat(64), tracked?.upstream?.hash)
await store.remove("tracked-one")
await fs.rm(path.join(workspaceSkillRoot(workspace), "tracked-one"), { recursive: true, force: true })
await fs.rm(path.join(workspace, "skills-lock.json"), { force: true })

/* Removing a linked entry takes the link back and leaves those files alone. */
await store.remove("linked-one")
check("the library's entry is gone", (await fs.lstat(inLibrary).catch(() => null)) === null)
check(
  "the workspace's skill is untouched",
  (await fs.readFile(path.join(workspaceSkillRoot(workspace), "linked-one", "SKILL.md"), "utf8")).includes(
    "Linked one"
  )
)

await store.dispose()
await fs.rm(home, { recursive: true, force: true })
console.log(failures === 0 ? "all checks passed" : `${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
