/**
 * Behaviour of the prompt library. It runs the store against a temporary hub
 * home and asserts the file contract: the index is one JSON array of metadata,
 * each row names its own markdown file, the text lives in that file, and a
 * library written before the split is migrated in place on the first read.
 *
 * Two refusals are the reason much of this file exists. A file that cannot be
 * read is refused rather than repaired — with the text in a separate file there
 * is nothing to rebuild from — and an index row that carries the text itself
 * after the migration is refused rather than guessed at, because picking one of
 * the two places would silently discard the other.
 *
 * Most cases open their own store over the same home, on purpose: the files are
 * written behind a long-lived store's back, so reading through one would check a
 * memory rather than the disk.
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"

import { createFsPromptStore, promptsDir, promptsFile } from "../src/host/prompts-fs.ts"
import { slugOf } from "../src/slug.ts"

let home: string
let dir: string
let file: string
let store: ReturnType<typeof createFsPromptStore>
/** The row the first block creates, as it was written; a later block restores it. */
let createdRow: Record<string, unknown>

/** The UTF-8 BOM some editors put first, kept out of the source as a raw byte. */
const BOM = String.fromCharCode(0xfeff)

/** The index as it is on disk right now, in the order it holds the rows. */
const indexOnDisk = async (at = home): Promise<Record<string, unknown>[]> =>
  JSON.parse(await fs.readFile(promptsFile(at), "utf8")) as Record<string, unknown>[]
/** One prompt's text as its own file holds it. */
const bodyOnDisk = (name: string, at = home): Promise<string> =>
  fs.readFile(path.join(promptsDir(at), name), "utf8")
/** Every file name in the library's directory, sorted. */
const namesOnDisk = (at = home): Promise<string[]> =>
  fs.readdir(promptsDir(at)).then((names) => names.sort())
/** The file one row names, as the index records it — the API does not expose it. */
const fileOf = async (id: string, at = home): Promise<string> =>
  String((await indexOnDisk(at)).find((row) => row.id === id)?.file)

beforeAll(async () => {
  home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-prompts-"))
  dir = promptsDir(home)
  file = promptsFile(home)
  store = createFsPromptStore({ home })
})

afterAll(async () => {
  await fs.rm(home, { recursive: true, force: true })
})

describe("an empty home", () => {
  it("lists nothing, names the index file, and does not create it", async () => {
    const empty = await store.list()
    expect(empty.total).toBe(0)
    expect(empty.root.endsWith("prompts.json")).toBe(true)
    expect(await fs.stat(file).catch(() => null)).toBeNull()
  })
})

describe("creating a row", () => {
  let created: Awaited<ReturnType<typeof store.create>>

  beforeAll(async () => {
    created = await store.create({
      name: "Review a diff",
      description: "Review a diff before committing",
      prompt: "Review the diff.\nReport what it changes.\n",
      tags: ["code quality", "code quality"],
    })
  })

  /* The id is opaque and generated, so nothing about the wording decides what
     the row is — which is what lets a name be corrected without making another. */
  it("gives the row an id of its own, keeping the wording as written", () => {
    expect(created.id.trim()).not.toBe("")
    expect(created.id).not.toBe(slugOf("Review a diff"))
    expect(created.name).toBe("Review a diff")
    expect(created.description).toBe("Review a diff before committing")
  })

  it("de-duplicates its tags", () => {
    expect(created.tags).toHaveLength(1)
  })

  /* The index holds what a page draws and the name of the file that holds the
     text; the text itself is not in it. */
  it("writes the index with the metadata and a file name, and no text", async () => {
    const written = await indexOnDisk()
    createdRow = written[0] ?? {}
    expect(Array.isArray(written)).toBe(true)
    expect(written).toHaveLength(1)
    expect(Object.keys(written[0] ?? {}).sort()).toEqual([
      "assets",
      "description",
      "file",
      "id",
      "name",
      "tags",
      "updatedAt",
    ])
    expect(written[0]?.file).toBe("review-a-diff.md")
  })

  /* The text file holds exactly what a person typed: settling the bytes a
     delivered file gets is the delivery's job, not the library's. */
  it("keeps the prompt exactly as it was typed, in its own markdown file", async () => {
    expect(await bodyOnDisk("review-a-diff.md")).toBe(
      "Review the diff.\nReport what it changes.\n"
    )
    expect((await store.list()).items[0]?.prompt).toBe(
      "Review the diff.\nReport what it changes.\n"
    )
  })

  /* The library is one index plus one file per prompt, and nothing else. */
  it("adds one index file and one text file and nothing more", async () => {
    expect(await namesOnDisk()).toEqual(["prompts.json", "review-a-diff.md"])
    expect(await fs.readdir(home)).toEqual(["prompts"])
  })

  it("comes back from a list with the id that was written into the index", async () => {
    const listed = await store.list()
    expect(listed.total).toBe(1)
    expect(listed.items[0]?.id).toBe(created.id)
    expect((await indexOnDisk())[0]?.id).toBe(created.id)
  })
})

