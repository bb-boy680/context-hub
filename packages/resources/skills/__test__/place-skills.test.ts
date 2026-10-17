/**
 * Behaviour of the places the skill library reads and writes: the skills a
 * directory holds, and the link that installs one into it. It runs against
 * temporary directories and asserts the contract — reading never creates
 * anything, an install is a link whose target says where it came from, the hub
 * removes only links it made, a place's directory is read under the root its
 * scope names, and the store answers for the workspace the hub is pointed at.
 *
 * The flow is one narrative: each block below builds on the directory the block
 * before it left behind, so the cases run in the order they are declared.
 */
import { mkdtempSync, promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

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

/* Built at module scope, not in a hook, so a case table below can name the
   workspace's own absolute path — which is one of the inputs under test. */
const home = mkdtempSync(path.join(tmpdir(), "context-hub-place-skills-"))
/** The library root: the store's own `skills/` beside the hub home. */
const library = path.join(home, "skills")
const workspace = path.join(home, "project")
/** The home directory a global place reads under; separate from the hub's own. */
const userHome = path.join(home, "user")

/** Write one skill directory with a manifest the reader can parse. */
async function writeSkill(dir: string, name: string, description: string) {
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(
    path.join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`
  )
}

/** The directory a place resolves to inside the workspace. */
const sharedRoot = () => placeSkillRoot(workspace, SHARED)
/** The directory a linked entry in the library points at. */
const linkedOne = () => path.join(sharedRoot(), "linked-one")

beforeAll(async () => {
  await writeSkill(path.join(library, "alpha"), "Alpha", "First skill")
  await writeSkill(path.join(library, "beta"), "Beta", "Second skill")
  await fs.mkdir(workspace, { recursive: true })
  await fs.mkdir(userHome, { recursive: true })
})

afterAll(async () => {
  await fs.rm(home, { recursive: true, force: true })
})

/* Reading a workspace the hub has never touched creates nothing. */
describe("a workspace the hub has never touched", () => {
  it("reads as empty, names the directory it looked in, and creates nothing", async () => {
    const empty = await readPlaceSkills(workspace, library, SHARED)
    expect(empty.skills).toEqual([])
    expect(empty.root).toBe(sharedRoot())
    expect(await fs.stat(sharedRoot()).catch(() => null)).toBeNull()
  })
})

/* Installing is a link, and the link is the record of where it came from. */
describe("installing", () => {
  let installed: string

  beforeAll(async () => {
    installed = path.join(sharedRoot(), "alpha")
  })

  it("answers how it landed, and lands as a link into the library", async () => {
    expect(await installSkillInto(workspace, library, "alpha", SHARED)).toBe("link")

    const stat = await fs.lstat(installed).catch(() => null)
    expect(stat?.isSymbolicLink()).toBe(true)
    expect(path.resolve(path.dirname(installed), await fs.readlink(installed))).toBe(
      path.join(library, "alpha")
    )
  })

  it("reads through to the manifest", async () => {
    expect(await fs.readFile(path.join(installed, "SKILL.md"), "utf8")).toContain("Alpha")
  })

  it("is then listed as the hub's own, named and described from its manifest", async () => {
    const held = await readPlaceSkills(workspace, library, SHARED)
    expect(held.skills).toHaveLength(1)
    expect(held.skills[0]?.origin).toBe("hub")
    expect(held.skills[0]?.name).toBe("alpha")
    expect(held.skills[0]?.description).toBe("First skill")
  })
})

/* The project's own skills belong to the project, and are read, never claimed. */
describe("a skill the project wrote itself", () => {
  beforeAll(async () => {
    await writeSkill(path.join(sharedRoot(), "own-one"), "Own one", "Written here")
    await fs.mkdir(path.join(sharedRoot(), "not-a-skill"), { recursive: true })
  })

  it("is listed, and reads as its own rather than the hub's", async () => {
    const withOwn = await readPlaceSkills(workspace, library, SHARED)
    expect(withOwn.skills.map((skill) => skill.name)).toContain("own-one")
    expect(withOwn.skills.find((skill) => skill.name === "own-one")?.origin).toBe("own")
  })

  it("ignores a directory with no manifest", async () => {
    const withOwn = await readPlaceSkills(workspace, library, SHARED)
    expect(withOwn.skills.map((skill) => skill.name)).not.toContain("not-a-skill")
  })
})

/* A link the library no longer answers for is what cleanup is for. */
describe("a link the library no longer answers for", () => {
  beforeAll(async () => {
    await installSkillInto(workspace, library, "beta", SHARED)
    await fs.rm(path.join(library, "beta"), { recursive: true, force: true })
  })

  it("reads as stale, keeping its id as a name", async () => {
    const broken = await readPlaceSkills(workspace, library, SHARED)
    const stale = broken.skills.find((skill) => skill.name === "beta")
    expect(stale?.origin).toBe("stale")
    expect(stale?.name).toBe("beta")
  })
})

/* Removing: the hub takes back its own link, and refuses everything else. */
describe("removing", () => {
  it("takes the hub's own link back and leaves the library's copy", async () => {
    await removeSkillFrom(workspace, library, "alpha", SHARED)
    expect(await fs.lstat(path.join(sharedRoot(), "alpha")).catch(() => null)).toBeNull()
    expect((await fs.stat(path.join(library, "alpha"))).isDirectory()).toBe(true)
  })

  it("refuses a skill it did not install, and leaves it there", async () => {
    await expect(removeSkillFrom(workspace, library, "own-one", SHARED)).rejects.toThrow(
      /not installed by Context Hub/
    )
    expect((await fs.stat(path.join(sharedRoot(), "own-one"))).isDirectory()).toBe(true)
  })

  it("refuses one that is not in this place", async () => {
    await expect(removeSkillFrom(workspace, library, "missing", SHARED)).rejects.toThrow(
      /not in this place/
    )
  })
})

/* A skill the project owns is read where it lives, manifest and files both. */
describe("reading one place skill", () => {
  it("reads its own manifest, description, text and files", async () => {
    const own = await readPlaceSkill(workspace, "own-one", SHARED)
    expect(own?.name).toBe("own-one")
    expect(own?.description).toBe("Written here")
    expect(own?.text.startsWith("---\n"), "the manifest as written, frontmatter included").toBe(true)
    expect(own?.files.map((file) => file.path)).toEqual(["SKILL.md"])
  })

  it("shows a file added beside the manifest", async () => {
    await fs.writeFile(path.join(sharedRoot(), "own-one", "notes.md"), "note")
    const withFile = await readPlaceSkill(workspace, "own-one", SHARED)
    expect(withFile?.files.map((file) => file.path)).toContain("notes.md")
  })

  it("reads a skill that is not there as nothing", async () => {
    expect(await readPlaceSkill(workspace, "missing", SHARED)).toBeNull()
  })

  it("refuses a name that would read outside the root", async () => {
    await expect(readPlaceSkill(workspace, "../escape", SHARED)).rejects.toThrow(
      /unusable skill name/
    )
  })
})

/* One file of a place skill is read through the same directory guard. */
describe("reading one file of a place skill", () => {
  it("reads a file beside the manifest, and the manifest as written", async () => {
    expect(await readPlaceSkillFile(workspace, "own-one", "notes.md", SHARED)).toBe("note")
    expect(
      (await readPlaceSkillFile(workspace, "own-one", "SKILL.md", SHARED))?.startsWith("---\n")
    ).toBe(true)
  })

  it("reads a file that is not there as nothing", async () => {
    expect(await readPlaceSkillFile(workspace, "own-one", "missing.md", SHARED)).toBeNull()
  })

  it("refuses a path that would read outside the skill", async () => {
    await expect(
      readPlaceSkillFile(workspace, "own-one", "../../../outside.txt", SHARED)
    ).rejects.toThrow(/escapes the skill directory/)
  })

  it("refuses a name that would read outside the root", async () => {
    await expect(readPlaceSkillFile(workspace, "../escape", "SKILL.md", SHARED)).rejects.toThrow(
      /unusable skill name/
    )
  })
})

/* Deleting takes the directory, which is what the row's delete offers. */
describe("deleting a place skill", () => {
  it("takes the directory, files and all", async () => {
    await writeSkill(path.join(sharedRoot(), "doomed"), "Doomed", "About to go")
    await fs.writeFile(path.join(sharedRoot(), "doomed", "extra.md"), "x")
    await deleteSkillIn(workspace, "doomed", SHARED)
    expect(await fs.stat(path.join(sharedRoot(), "doomed")).catch(() => null)).toBeNull()
  })

  it("refuses one that is not there", async () => {
    await expect(deleteSkillIn(workspace, "doomed", SHARED)).rejects.toThrow(/not in this place/)
  })

  it("refuses a directory with no manifest, and leaves it there", async () => {
    await fs.mkdir(path.join(sharedRoot(), "not-a-skill"), { recursive: true })
    await expect(deleteSkillIn(workspace, "not-a-skill", SHARED)).rejects.toThrow(
      /not a skill in this place/
    )
    expect((await fs.stat(path.join(sharedRoot(), "not-a-skill"))).isDirectory()).toBe(true)
  })

  it("refuses a name that would delete outside the root", async () => {
    await expect(deleteSkillIn(workspace, "../escape", SHARED)).rejects.toThrow(
      /unusable skill name/
    )
  })
})

/* The library links a place skill in, so the two are one skill. */
describe("linking a place skill into the library", () => {
  let inLibrary: string

  beforeAll(async () => {
    await writeSkill(path.join(sharedRoot(), "linked-one"), "Linked one", "Lives here")
    inLibrary = path.join(library, "linked-one")
  })

  it("answers how it landed, and points at the place's own directory", async () => {
    expect(await linkSkillIntoLibrary(workspace, library, "linked-one", SHARED)).toBe("link")
    expect((await fs.lstat(inLibrary).catch(() => null))?.isSymbolicLink()).toBe(true)
    expect(path.resolve(library, await fs.readlink(inLibrary))).toBe(linkedOne())
  })

  it("leaves the files where the place keeps them", async () => {
    expect(await fs.readFile(path.join(linkedOne(), "SKILL.md"), "utf8")).toContain("Linked one")
  })

  it("refuses the same name twice", async () => {
    await expect(linkSkillIntoLibrary(workspace, library, "linked-one", SHARED)).rejects.toThrow(
      /already in the library/
    )
  })

  it("refuses a skill the place does not have", async () => {
    await expect(linkSkillIntoLibrary(workspace, library, "not-here", SHARED)).rejects.toThrow(
      /not a skill in this place/
    )
  })

  it("refuses a name that would write outside the library", async () => {
    await expect(linkSkillIntoLibrary(workspace, library, "..", SHARED)).rejects.toThrow(
      /unusable skill name/
    )
    expect(await fs.lstat(path.join(library, "adopted-one")).catch(() => null)).toBeNull()
  })
})

/* Installing twice is a mistake, not a second entry. */
describe("installing what is already there", () => {
  it("refuses a skill the place already holds", async () => {
    await installSkillInto(workspace, library, "alpha", SHARED)
    await expect(installSkillInto(workspace, library, "alpha", SHARED)).rejects.toThrow(
      /already in this place/
    )
  })

  it("refuses a skill the library does not have", async () => {
    await expect(installSkillInto(workspace, library, "nowhere", SHARED)).rejects.toThrow(
      /not a skill in the library/
    )
  })

  it("refuses a name that would write outside the root", async () => {
    await expect(installSkillInto(workspace, library, "../escape", SHARED)).rejects.toThrow(
      /unusable skill name/
    )
  })
})

/* The store answers for the workspace the hub is pointed at. */
describe("the store", () => {
  let store: Awaited<ReturnType<typeof createFsSkillStore>>
  const sharedRef = { scope: "workspace", dir: SHARED } as const

  beforeAll(async () => {
    await removeSkillFrom(workspace, library, "alpha", SHARED)
    store = await createFsSkillStore({ home, userHome })
  })

  afterAll(() => {
    store.dispose()
  })

  it("answers nothing for a workspace before one is picked", async () => {
    expect(await store.placeSkills(sharedRef)).toBeNull()
  })

  it("reads the picked workspace, at the same root the reader named", async () => {
    const state = path.join(home, "state")
    await fs.mkdir(state, { recursive: true })
    await fs.writeFile(
      path.join(state, "workspaces.json"),
      JSON.stringify({ folders: [{ name: "project", path: workspace }], current: workspace })
    )
    const forWorkspace = await store.placeSkills(sharedRef)
    expect(forWorkspace?.skills.map((skill) => skill.name)).toContain("own-one")
    expect(forWorkspace?.root).toBe(sharedRoot())
  })

  it("installs into that workspace and takes it back out", async () => {
    expect(await store.installInto("alpha", sharedRef)).toBe("link")
    expect((await readPlaceSkills(workspace, library, SHARED)).skills.map((s) => s.name)).toContain(
      "alpha"
    )
    await store.removeFrom("alpha", sharedRef)
    expect((await readPlaceSkills(workspace, library, SHARED)).skills.map((s) => s.name)).not.toContain(
      "alpha"
    )
  })
})

/* The library lists a linked skill like any other, and says it is a link. */
describe("the library's own list", () => {
  let rows: Awaited<ReturnType<Awaited<ReturnType<typeof createFsSkillStore>>["list"]>>["items"]

  beforeAll(async () => {
    const store = await createFsSkillStore({ home, userHome })
    await store.refresh()
    rows = (await store.list()).items
    store.dispose()
  })

  it("lists a linked skill, with where its files live", () => {
    const linkedRow = rows.find((item) => item.name === "linked-one")
    expect(linkedRow).toBeDefined()
    expect(linkedRow?.link).toBe(linkedOne())
    expect(linkedRow?.updatedAt, "a linked row carries no date").toBe("")
  })

  it("carries no link on a skill the library holds itself, and its files' own date", () => {
    const heldRow = rows.find((item) => item.name === "alpha")
    expect(heldRow?.link).toBeUndefined()
    expect(heldRow?.updatedAt).not.toBe("")
  })
})

/* Adopting carries the workspace's own CLI record into the library, so the row
   knows which revision it holds and can be checked against the source. */
describe("adopting a place skill", () => {
  let tracked: Awaited<ReturnType<Awaited<ReturnType<typeof createFsSkillStore>>["list"]>>["items"][number] | undefined
  let store: Awaited<ReturnType<typeof createFsSkillStore>>

  beforeAll(async () => {
    store = await createFsSkillStore({ home, userHome })
    const sharedRef = { scope: "workspace", dir: SHARED } as const
    await writeSkill(path.join(sharedRoot(), "tracked-one"), "Tracked one", "From a package")
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
    tracked = (await store.list()).items.find((item) => item.name === "tracked-one")

    await store.remove("tracked-one")
    await fs.rm(path.join(sharedRoot(), "tracked-one"), { recursive: true, force: true })
    await fs.rm(path.join(workspace, "skills-lock.json"), { force: true })
  })

  afterAll(() => {
    store.dispose()
  })

  it("keeps the source its lock recorded, and the revision", () => {
    expect(tracked?.upstream?.source).toBe("mattpocock/skills")
    expect(tracked?.upstream?.hash).toBe("a".repeat(64))
  })
})

/* Removing a linked entry takes the link back and leaves those files alone. */
describe("removing a linked entry", () => {
  it("takes the library's entry back and leaves the place's skill untouched", async () => {
    const store = await createFsSkillStore({ home, userHome })
    await store.remove("linked-one")
    store.dispose()

    expect(await fs.lstat(path.join(library, "linked-one")).catch(() => null)).toBeNull()
    expect(await fs.readFile(path.join(linkedOne(), "SKILL.md"), "utf8")).toContain("Linked one")
  })
})

/* A place an agent contributes is a directory of its own: reads, installs and
   removals there leave the shared `.agents/skills` directory alone. */
describe("a place of its own", () => {
  const agentRoot = () => placeSkillRoot(workspace, AGENT_DIR)

  it("reads its own directory, empty until something is installed there", async () => {
    expect((await readPlaceSkills(workspace, library, AGENT_DIR)).root).toBe(agentRoot())
    expect((await readPlaceSkills(workspace, library, AGENT_DIR)).skills).toEqual([])
  })

  it("installs into the place, leaving the shared directory untouched", async () => {
    expect(await installSkillInto(workspace, library, "alpha", AGENT_DIR)).toBe("link")
    expect(await fs.lstat(path.join(sharedRoot(), "alpha")).catch(() => null)).toBeNull()
    expect((await readPlaceSkills(workspace, library, AGENT_DIR)).skills.map((s) => s.name)).toContain(
      "alpha"
    )
    expect((await readPlaceSkill(workspace, "alpha", AGENT_DIR))?.name).toBe("alpha")
  })

  it("leaves the place empty again when it is taken back out", async () => {
    await removeSkillFrom(workspace, library, "alpha", AGENT_DIR)
    expect((await readPlaceSkills(workspace, library, AGENT_DIR)).skills).toEqual([])
  })

  it.each(["", "..", path.join("..", "outside"), path.resolve(workspace)])(
    "refuses a directory outside the root: %j",
    async (dir) => {
      await expect(readPlaceSkills(workspace, library, dir)).rejects.toThrow(
        /not a directory inside its root/
      )
    }
  )
})

/* A global place reads the same way under the home directory: the same code
   path, a different root, and nothing of the workspace's involved. */
describe("a global place", () => {
  const globalRef = { scope: "global", dir: AGENT_DIR } as const
  const globalRoot = () => path.join(userHome, AGENT_DIR)

  it("reads under the home directory, and starts empty", async () => {
    expect((await readPlaceSkills(userHome, library, AGENT_DIR)).root).toBe(globalRoot())
    expect((await readPlaceSkills(userHome, library, AGENT_DIR)).skills).toEqual([])
  })

  it("lists a skill written there as somebody else's, not the hub's", async () => {
    await writeSkill(path.join(globalRoot(), "global-one"), "Global one", "Machine wide")
    const globalHeld = await readPlaceSkills(userHome, library, AGENT_DIR)
    expect(globalHeld.skills.map((skill) => skill.name)).toContain("global-one")
    expect(globalHeld.skills.find((skill) => skill.name === "global-one")?.origin).toBe("own")
  })

  it("is never seen by the workspace's own directory", async () => {
    const held = await readPlaceSkills(workspace, library, SHARED)
    expect(held.skills.map((skill) => skill.name)).not.toContain("global-one")
  })

  describe("through the store", () => {
    let store: Awaited<ReturnType<typeof createFsSkillStore>>

    beforeAll(async () => {
      store = await createFsSkillStore({ home, userHome })
    })

    afterAll(() => {
      store.dispose()
    })

    it("reads the global place, naming the home directory's root", async () => {
      const storeGlobal = await store.placeSkills(globalRef)
      expect(storeGlobal?.skills.map((skill) => skill.name)).toContain("global-one")
      expect(storeGlobal?.root).toBe(globalRoot())
    })

    it("installs into it, leaving the workspace's shared directory alone, and takes it out", async () => {
      await store.installInto("alpha", globalRef)
      expect(
        (await readPlaceSkills(userHome, library, AGENT_DIR)).skills.map((s) => s.name)
      ).toContain("alpha")
      expect(await fs.lstat(path.join(sharedRoot(), "alpha")).catch(() => null)).toBeNull()

      await store.removeFrom("alpha", globalRef)
      expect(
        (await readPlaceSkills(userHome, library, AGENT_DIR)).skills.map((s) => s.name)
      ).not.toContain("alpha")
    })
  })
})
