/**
 * Behaviour of the disk-backed workspace list: a home with no document lists
 * nothing, the folder a person picked becomes a row carrying the folder's own
 * name and its path, a name that no folder answers for is refused instead of
 * stored, adding and selecting persist and survive a reopen, an unknown
 * workspace is refused rather than silently ignored, and a hand-edited document
 * cannot smuggle in a value that is not a folder.
 *
 * The system's folder dialog belongs to the form, so it is exercised there.
 *
 * One folder here is real: `displayPath` shortens against the machine's own home
 * and takes no home argument, so proving the tilde needs a path that really is
 * under it. It is named after this process and removed at the end.
 */
import { promises as fs } from "node:fs"
import { homedir, tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { folderId, readWorkspaceState, workspaceName } from "../src/workspace.ts"
import { createFsWorkspaceStore } from "../src/host/workspaces-fs.ts"
import { projectRoot } from "../src/host/fs-browse.ts"

const EMPTY = { folders: [], current: null, agents: [] }

let home: string
let store: ReturnType<typeof createFsWorkspaceStore>
let project: string
let inside: string

beforeAll(async () => {
  home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-workspaces-"))
  project = path.join(home, "projects", "marketing-site")
  await fs.mkdir(project, { recursive: true })
  /* Named after the process so two runs of the suite cannot collide. */
  inside = path.join(homedir(), `hub-notes-${process.pid}`)
  await fs.mkdir(inside, { recursive: true })
  store = createFsWorkspaceStore(home)
})

afterAll(async () => {
  await fs.rm(inside, { recursive: true, force: true })
  await fs.rm(home, { recursive: true, force: true })
})

describe("the workspace list", () => {
  it("starts with no workspace and no agent", async () => {
    expect(await store.page()).toEqual(EMPTY)
  })

  /* The form reports a folder it walked to: the row carries the name and the path. */
  describe("a folder a person picked", () => {
    let withPath: Awaited<ReturnType<typeof store.add>>

    beforeAll(async () => {
      withPath = await store.add(project)
    })

    it("is the only row, carrying its own name and path", () => {
      expect(withPath.folders).toHaveLength(1)
      expect(withPath.folders[0]?.name).toBe("marketing-site")
      expect(withPath.folders[0]?.id, "a row's id is its path").toBe(project)
      expect(withPath.folders[0]?.path).toBe(project)
    })

    it("reads as the shortened path", () => {
      expect(withPath.folders[0]?.display).toBe(project.replace(homedir(), "~"))
    })

    it("becomes the current workspace", () => {
      expect(withPath.current).toBe(project)
    })
  })

  it("reads a folder under the home directory with a tilde", async () => {
    const twoRows = await store.add(inside)
    expect(twoRows.folders[1]?.display).toBe(`~${inside.slice(homedir().length)}`)
  })

  /* A path the hub cannot read is not a workspace, and storing it would be a lie. */
  it("refuses a folder that does not exist, and stores nothing", async () => {
    await expect(store.add(path.join(home, "nowhere-at-all"))).rejects.toThrow(/not a folder/)
    expect((await store.page()).folders).toHaveLength(2)
  })

  it("does not add a folder it already knows, and makes it current", async () => {
    const again = await store.add(project)
    expect(again.folders).toHaveLength(2)
    expect(again.current).toBe(project)
  })

  /* Selecting is a write, and it is what a reload reads back. */
  describe("selecting", () => {
    it("makes that folder current, and a store that reopens the home agrees", async () => {
      expect((await store.select(inside)).current).toBe(inside)
      expect((await createFsWorkspaceStore(home).page()).current).toBe(inside)
    })

    it("refuses an unknown workspace without changing anything", async () => {
      await expect(store.select("nowhere")).rejects.toThrow(/not a known workspace/)
      expect((await store.page()).current).toBe(inside)
    })
  })

  /* The system dialog reports a folder's name and nothing else, so a name is
     placed among the folders the hub knows; a name that fits nowhere is refused
     rather than guessed at. */
  describe("adding by name", () => {
    it("finds it beside one the hub knows", async () => {
      const sibling = path.join(home, "projects", "marketing-site-copy")
      await fs.mkdir(sibling, { recursive: true })
      const byName = await store.add("marketing-site-copy")
      expect(byName.folders.map((folder) => folder.path)).toContain(sibling)
    })

    it("refuses a name no folder answers for", async () => {
      await expect(store.add("a-folder-that-is-not-there")).rejects.toThrow(/no folder named/)
    })

    it("refuses a name that is a path", async () => {
      await expect(store.add("projects/marketing-site")).rejects.toThrow(/not a folder/)
    })

    /* The same name beside two known folders names nothing in particular, so the
       hub refuses rather than picking one of somebody else's projects. */
    it("refuses a name two folders answer for", async () => {
      await fs.mkdir(path.join(home, "west", "twin"), { recursive: true })
      await fs.mkdir(path.join(home, "east", "twin"), { recursive: true })
      await store.add(path.join(home, "west", "twin"))
      await store.add(path.join(home, "east", "twin"))
      await expect(store.add("twin")).rejects.toThrow(/more than one folder is named/)
    })
  })

  /* The agents this hub delivers to are remembered beside the folder. Several
     can be chosen at once, because each one is a directory of its own, and
     choosing one twice is not a second choice. */
  describe("the chosen agents", () => {
    let folderCount: number

    beforeAll(async () => {
      folderCount = (await store.page()).folders.length
    })

    it("start with none chosen", async () => {
      expect((await store.page()).agents).toEqual([])
    })

    it("records one, and keeps it when a second is chosen", async () => {
      expect((await store.setAgent("hub.target.claude-code", true)).agents).toEqual([
        "hub.target.claude-code",
      ])
      expect((await store.setAgent("hub.target.sample", true)).agents).toEqual([
        "hub.target.claude-code",
        "hub.target.sample",
      ])
    })

    it("does not record one that is already chosen", async () => {
      expect((await store.setAgent("hub.target.sample", true)).agents).toHaveLength(2)
    })

    it("survives a folder switch", async () => {
      expect((await store.select(inside)).agents).toEqual([
        "hub.target.claude-code",
        "hub.target.sample",
      ])
    })

    it("gives one up while keeping the rest, and ignores one never chosen", async () => {
      expect((await store.setAgent("hub.target.claude-code", false)).agents).toEqual([
        "hub.target.sample",
      ])
      expect((await store.setAgent("hub.target.codex", false)).agents).toHaveLength(1)
      expect((await store.setAgent("hub.target.sample", false)).agents).toHaveLength(0)
    })

    /* Two choices made at once both land: each is a read-modify-write of one
       document, so an unserialized store would let the later write undo the first. */
    it("lands both when two are chosen at once, leaving the folders alone", async () => {
      await Promise.all([
        store.setAgent("hub.target.alpha", true),
        store.setAgent("hub.target.beta", true),
      ])
      expect((await store.page()).agents).toEqual(["hub.target.alpha", "hub.target.beta"])
      expect((await store.page()).folders).toHaveLength(folderCount)
    })

    it("leaves none when both are given up, with every folder still there", async () => {
      await store.setAgent("hub.target.alpha", false)
      await store.setAgent("hub.target.beta", false)
      expect((await store.page()).agents).toHaveLength(0)
      expect((await store.page()).folders).toHaveLength(folderCount)
    })
  })
})

/* A hand-edited document is durable JSON, so its values are checked, not trusted. */
describe("a hand-edited document", () => {
  it("reads as empty when it is not an object, or is absent", () => {
    expect(readWorkspaceState("nope")).toEqual(EMPTY)
    expect(readWorkspaceState(null)).toEqual(EMPTY)
  })

  it("drops an agent that is not a name", () => {
    expect(readWorkspaceState({ folders: [], agents: [7] }).agents).toEqual([])
  })

  it("reads a document written before agents were multiple as its one choice", () => {
    expect(readWorkspaceState({ folders: [], agent: "hub.target.codex" }).agents).toEqual([
      "hub.target.codex",
    ])
  })

  it("counts a repeated name once", () => {
    expect(readWorkspaceState({ folders: [], agents: ["a", "a", ""] }).agents).toEqual(["a"])
  })

  it("keeps only the entries that name a folder", () => {
    const edited = readWorkspaceState({
      folders: [{ name: "skills" }, { name: "" }, { path: project }, 7, { name: "docs", path: "" }],
      current: "elsewhere",
    })
    expect(edited.folders).toEqual([{ name: "skills" }])
    expect(edited.current, "a current workspace that is not listed").toBeNull()
  })

  it("keeps a listed workspace current, and a duplicate id once", () => {
    expect(readWorkspaceState({ folders: [{ name: "skills" }], current: "skills" }).current).toBe(
      "skills"
    )
    expect(readWorkspaceState({ folders: [{ name: "skills" }, { name: "skills" }] }).folders).toHaveLength(1)
  })

  it("still reads a row written before the hub kept paths", () => {
    expect(readWorkspaceState({ folders: [{ name: "skills" }] }).folders[0]?.path).toBeUndefined()
  })
})

describe("an id and a name", () => {
  it("takes the id from the path when there is one, and from the name otherwise", () => {
    expect(folderId({ name: "x", path: project })).toBe(project)
    expect(folderId({ name: "x" })).toBe("x")
  })

  it("takes the name from the last segment", () => {
    expect(workspaceName(project)).toBe("marketing-site")
    expect(workspaceName("D:\\work\\hub")).toBe("hub")
    expect(workspaceName("D:\\work\\hub\\"), "a trailing separator is not a segment").toBe("hub")
  })
})

/* The host's own folder is a workspace without anyone picking it. */
describe("the host's own folder", () => {
  let hostHome: string
  let repo: string

  beforeAll(async () => {
    hostHome = await fs.mkdtemp(path.join(tmpdir(), "context-hub-host-"))
    repo = path.join(hostHome, "my-project")
    await fs.mkdir(path.join(repo, "sub"), { recursive: true })
  })

  afterAll(async () => {
    await fs.rm(hostHome, { recursive: true, force: true })
  })

  it("stands on its own with no repository above it, and belongs to the one it is inside", async () => {
    expect(await projectRoot(path.join(repo, "sub"))).toBe(path.join(repo, "sub"))
    await fs.mkdir(path.join(repo, ".git"), { recursive: true })
    expect(await projectRoot(path.join(repo, "sub"))).toBe(repo)
  })

  it("is adopted as the current workspace, carrying its own name and path", async () => {
    const adopted = await createFsWorkspaceStore(path.join(hostHome, "hub"), { folder: repo }).page()
    expect(adopted.folders).toHaveLength(1)
    expect(adopted.folders[0]?.name).toBe("my-project")
    expect(adopted.folders[0]?.path).toBe(repo)
    expect(adopted.current).toBe(repo)
    /* Adopting is written down, not repeated. */
    const again = await createFsWorkspaceStore(path.join(hostHome, "hub"), { folder: repo }).page()
    expect(again.folders).toEqual(adopted.folders)
  })

  /* A row from before the hub kept paths names the host's folder: it takes the path. */
  it("heals a name-only row into the host's folder, keeping its place", async () => {
    const legacyHome = path.join(hostHome, "legacy")
    await fs.mkdir(path.join(legacyHome, "state"), { recursive: true })
    await fs.writeFile(
      path.join(legacyHome, "state", "workspaces.json"),
      JSON.stringify({
        folders: [{ name: "my-project" }, { name: "elsewhere" }],
        current: "my-project",
      })
    )
    const healed = await createFsWorkspaceStore(legacyHome, { folder: repo }).page()
    expect(healed.folders, "the name-only row is replaced, not duplicated").toHaveLength(2)
    expect(healed.folders[0]?.name).toBe("my-project")
    expect(healed.folders[0]?.path).toBe(repo)
    expect(healed.current).toBe(repo)
    expect(healed.folders[1]?.name, "a row the host does not name is left alone").toBe("elsewhere")
    expect(healed.folders[1]?.path).toBeNull()
  })

  /* A row naming a folder beside one the hub knows takes that folder's path:
     workspaces are folders a person keeps side by side. */
  it("heals a name-only row into a neighbouring folder, once", async () => {
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
    expect(beside.folders[1]?.path, "the neighbour keeps its place as it takes a path").toBe(
      neighbour
    )
    expect(beside.current).toBe(neighbour)
    expect(beside.folders[2]?.name).toBe("nowhere")
    expect(beside.folders[2]?.path, "a name nothing answers for stays name-only").toBeNull()
    expect(beside.folders[0]?.path, "the host's own name still takes the host's folder").toBe(repo)
    const again = await createFsWorkspaceStore(besideHome, { folder: repo }).page()
    expect(again.folders, "healing is written down, not repeated").toEqual(beside.folders)
  })

  it("adopts nothing for a host with no folder of its own", async () => {
    const plain = await createFsWorkspaceStore(path.join(hostHome, "plain")).page()
    expect(plain.folders).toEqual([])
  })
})