/* A library written by hand before the fields existed carries neither a name
   nor an id: the description stands in as the title, so what a delivery names
   its file after comes out where it already was. */
describe("a row written by hand", () => {
  it("reads as one titled and addressed by its description when it has no name", async () => {
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      file,
      JSON.stringify([{ description: "Hand written", file: "hand.md" }])
    )
    await fs.writeFile(path.join(dir, "hand.md"), "x")
    const derived = await createFsPromptStore({ home }).list()
    expect(derived.items[0]?.name).toBe("Hand written")
    expect(derived.items[0]?.id).toBe("hand-written")
    expect(derived.items[0]?.prompt).toBe("x")
  })

  it("answers to the id it carries when it has one", async () => {
    await fs.writeFile(
      file,
      JSON.stringify([
        { name: "Kept", description: "Hand written", file: "hand.md", id: "kept" },
      ])
    )
    expect((await createFsPromptStore({ home }).list()).items[0]?.id).toBe("kept")
  })

  /* A file with a BOM is still that prompt's text: editors on Windows add one. */
  it("does not read an editor's BOM as part of the prompt", async () => {
    await fs.writeFile(path.join(dir, "hand.md"), `${BOM}Body`)
    expect((await createFsPromptStore({ home }).list()).items[0]?.prompt).toBe("Body")
  })
})

/* Two names whose file name would collide are one place to write. */
describe("a name that collides", () => {
  /* Back to the one row the first block created. The long-lived store's own copy
     of the library was never disturbed, so it and the disk agree again. */
  beforeAll(async () => {
    await fs.writeFile(file, JSON.stringify([createdRow], null, 2))
    await fs.writeFile(path.join(dir, "review-a-diff.md"), "Review the diff.\nReport what it changes.\n")
    await fs.rm(path.join(dir, "hand.md"))
  })

  it("is refused, with the library still the one row", async () => {
    await expect(
      store.create({ name: "review a diff", description: "Something else", prompt: "other" })
    ).rejects.toThrow()
    expect((await store.list()).total).toBe(1)
  })

  /* The description is not what a collision is about: two rows may describe
     themselves the same way, as long as they reach two different files. */
  it("does not collide with a row that merely describes itself the same way", async () => {
    const alike = await store.create({
      name: "Another title",
      description: "Review a diff before committing",
      prompt: "third",
    })
    expect(alike.description).toBe(createdRow.description)
    expect((await store.list()).total).toBe(2)
    await store.remove(alike.id)
  })

  /* A text file nobody's row names belongs to a person, so a new row whose name
     would reach it is refused rather than allowed to overwrite it. */
  it("is refused when a text file of that name is already on disk", async () => {
    await fs.writeFile(path.join(dir, "loose-end.md"), "someone's own")
    expect((await store.list()).total).toBe(1)
    await expect(
      store.create({ name: "Loose end", description: "Not mine", prompt: "mine" })
    ).rejects.toThrow()
    expect(await bodyOnDisk("loose-end.md")).toBe("someone's own")
    await fs.rm(path.join(dir, "loose-end.md"))
  })
})

