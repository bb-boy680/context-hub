/**
 * Behaviour check for the places the skill library reads and writes: the skills
 * a directory holds, and the link that installs one into it. It runs against
 * temporary directories and asserts the contract — reading never creates
 * anything, an install is a link whose target says where it came from, the hub
 * removes only links it made, a place's directory is read under the root its
 * scope names, and the store answers for the workspace the hub is pointed at.
 *
 * Run from the package: `node scripts/check-place-skills.ts`
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { createFsSkillStore } from "../src/host/skills-fs.ts"
import {
  deleteSkillIn,
  installSkillInto,
  linkSkillIntoLibrary,
  readPlaceSkill,
  readPlaceSkillFile,
  readPlaceSkills,
  removeSkillFrom,
  placeSkillRoot,
} from "../src/host/place-skills.ts"

/** The directory the skills CLI and this hub share, in every workspace. */
const SHARED = path.join(".agents", "skills")

/** One agent's own directory, which is what a place is for. */
const AGENT_DIR = path.join(".claude", "skills")

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

const home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-place-skills-"))
const library = path.join(home, "skills")
const workspace = path.join(home, "project")
/* The home directory a global place reads under; separate from the hub's own. */
const userHome = path.join(home, "user")
console.log(`home: ${home}`)

await writeSkill(path.join(library, "alpha"), "Alpha", "First skill")
await writeSkill(path.join(library, "beta"), "Beta", "Second skill")
await fs.mkdir(workspace, { recursive: true })
await fs.mkdir(userHome, { recursive: true })

/* Reading a workspace the hub has never touched creates nothing. */
const empty = await readPlaceSkills(workspace, library, SHARED)
check("a workspace with no skills directory reads as empty", empty.skills.length === 0, empty.skills)
check("it names the directory it looked in", empty.root === placeSkillRoot(workspace, SHARED), empty.root)
check(
  "reading creates nothing",
  (await fs.stat(placeSkillRoot(workspace, SHARED)).catch(() => null)) === null
)

/* Installing is a link, and the link is the record of where it came from. */
const first = await installSkillInto(workspace, library, "alpha", SHARED)
check("installing answers how it landed", first === "link", first)
const installed = path.join(placeSkillRoot(workspace, SHARED), "alpha")
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

const held = await readPlaceSkills(workspace, library, SHARED)
check("the workspace now holds one skill", held.skills.length === 1, held.skills)
check("an installed skill reads as the hub's", held.skills[0]?.origin === "hub", held.skills[0])
check("its name comes from the manifest", held.skills[0]?.name === "Alpha", held.skills[0])
check("its description comes from the manifest", held.skills[0]?.description === "First skill")

/* The project's own skills belong to the project, and are read, never claimed. */
await writeSkill(path.join(placeSkillRoot(workspace, SHARED), "own-one"), "Own one", "Written here")
await fs.mkdir(path.join(placeSkillRoot(workspace, SHARED), "not-a-skill"), { recursive: true })
const withOwn = await readPlaceSkills(workspace, library, SHARED)
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
await installSkillInto(workspace, library, "beta", SHARED)
await fs.rm(path.join(library, "beta"), { recursive: true, force: true })
const broken = await readPlaceSkills(workspace, library, SHARED)
const stale = broken.skills.find((skill) => skill.id === "beta")
check("a link with no library skill reads as stale", stale?.origin === "stale", stale)
check("a stale link keeps its id as a name", stale?.name === "beta", stale?.name)

/* Removing: the hub takes back its own link, and refuses everything else. */
await step("removing an installed skill", () => removeSkillFrom(workspace, library, "alpha", SHARED))
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
  await removeSkillFrom(workspace, library, "own-one", SHARED)
} catch (error) {
  refused = error instanceof Error ? error.message : String(error)
}
check("the hub refuses to remove a skill it did not install", refused.includes("not installed by Context Hub"), refused)
check(
  "the refused skill is still there",
  (await fs.stat(path.join(placeSkillRoot(workspace, SHARED), "own-one"))).isDirectory()
)
refused = ""
try {
  await removeSkillFrom(workspace, library, "missing", SHARED)
} catch (error) {
  refused = error instanceof Error ? error.message : String(error)
}
check("removing what is not there is refused", refused.includes("not in this place"), refused)