/* A field this module does not know survives a write: the index is hand-editable. */
describe("a field this module does not know", () => {
  let byHandId: string

  beforeAll(async () => {
    const hand = await indexOnDisk()
    hand[0] = { ...hand[0], author: "me", assets: ["assets/one.png"] }
    await fs.writeFile(file, JSON.stringify(hand, null, 2))
    const byHand = await createFsPromptStore({ home }).create({
      name: "Added by hand",
      description: "Added by hand",
      prompt: "second",
    })
    byHandId = byHand.id
  })

  it("is still there after another row is written, with the media and the file", async () => {
    const afterAdd = await indexOnDisk()
    expect(afterAdd[0]?.author).toBe("me")
    expect(afterAdd[0]?.assets).toEqual(["assets/one.png"])
    expect(afterAdd[0]?.file).toBe("review-a-diff.md")
    expect("prompt" in (afterAdd[0] ?? {})).toBe(false)
  })

  /* Removal takes the one row out and leaves the other. */
  it("is unaffected by removing the row that was added after it", async () => {
    await createFsPromptStore({ home }).remove(byHandId)
    const kept = await createFsPromptStore({ home }).list()
    expect(kept.total).toBe(1)
    expect(kept.items.map((one) => one.id)).toHaveLength(1)
  })

  it("makes removing an unknown name harmless", async () => {
    const harmless = await createFsPromptStore({ home })
      .remove("never-existed")
      .then(() => true, () => false)
    expect(harmless).toBe(true)
    expect((await createFsPromptStore({ home }).list()).total).toBe(1)
  })
})

/* An edit replaces the text, stamps the row, and leaves everything else alone. */
describe("an edit", () => {
  let rowId: string

  beforeAll(async () => {
    const rows = await indexOnDisk()
    rowId = String(rows[0]?.id)
    /* The row is aged first, so the new stamp can only have come from the edit. */
    rows[0] = { ...rows[0], updatedAt: "2000-01-01T00:00:00.000Z" }
    await fs.writeFile(file, JSON.stringify(rows, null, 2))
  })

  it("replaces the text file, stamps the row, and keeps what it does not know", async () => {
    expect((await indexOnDisk())[0]?.author, "the fixture's own field before the edit").toBe("me")

    const edited = await createFsPromptStore({ home }).update(rowId, { prompt: "Look at #1.\n" })
    const afterEdit = (await indexOnDisk())[0] ?? {}
    expect(afterEdit.prompt).toBeUndefined()
    expect(await bodyOnDisk("review-a-diff.md")).toBe("Look at #1.\n")
    expect(edited.prompt).toBe("Look at #1.\n")
    expect(afterEdit.updatedAt).not.toBe("2000-01-01T00:00:00.000Z")
    expect(afterEdit.author).toBe("me")
    expect(afterEdit.assets).toEqual(["assets/one.png"])
    expect(edited.id).toBe(rowId)
  })

  it("refuses an empty edit, and writes nothing", async () => {
    await expect(
      createFsPromptStore({ home }).update(rowId, { prompt: "   " })
    ).rejects.toThrow()
    expect(await bodyOnDisk("review-a-diff.md")).toBe("Look at #1.\n")
  })

  it("refuses a row that is not there, naming it", async () => {
    await expect(
      createFsPromptStore({ home }).update("never-existed", { prompt: "nope" })
    ).rejects.toThrow(/never-existed/)
  })
})

/* Correcting the title is a correction, not a second row: the row keeps the id
   it was written with, so nothing that already points at it moves — but the
   file holding its text moves with the title. */
describe("correcting the title", () => {
  let rowId: string
  const before = "Look at #1.\n"

  beforeAll(async () => {
    rowId = String((await indexOnDisk())[0]?.id)
  })

  it("keeps the row's own id and moves its text to the new file name", async () => {
    const renamed = await createFsPromptStore({ home }).update(rowId, {
      name: "Review a diff before pushing",
    })
    expect(renamed.name).toBe("Review a diff before pushing")
    expect(renamed.id).toBe(rowId)
    expect((await indexOnDisk())[0]?.id).toBe(rowId)
    expect((await indexOnDisk())[0]?.file).toBe("review-a-diff-before-pushing.md")
    expect(await bodyOnDisk("review-a-diff-before-pushing.md")).toBe(before)
    expect(await fs.stat(path.join(dir, "review-a-diff.md")).catch(() => null)).toBeNull()
    expect((await createFsPromptStore({ home }).list()).items[0]?.id).toBe(rowId)
  })

  /* The title it gave up is free again: another row may take it, and answers to
     an id of its own because ids are generated rather than made out of names. */
  it("frees the old title for another row, which gets an id of its own", async () => {
    const took = await createFsPromptStore({ home }).create({
      name: "Review a diff",
      description: "Review a diff before committing",
      prompt: "another",
    })
    expect(took.id).not.toBe(rowId)
    expect((await indexOnDisk())[0]?.id).toBe(rowId)
  })

  /* But two rows may not deliver to one file. */
  it("refuses an edit that would take what another row delivers to", async () => {
    await expect(
      createFsPromptStore({ home }).update(rowId, { name: "Review a diff" })
    ).rejects.toThrow()
    expect((await indexOnDisk())[0]?.name).toBe("Review a diff before pushing")
  })

  /* An edit that says nothing changes nothing, rather than stamping the row. */
  it("leaves the stamp alone for an edit with nothing in it", async () => {
    const aged = await indexOnDisk()
    aged[0] = { ...aged[0], updatedAt: "2000-01-01T00:00:00.000Z" }
    await fs.writeFile(file, JSON.stringify(aged, null, 2))
    await createFsPromptStore({ home }).update(rowId, {})
    expect((await indexOnDisk())[0]?.updatedAt).toBe("2000-01-01T00:00:00.000Z")
  })

  /* The name goes back to what it was, so the rest of this file reads one row:
     the row that took the freed name is dropped again. */
  it("can be undone, leaving the library the row it started with", async () => {
    const rows = await createFsPromptStore({ home }).list()
    const taker = rows.items.find((one) => one.id !== rowId)
    await createFsPromptStore({ home }).remove(taker?.id ?? "")
    await createFsPromptStore({ home }).update(rowId, { name: "Review a diff" })
    const after = await createFsPromptStore({ home }).list()
    expect(after.total).toBe(1)
    expect(after.items.map((one) => one.id)).toEqual([rowId])
    expect((await indexOnDisk())[0]?.file).toBe("review-a-diff.md")
  })
})