/* A skill the project owns is read where it lives, manifest and files both. */
const own = await readPlaceSkill(workspace, "own-one", SHARED)
check("a place skill reads its own manifest", own?.name === "Own one", own?.name)
check("and its description", own?.description === "Written here", own?.description)
check("and the manifest as written, frontmatter included", own?.text.startsWith("---\n") === true, own?.text)
check(
  "and the files beside it",
  JSON.stringify(own?.files.map((file) => file.path)) === JSON.stringify(["SKILL.md"]),
  own?.files
)
await fs.writeFile(path.join(placeSkillRoot(workspace, SHARED), "own-one", "notes.md"), "note")
const withFile = await readPlaceSkill(workspace, "own-one", SHARED)
check(
  "a file added beside the manifest shows up",
  withFile?.files.some((file) => file.path === "notes.md") === true,
  withFile?.files
)
check("a skill that is not there reads as nothing", (await readPlaceSkill(workspace, "missing", SHARED)) === null)
check(
  "a name that would read outside the root is refused",
  await readPlaceSkill(workspace, "../escape", SHARED).then(
    () => false,
    (error: unknown) => (error as Error).message.includes("unusable skill name")
  )
)

/* One file of a place skill is read through the same directory guard. */
check(
  "a file beside the manifest reads",
  (await readPlaceSkillFile(workspace, "own-one", "notes.md", SHARED)) === "note"
)
check(
  "the manifest reads as written",
  (await readPlaceSkillFile(workspace, "own-one", "SKILL.md", SHARED))?.startsWith("---\n") === true
)
check(
  "a file that is not there reads as nothing",
  (await readPlaceSkillFile(workspace, "own-one", "missing.md", SHARED)) === null
)
check(
  "a path that would read outside the skill is refused",
  await readPlaceSkillFile(workspace, "own-one", "../../../outside.txt", SHARED).then(
    () => false,
    (error: unknown) => (error as Error).message.includes("escapes the skill directory")
  )
)
check(
  "and a name that would read outside the root is refused too",
  await readPlaceSkillFile(workspace, "../escape", "SKILL.md", SHARED).then(
    () => false,
    (error: unknown) => (error as Error).message.includes("unusable skill name")
  )
)

/* Deleting takes the directory, which is what the row's delete offers. */
await writeSkill(path.join(placeSkillRoot(workspace, SHARED), "doomed"), "Doomed", "About to go")
await fs.writeFile(path.join(placeSkillRoot(workspace, SHARED), "doomed", "extra.md"), "x")
await step("deleting a place skill", () => deleteSkillIn(workspace, "doomed", SHARED))
check(
  "the directory is gone",
  (await fs.stat(path.join(placeSkillRoot(workspace, SHARED), "doomed")).catch(() => null)) === null
)
refused = ""
try {
  await deleteSkillIn(workspace, "doomed", SHARED)
} catch (error) {
  refused = error instanceof Error ? error.message : String(error)
}
check("deleting what is not there is refused", refused.includes("not in this place"), refused)
await fs.mkdir(path.join(placeSkillRoot(workspace, SHARED), "not-a-skill"), { recursive: true })
refused = ""
try {
  await deleteSkillIn(workspace, "not-a-skill", SHARED)
} catch (error) {
  refused = error instanceof Error ? error.message : String(error)
}
check("a directory with no manifest is refused", refused.includes("not a skill in this place"), refused)
check(
  "the refused directory is still there",
  (await fs.stat(path.join(placeSkillRoot(workspace, SHARED), "not-a-skill"))).isDirectory()
)
refused = ""
try {
  await deleteSkillIn(workspace, "../escape", SHARED)
} catch (error) {
  refused = error instanceof Error ? error.message : String(error)
}
check("a name that would delete outside the root is refused", refused.includes("unusable skill name"), refused)