/* Media: an uploaded file lands in the hub's own directory and is recorded last. */
describe("media", () => {
  let rowId: string
  let put: { ref: string; kind: string }
  let secondId: string
  let other: { ref: string }
  const shot = () => new File([new Uint8Array([1, 2, 3, 4])], "shot.png", { type: "image/png" })

  beforeAll(async () => {
    rowId = String((await indexOnDisk())[0]?.id)
    put = await createFsPromptStore({ home }).putAsset(rowId, shot())
    secondId = (
      await createFsPromptStore({ home }).create({
        name: "Another prompt",
        description: "Another prompt",
        prompt: "second",
      })
    ).id
    other = await createFsPromptStore({ home }).putAsset(secondId, shot())
  })

  it("records an upload under the hub's asset directory, as a picture on disk", async () => {
    expect(put.ref.startsWith("assets/")).toBe(true)
    expect(put.kind).toBe("image")
    expect(await fs.stat(path.join(home, put.ref)).catch(() => null)).not.toBeNull()
  })

  it("records the reference last in the row, leaving the text file alone", async () => {
    expect((await indexOnDisk())[0]?.assets).toEqual(["assets/one.png", put.ref])
    expect(await bodyOnDisk("review-a-diff.md")).toBe("Look at #1.\n")
  })

  /* Two prompts uploading the same bytes are two files: the asset directory is
     content-addressed, so a shared reference would make one row's delete the
     other row's loss. */
  it("gives the same bytes under another prompt another reference", () => {
    expect(other.ref).not.toBe(put.ref)
  })

  it("drops one reference without touching the other row's file or row", async () => {
    await createFsPromptStore({ home }).deleteAsset(rowId, put.ref)
    expect(await fs.stat(path.join(home, other.ref)).catch(() => null)).not.toBeNull()
    expect(
      (await createFsPromptStore({ home }).list()).items.some((one) => one.id === secondId)
    ).toBe(true)
    expect((await indexOnDisk())[0]?.assets).toEqual(["assets/one.png"])
  })

  /* A reference this row never held belongs to another row, and the directory is
     shared — dropping it here would delete a file this prompt never referenced. */
  it("leaves a reference the row does not hold where it is", async () => {
    await fs.writeFile(path.join(home, "assets/not-mine.png"), "x")
    await createFsPromptStore({ home }).deleteAsset(rowId, "assets/not-mine.png")
    expect(await fs.stat(path.join(home, "assets/not-mine.png")).catch(() => null)).not.toBeNull()
  })

  it("records a link as pasted, and re-adding it keeps one entry", async () => {
    const linked = await createFsPromptStore({ home }).addAssetSource(
      rowId,
      "https://example.test/diagram.png"
    )
    expect(linked.ref).toBe("https://example.test/diagram.png")
    expect(linked.kind).toBe("image")
    expect(((await indexOnDisk())[0]?.assets as string[]) ?? []).toContain(linked.ref)

    const again = await createFsPromptStore({ home }).addAssetSource(rowId, linked.ref)
    expect(again.ref).toBe(linked.ref)
    expect(
      (((await indexOnDisk())[0]?.assets as string[]) ?? []).filter((one) => one === linked.ref)
    ).toHaveLength(1)
  })

  /* An edit never resurrects media or forgets it: the row is read, changed, and
     written whole. */
  it("keeps the media recorded before an edit", async () => {
    await createFsPromptStore({ home }).update(rowId, { prompt: "Look at #1 again.\n" })
    expect((await indexOnDisk())[0]?.assets).toEqual([
      "assets/one.png",
      "https://example.test/diagram.png",
    ])
    expect(await bodyOnDisk("review-a-diff.md")).toBe("Look at #1 again.\n")
  })

  it("refuses media on a row that is not there rather than inventing one", async () => {
    await expect(createFsPromptStore({ home }).putAsset("never-existed", shot())).rejects.toThrow()
  })

  /* Deleting a prompt takes its pictures with it: they are uploaded under the
     row's own name, so nothing can reach them once the row that listed them is
     gone. The bytes are its own, so this is a file no other row names. */
  it("deletes the files a row uploaded when the row goes", async () => {
    const orphan = await createFsPromptStore({ home }).putAsset(
      secondId,
      new File([new Uint8Array([9, 9, 9])], "orphan.png", { type: "image/png" })
    )
    expect(await fs.stat(path.join(home, orphan.ref)).catch(() => null)).not.toBeNull()
    expect(orphan.ref).not.toBe(other.ref)

    await createFsPromptStore({ home }).remove(secondId)
    const found = await Promise.all(
      [orphan.ref, other.ref].map((ref) => fs.stat(path.join(home, ref)).catch(() => null))
    )
    expect(found).toEqual([null, null])
  })
})

/* Concurrent creates all land, and the index's order is the order they were
   written in. */
describe("concurrent creates", () => {
  it("all land, with tags gathered from the rows", async () => {
    const racing = createFsPromptStore({ home })
    await Promise.all([
      racing.create({ name: "Racing one", description: "Racing one", prompt: "one" }),
      racing.create({ name: "Racing two", description: "Racing two", prompt: "two" }),
      racing.create({ name: "Racing three", description: "Racing three", prompt: "three" }),
    ])
    const raced = await createFsPromptStore({ home }).list()
    expect(raced.total).toBe(4)
    expect(raced.tags).toEqual(["code quality"])
  })
})