/* The library links a place skill in, so the two are one skill. */
await writeSkill(path.join(placeSkillRoot(workspace, SHARED), "linked-one"), "Linked one", "Lives here")
const linkMode = await linkSkillIntoLibrary(workspace, library, "linked-one", SHARED)
check("linking into the library answers how it landed", linkMode === "link", linkMode)
const inLibrary = path.join(library, "linked-one")
check(
  "the library entry is a link",
  (await fs.lstat(inLibrary).catch(() => null))?.isSymbolicLink() === true
)
check(
  "pointing at the place's own directory",
  path.resolve(library, await fs.readlink(inLibrary)) ===
    path.join(placeSkillRoot(workspace, SHARED), "linked-one"),
  await fs.readlink(inLibrary)
)
check(
  "the place keeps the files",
  (
    await fs.readFile(path.join(placeSkillRoot(workspace, SHARED), "linked-one", "SKILL.md"), "utf8")
  ).includes("Linked one")
)
refused = ""
try {
  await linkSkillIntoLibrary(workspace, library, "linked-one", SHARED)
} catch (error) {
  refused = error instanceof Error ? error.message : String(error)
}
check("linking the same name twice is refused", refused.includes("already in the library"), refused)
refused = ""
try {
  await linkSkillIntoLibrary(workspace, library, "not-here", SHARED)
} catch (error) {
  refused = error instanceof Error ? error.message : String(error)
}
check("linking a skill the place lacks is refused", refused.includes("not a skill in this place"), refused)
refused = ""
try {
  await linkSkillIntoLibrary(workspace, library, "..", SHARED)
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
await installSkillInto(workspace, library, "alpha", SHARED)
try {
  await installSkillInto(workspace, library, "alpha", SHARED)
} catch (error) {
  refused = error instanceof Error ? error.message : String(error)
}
check("installing a skill twice is refused", refused.includes("already in this place"), refused)
refused = ""
try {
  await installSkillInto(workspace, library, "nowhere", SHARED)
} catch (error) {
  refused = error instanceof Error ? error.message : String(error)
}
check("installing a skill the library does not have is refused", refused.includes("not a skill in the library"), refused)
refused = ""
try {
  await installSkillInto(workspace, library, "../escape", SHARED)
} catch (error) {
  refused = error instanceof Error ? error.message : String(error)
}
check("a name that would write outside the root is refused", refused.includes("unusable skill name"), refused)

/* The store answers for the workspace the hub is pointed at. */
await removeSkillFrom(workspace, library, "alpha", SHARED)
const store = await createFsSkillStore({ home, userHome })
const sharedRef = { scope: "workspace", dir: SHARED } as const
check("with no workspace picked the store answers nothing", (await store.placeSkills(sharedRef)) === null)
const state = path.join(home, "state")
await fs.mkdir(state, { recursive: true })
await fs.writeFile(
  path.join(state, "workspaces.json"),
  JSON.stringify({ folders: [{ name: "project", path: workspace }], current: workspace })
)
const forWorkspace = await store.placeSkills(sharedRef)
check("the store reads the picked workspace", forWorkspace?.skills.some((skill) => skill.id === "own-one") === true, forWorkspace)
check("it reads the same root the reader named", forWorkspace?.root === placeSkillRoot(workspace, SHARED), forWorkspace?.root)
const landed = await store.installInto("alpha", sharedRef)
check("the store installs into that workspace", landed === "link", landed)
check(
  "and the workspace now holds it",
  (await readPlaceSkills(workspace, library, SHARED)).skills.some((skill) => skill.id === "alpha")
)
await store.removeFrom("alpha", sharedRef)
check(
  "and takes it back out",
  (await readPlaceSkills(workspace, library, SHARED)).skills.every((skill) => skill.id !== "alpha")
)

/* The library lists a linked skill like any other, and says it is a link. */
await store.refresh()
const page = await store.list()
const linkedRow = page.items.find((item) => item.id === "linked-one")
check("a linked skill is listed by the library", linkedRow !== undefined, page.items.map((item) => item.id))
check(
  "and the row says where its files live",
  linkedRow?.link === path.join(placeSkillRoot(workspace, SHARED), "linked-one"),
  linkedRow?.link
)
check("a linked row carries no date", linkedRow?.updatedAt === "", linkedRow?.updatedAt)
const heldRow = page.items.find((item) => item.id === "alpha")
check("a skill the library holds itself carries no link", heldRow?.link === undefined, heldRow?.link)
check("and it carries the date of its own files", (heldRow?.updatedAt ?? "") !== "", heldRow?.updatedAt)

/* Adopting carries the workspace's own CLI record into the library, so the
   row knows which revision it holds and can be checked against the source. */
await writeSkill(path.join(placeSkillRoot(workspace, SHARED), "tracked-one"), "Tracked one", "From a package")
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
await store.adoptFrom("tracked-one", sharedRef)
const tracked = (await store.list()).items.find((item) => item.id === "tracked-one")
check("an adopted skill keeps the source its lock recorded", tracked?.upstream?.source === "mattpocock/skills", tracked?.upstream)
check("with the recorded revision", tracked?.upstream?.hash === "a".repeat(64), tracked?.upstream?.hash)
await store.remove("tracked-one")
await fs.rm(path.join(placeSkillRoot(workspace, SHARED), "tracked-one"), { recursive: true, force: true })
await fs.rm(path.join(workspace, "skills-lock.json"), { force: true })

/* Removing a linked entry takes the link back and leaves those files alone. */
await store.remove("linked-one")
check("the library's entry is gone", (await fs.lstat(inLibrary).catch(() => null)) === null)
check(
  "the place's skill is untouched",
  (
    await fs.readFile(path.join(placeSkillRoot(workspace, SHARED), "linked-one", "SKILL.md"), "utf8")
  ).includes("Linked one")
)

/* A place an agent contributes is a directory of its own: reads, installs and
   removals there leave the shared `.agents/skills` directory alone. */
const agentRoot = path.join(workspace, AGENT_DIR)
check(
  "a place reads its own directory",
  (await readPlaceSkills(workspace, library, AGENT_DIR)).root === agentRoot,
  (await readPlaceSkills(workspace, library, AGENT_DIR)).root
)
check(
  "which is empty until something is installed there",
  (await readPlaceSkills(workspace, library, AGENT_DIR)).skills.length === 0
)
check(
  "installing into a place answers how it landed",
  (await installSkillInto(workspace, library, "alpha", AGENT_DIR)) === "link"
)
const shared = path.join(workspace, SHARED)
check(
  "and the shared directory is untouched",
  (await fs.lstat(path.join(shared, "alpha")).catch(() => null)) === null
)
check(
  "the place holds it",
  (await readPlaceSkills(workspace, library, AGENT_DIR)).skills.some((skill) => skill.id === "alpha")
)
check(
  "reading it back by hand goes through the same directory",
  (await readPlaceSkill(workspace, "alpha", AGENT_DIR))?.name === "Alpha"
)
await removeSkillFrom(workspace, library, "alpha", AGENT_DIR)
check(
  "taking it back out leaves the place empty again",
  (await readPlaceSkills(workspace, library, AGENT_DIR)).skills.length === 0
)
for (const bad of ["", "..", path.join("..", "outside"), path.resolve(workspace)]) {
  let rejected = ""
  try {
    await readPlaceSkills(workspace, library, bad)
  } catch (error) {
    rejected = error instanceof Error ? error.message : String(error)
  }
  check(`a directory outside the root is refused: "${bad}"`, rejected.includes("not a directory inside its root"), rejected)
}

/* A global place reads the same way under the home directory: the same code
   path, a different root, and nothing of the workspace's involved. */
const globalRef = { scope: "global", dir: AGENT_DIR } as const
check(
  "a global place reads under the home directory",
  (await readPlaceSkills(userHome, library, AGENT_DIR)).root === path.join(userHome, AGENT_DIR),
  (await readPlaceSkills(userHome, library, AGENT_DIR)).root
)
check(
  "and starts empty",
  (await readPlaceSkills(userHome, library, AGENT_DIR)).skills.length === 0
)
await writeSkill(path.join(userHome, AGENT_DIR, "global-one"), "Global one", "Machine wide")
const globalHeld = await readPlaceSkills(userHome, library, AGENT_DIR)
check("a skill written there is listed", globalHeld.skills.some((skill) => skill.id === "global-one"))
check(
  "as somebody else's, not the hub's",
  globalHeld.skills.find((skill) => skill.id === "global-one")?.origin === "own"
)
check(
  "the workspace's own directory never sees it",
  (await readPlaceSkills(workspace, library, SHARED)).skills.every((skill) => skill.id !== "global-one")
)

/* Through the store, the scope alone decides which root is read. */
const storeGlobal = await store.placeSkills(globalRef)
check("the store reads the global place", storeGlobal?.skills.some((skill) => skill.id === "global-one") === true, storeGlobal)
check("and it names the home directory's root", storeGlobal?.root === path.join(userHome, AGENT_DIR), storeGlobal?.root)
await store.installInto("alpha", globalRef)
check(
  "the store installs into it",
  (await readPlaceSkills(userHome, library, AGENT_DIR)).skills.some((skill) => skill.id === "alpha")
)
check(
  "leaving the workspace's shared directory alone",
  (await fs.lstat(path.join(shared, "alpha")).catch(() => null)) === null
)
await store.removeFrom("alpha", globalRef)
check(
  "and takes it back out",
  (await readPlaceSkills(userHome, library, AGENT_DIR)).skills.every((skill) => skill.id !== "alpha")
)

await store.dispose()
await fs.rm(home, { recursive: true, force: true })
console.log(failures === 0 ? "all checks passed" : `${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