/* An index or a text file that cannot be read is refused, and left as it is. */
describe("a library that cannot be read", () => {
  let row: Record<string, unknown>

  beforeAll(async () => {
    row = { ...((await indexOnDisk())[0] ?? {}) }
  })

  /** Put the index back to the one row this suite works with. */
  const restore = async (one: Record<string, unknown> = row) => {
    await fs.writeFile(file, JSON.stringify([one], null, 2))
  }

  it("is refused when the index is not JSON, naming the file, and is not written over", async () => {
    const broken = "{ this is not json"
    await fs.writeFile(file, broken)
    await expect(createFsPromptStore({ home }).list()).rejects.toThrow(/prompts\.json/)
    expect(await fs.readFile(file, "utf8")).toBe(broken)
  })

  /* And a write is refused too, rather than replacing what it could not read. */
  it("refuses a write against it, leaving it alone", async () => {
    const broken = "{ this is not json"
    await fs.writeFile(file, broken)
    await createFsPromptStore({ home })
      .create({ name: "Nope", description: "Nope", prompt: "nope" })
      .catch(() => undefined)
    expect(await fs.readFile(file, "utf8")).toBe(broken)
    await restore()
  })

  it("refuses JSON that is not a list of rows", async () => {
    await fs.writeFile(file, '{"description": "not an array"}')
    await expect(createFsPromptStore({ home }).list()).rejects.toThrow()
    await restore()
  })

  it("refuses a row pointing at a text file that is not there", async () => {
    await restore({ ...row, file: "missing.md" })
    await expect(createFsPromptStore({ home }).list()).rejects.toThrow(/missing\.md/)
    await restore()
  })

  it("refuses a row whose text file is empty, rather than showing a prompt with none", async () => {
    await restore({ ...row, file: "empty.md" })
    await fs.writeFile(path.join(dir, "empty.md"), "  \n")
    await expect(createFsPromptStore({ home }).list()).rejects.toThrow(/empty\.md/)
    await fs.rm(path.join(dir, "empty.md"))
    await restore()
  })

  it("refuses a row that still carries its text beside a file, rather than choosing one", async () => {
    await restore({ ...row, prompt: "also here" })
    await expect(createFsPromptStore({ home }).list()).rejects.toThrow(/both/)
    await restore()
  })

  it("refuses a file name that would climb out of the library", async () => {
    await restore({ ...row, file: "../elsewhere.md" })
    await expect(createFsPromptStore({ home }).list()).rejects.toThrow(/entry 0/)
    await restore()
  })

  it("refuses two rows naming one text file", async () => {
    await restore({ ...row, id: "one" })
    const second = { ...row, id: "two" }
    await fs.writeFile(file, JSON.stringify([row, second], null, 2))
    await expect(createFsPromptStore({ home }).list()).rejects.toThrow(/entries 0 and 1/)
    await restore()
  })

  /* An empty index file is an empty library, which is the one empty answer. */
  it("reads an empty index as an empty library", async () => {
    await fs.writeFile(file, "")
    expect((await createFsPromptStore({ home }).list()).total).toBe(0)
    await restore()
  })
})

/* A library written before the split keeps its rows, its order, and its text:
   the first read moves each text into its own file and rewrites the index. */
describe("migrating a library written before the split", () => {
  const legacyHome = async (rows: unknown[]): Promise<string> => {
    const at = await fs.mkdtemp(path.join(tmpdir(), "context-hub-prompts-legacy-"))
    await fs.mkdir(promptsDir(at), { recursive: true })
    await fs.writeFile(promptsFile(at), JSON.stringify(rows, null, 2))
    return at
  }
  const scratch: string[] = []
  const made = async (rows: unknown[]): Promise<string> => {
    const at = await legacyHome(rows)
    scratch.push(at)
    return at
  }
  const legacy = (over: Record<string, unknown> = {}) => ({
    id: "a724c0b4-a287-46e6-9ec5-c2129fc84bea",
    name: "create-plan",
    description: "执行任何任务前，先创建一个详细的实施计划。",
    prompt: "## 流程\n\n1. **先了解上下文，不靠猜。**\n",
    tags: ["planning"],
    updatedAt: "2026-10-17T08:18:16.076Z",
    assets: [],
    ...over,
  })

  afterEach(async () => {
    while (scratch.length > 0) {
      await fs.rm(scratch.pop() as string, { recursive: true, force: true })
    }
  })

  it("writes each text to its own file, then takes it out of the index", async () => {
    const at = await made([
      legacy(),
      legacy({ id: "second", name: "Ship it", description: "Ship it", prompt: "## Ship\n", tags: [], author: "me" }),
    ])
    const page = await createFsPromptStore({ home: at }).list()
    expect(page.total).toBe(2)
    expect(page.items.map((one) => one.prompt)).toEqual([
      "## 流程\n\n1. **先了解上下文，不靠猜。**\n",
      "## Ship\n",
    ])

    const index = await indexOnDisk(at)
    expect(index[0]).toMatchObject({
      id: "a724c0b4-a287-46e6-9ec5-c2129fc84bea",
      name: "create-plan",
      file: "create-plan.md",
      description: "执行任何任务前，先创建一个详细的实施计划。",
      tags: ["planning"],
      assets: [],
    })
    expect("prompt" in (index[0] ?? {})).toBe(false)
    expect(index[1]?.file).toBe("ship-it.md")
    expect(index[1]?.author).toBe("me")
    expect(await bodyOnDisk("create-plan.md", at)).toBe(
      "## 流程\n\n1. **先了解上下文，不靠猜。**\n"
    )
    expect(await bodyOnDisk("ship-it.md", at)).toBe("## Ship\n")
    expect((await namesOnDisk(at)).filter((name) => name.endsWith(".bak"))).toEqual([])
  })

  /* The text lands before the index, so a retry finds its own work and finishes
     rather than refusing the file it wrote last time. */
  it("keeps a text file already holding the same bytes, and finishes", async () => {
    const at = await made([legacy()])
    await fs.writeFile(path.join(promptsDir(at), "create-plan.md"), "## 流程\n\n1. **先了解上下文，不靠猜。**\n")
    expect((await createFsPromptStore({ home: at }).list()).total).toBe(1)
    expect("prompt" in ((await indexOnDisk(at))[0] ?? {})).toBe(false)
  })

  it("stops when the text file it would write belongs to someone else", async () => {
    const at = await made([legacy()])
    const before = await fs.readFile(promptsFile(at), "utf8")
    await fs.writeFile(path.join(promptsDir(at), "create-plan.md"), "someone else's")
    await expect(createFsPromptStore({ home: at }).list()).rejects.toThrow(/create-plan\.md/)
    expect(await fs.readFile(promptsFile(at), "utf8")).toBe(before)
  })

  it("stops before writing anything when two rows would share a file name", async () => {
    const at = await made([legacy(), legacy({ id: "second" })])
    const before = await fs.readFile(promptsFile(at), "utf8")
    await expect(createFsPromptStore({ home: at }).list()).rejects.toThrow(/entries 0 and 1/)
    expect(await fs.readFile(promptsFile(at), "utf8")).toBe(before)
    expect(await namesOnDisk(at)).toEqual(["prompts.json"])
  })

  it("stops when a text file cannot be written, leaving the index as it was", async () => {
    const at = await made([legacy()])
    const before = await fs.readFile(promptsFile(at), "utf8")
    /* A directory where the file should go cannot be replaced by a file write. */
    await fs.mkdir(path.join(promptsDir(at), "create-plan.md"), { recursive: true })
    await expect(createFsPromptStore({ home: at }).list()).rejects.toThrow()
    expect(await fs.readFile(promptsFile(at), "utf8")).toBe(before)
  })

  it("stops on a row with no text, rather than migrating the rest", async () => {
    const at = await made([legacy({ prompt: "" }), legacy({ id: "second", name: "Ship it" })])
    await expect(createFsPromptStore({ home: at }).list()).rejects.toThrow(/prompt/)
    expect(await namesOnDisk(at)).toEqual(["prompts.json"])
  })

  it("leaves an empty index alone", async () => {
    const at = await fs.mkdtemp(path.join(tmpdir(), "context-hub-prompts-legacy-"))
    scratch.push(at)
    await fs.mkdir(promptsDir(at), { recursive: true })
    await fs.writeFile(promptsFile(at), "")
    expect((await createFsPromptStore({ home: at }).list()).total).toBe(0)
    expect(await namesOnDisk(at)).toEqual(["prompts.json"])
  })

  /* A migrated row keeps the text exactly, including bytes a JSON string made
     awkward and a BOM nobody meant to keep. */
  it("keeps a text with CRLF and a BOM, minus the BOM", async () => {
    const at = await made([legacy({ prompt: `${BOM}line one\r\nline two\n` })])
    const page = await createFsPromptStore({ home: at }).list()
    expect(page.items[0]?.prompt).toBe("line one\r\nline two\n")
  })
})

/* The index's array is the order a page draws: a new row goes last, and a
   rename moves nothing. */
describe("the index's order", () => {
  let at: string
  const scratch: string[] = []

  const fresh = async (): Promise<string> => {
    const made = await fs.mkdtemp(path.join(tmpdir(), "context-hub-prompts-order-"))
    scratch.push(made)
    return made
  }

  it("appends a new row after the ones already there", async () => {
    at = await fresh()
    const store = createFsPromptStore({ home: at })
    await store.create({ name: "Zeta", description: "first made", prompt: "z" })
    await store.create({ name: "Alpha", description: "second made", prompt: "a" })
    expect((await store.list()).items.map((one) => one.name)).toEqual(["Zeta", "Alpha"])
    expect((await indexOnDisk(at)).map((row) => row.name)).toEqual(["Zeta", "Alpha"])
  })

  it("keeps a renamed row where it was", async () => {
    const store = createFsPromptStore({ home: at })
    const first = (await store.list()).items[0]
    await store.update(first?.id ?? "", { name: "Omega" })
    expect((await store.list()).items.map((one) => one.name)).toEqual(["Omega", "Alpha"])
  })

  afterAll(async () => {
    while (scratch.length > 0) {
      await fs.rm(scratch.pop() as string, { recursive: true, force: true })
    }
  })
})

/* Names and text reach the index as JSON strings and the text file as bytes;
   neither may lose a character that a person typed. */
describe("text the index has to escape", () => {
  let at: string

  beforeAll(async () => {
    at = await fs.mkdtemp(path.join(tmpdir(), "context-hub-prompts-escape-"))
  })

  afterAll(async () => {
    await fs.rm(at, { recursive: true, force: true })
  })

  it("round-trips quotes, slashes, colons and Chinese punctuation", async () => {
    const draft = {
      name: 'Review: "diff" & #hash — 中文，标点',
      description: "Check: a/b \\\\ c\nsecond line?",
      prompt: "---\n# not frontmatter\n* list\n\n literal\n",
      tags: ["a, b", "c: d", "中文，标签"],
    }
    const made = await createFsPromptStore({ home: at }).create(draft)
    const read = (await createFsPromptStore({ home: at }).list()).items[0]
    expect(read).toMatchObject({
      id: made.id,
      name: draft.name,
      description: draft.description,
      prompt: draft.prompt,
      tags: draft.tags,
    })
    expect(await bodyOnDisk(await fileOf(made.id, at), at)).toBe(draft.prompt)
  })

  it("keeps the text untouched when only the title changes", async () => {
    const store = createFsPromptStore({ home: at })
    const before = (await store.list()).items[0]
    const renamed = await store.update(before?.id ?? "", { name: "Second title" })
    expect(renamed.prompt).toBe(before?.prompt)
    expect(renamed.tags).toEqual(before?.tags)
    expect(await bodyOnDisk(await fileOf(renamed.id, at), at)).toBe(before?.prompt)
  })
})

/* A create and a rename issued together are two read-modify-writes of one
   index, so one of them must not undo the other. */
describe("concurrent changes", () => {
  let at: string

  beforeAll(async () => {
    at = await fs.mkdtemp(path.join(tmpdir(), "context-hub-prompts-race-"))
  })

  afterAll(async () => {
    await fs.rm(at, { recursive: true, force: true })
  })

  it("lands three creates and a rename, with no row or file lost", async () => {
    const store = createFsPromptStore({ home: at })
    const first = await store.create({ name: "First", description: "First", prompt: "one" })
    await Promise.all([
      store.create({ name: "Second", description: "Second", prompt: "two" }),
      store.create({ name: "Third", description: "Third", prompt: "three" }),
      store.create({ name: "Fourth", description: "Fourth", prompt: "four" }),
      store.update(first.id, { name: "First renamed" }),
    ])
    const page = await createFsPromptStore({ home: at }).list()
    expect(page.items.map((one) => one.name).sort()).toEqual([
      "First renamed",
      "Fourth",
      "Second",
      "Third",
    ])
    const bodies = await Promise.all(
      page.items.map((one) => fileOf(one.id, at).then((name) => bodyOnDisk(name, at)).catch(() => null))
    )
    expect(bodies).not.toContain(null)
    expect((await namesOnDisk(at)).filter((one) => one.endsWith(".md"))).toHaveLength(4)
  })
})
