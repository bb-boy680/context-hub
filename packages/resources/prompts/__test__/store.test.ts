/**
 * Behaviour of the prompt library. It runs the store against a temporary hub
 * home and asserts the file contract: the library is one JSON array, a write
 * keeps it in that shape, a row keeps fields this module does not know, and a
 * file that cannot be parsed is refused rather than rebuilt.
 *
 * The last one is the reason this file exists. With nothing beside the JSON to
 * rebuild from, "repair the library" would mean writing an empty one over
 * whatever a person wrote — so these cases pin the refusal, not a recovery.
 *
 * Most cases open their own store over the same home, on purpose: the file is
 * written behind a long-lived store's back, so reading through one would check a
 * memory rather than the file.
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createFsPromptStore, promptsFile } from "../src/host/prompts-fs.ts"
import { slugOf } from "../src/slug.ts"

let home: string
let file: string
let store: ReturnType<typeof createFsPromptStore>
/** The row the first block creates, as it was written; a later block restores it. */
let createdRow: Record<string, unknown>

/** Read the library file as it is on disk right now, first row first. */
const textOf = async (): Promise<Record<string, unknown>> =>
  (JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>[])[0] ?? {}
const onDisk = async () => JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>[]

beforeAll(async () => {
  home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-prompts-"))
  file = promptsFile(home)
  store = createFsPromptStore({ home })
})

afterAll(async () => {
  await fs.rm(home, { recursive: true, force: true })
})

describe("an empty home", () => {
  it("lists nothing, names the library file, and does not create it", async () => {
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

  it("writes the library as one array holding the person's fields in their own names", async () => {
    const written = await onDisk()
    createdRow = written[0] ?? {}
    expect(Array.isArray(written)).toBe(true)
    expect(written).toHaveLength(1)
    expect(Object.keys(written[0] ?? {}).sort()).toEqual([
      "assets",
      "description",
      "id",
      "name",
      "prompt",
      "tags",
      "updatedAt",
    ])
  })

  /* The library stores what a person typed, trailing newline and all: settling
     the bytes a delivered file gets is the delivery's job, not the library's. */
  it("keeps the prompt exactly as it was typed", async () => {
    expect((await onDisk())[0]?.prompt).toBe("Review the diff.\nReport what it changes.\n")
  })

  /* The library is one file in a place of its own: no per-prompt file beside it,
     and nothing else in the hub's home either. */
  it("is the only file in its directory, and adds nothing else to the hub home", async () => {
    expect(await fs.readdir(path.dirname(file))).toEqual(["prompts.json"])
    expect(await fs.readdir(home)).toEqual(["prompts"])
  })

  it("comes back from a list with the id that was written into the file", async () => {
    const listed = await store.list()
    expect(listed.total).toBe(1)
    expect(listed.items[0]?.id).toBe(created.id)
    expect((await onDisk())[0]?.id).toBe(created.id)
  })
})

/* A library written by hand before the title existed carries neither a name nor
   an id: the description stands in as the title, so what a delivery names its
   file after comes out where it already was. */
describe("a row written by hand", () => {
  it("reads as one titled and addressed by its description when it has no name", async () => {
    await fs.writeFile(file, JSON.stringify([{ description: "Hand written", prompt: "x" }]))
    const derived = await createFsPromptStore({ home }).list()
    expect(derived.items[0]?.name).toBe("Hand written")
    expect(derived.items[0]?.id).toBe("hand-written")
  })

  it("answers to the id it carries when it has one", async () => {
    await fs.writeFile(
      file,
      JSON.stringify([{ name: "Kept", description: "Hand written", prompt: "x", id: "kept" }])
    )
    expect((await createFsPromptStore({ home }).list()).items[0]?.id).toBe("kept")
  })
})

/* Two names whose file name would collide are one place to write. */
describe("a name that collides", () => {
  /* Back to the one row the first block created. The long-lived store's own copy
     of the library was never disturbed, so it and the file agree again. */
  beforeAll(async () => {
    await fs.writeFile(file, JSON.stringify([createdRow], null, 2))
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
})

/* A field this module does not know survives a write: the file is hand-editable. */
describe("a field this module does not know", () => {
  let byHandId: string

  beforeAll(async () => {
    const hand = await onDisk()
    hand[0] = { ...hand[0], author: "me", assets: ["assets/one.png"] }
    await fs.writeFile(file, JSON.stringify(hand, null, 2))
    const byHand = await createFsPromptStore({ home }).create({
      name: "Added by hand",
      description: "Added by hand",
      prompt: "second",
    })
    byHandId = byHand.id
  })

  it("is still there after another row is written, with the media and the text", async () => {
    const afterAdd = await onDisk()
    expect(afterAdd[0]?.author).toBe("me")
    expect(afterAdd[0]?.assets).toEqual(["assets/one.png"])
    expect(afterAdd[0]?.prompt).toBe("Review the diff.\nReport what it changes.\n")
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
    const rows = await onDisk()
    rowId = String(rows[0]?.id)
    /* The row is aged first, so the new stamp can only have come from the edit. */
    rows[0] = { ...rows[0], updatedAt: "2000-01-01T00:00:00.000Z" }
    await fs.writeFile(file, JSON.stringify(rows, null, 2))
  })

  it("replaces the text, stamps the row, and keeps what it does not know", async () => {
    expect((await textOf()).author, "the fixture's own field before the edit").toBe("me")

    const edited = await createFsPromptStore({ home }).update(rowId, { prompt: "Look at #1.\n" })
    const afterEdit = await textOf()
    expect(afterEdit.prompt).toBe("Look at #1.\n")
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
    expect((await textOf()).prompt).toBe("Look at #1.\n")
  })

  it("refuses a row that is not there, naming it", async () => {
    await expect(
      createFsPromptStore({ home }).update("never-existed", { prompt: "nope" })
    ).rejects.toThrow(/never-existed/)
  })
})

/* Correcting the title is a correction, not a second row: the row keeps the id
   it was written with, so nothing that already points at it moves. */
describe("correcting the title", () => {
  let rowId: string

  beforeAll(async () => {
    rowId = String((await textOf()).id)
  })

  it("keeps the row's own id, in the file and in the list", async () => {
    const renamed = await createFsPromptStore({ home }).update(rowId, {
      name: "Review a diff before pushing",
    })
    expect(renamed.name).toBe("Review a diff before pushing")
    expect(renamed.id).toBe(rowId)
    expect((await textOf()).id).toBe(rowId)
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
    expect((await createFsPromptStore({ home }).list()).items[0]?.id).toBe(rowId)
  })

  /* But two rows may not deliver to one file. */
  it("refuses an edit that would take what another row delivers to", async () => {
    await expect(
      createFsPromptStore({ home }).update(rowId, { name: "Review a diff" })
    ).rejects.toThrow()
    expect((await textOf()).name).toBe("Review a diff before pushing")
  })

  /* An edit that says nothing changes nothing, rather than stamping the row. */
  it("leaves the stamp alone for an edit with nothing in it", async () => {
    const aged = await onDisk()
    aged[0] = { ...aged[0], updatedAt: "2000-01-01T00:00:00.000Z" }
    await fs.writeFile(file, JSON.stringify(aged, null, 2))
    await createFsPromptStore({ home }).update(rowId, {})
    expect((await textOf()).updatedAt).toBe("2000-01-01T00:00:00.000Z")
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
    rowId = String((await textOf()).id)
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

  it("records the reference last in the row", async () => {
    expect((await textOf()).assets).toEqual(["assets/one.png", put.ref])
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
    expect((await textOf()).assets).toEqual(["assets/one.png"])
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
    expect((await textOf()).assets as string[]).toContain(linked.ref)

    const again = await createFsPromptStore({ home }).addAssetSource(rowId, linked.ref)
    expect(again.ref).toBe(linked.ref)
    expect(((await textOf()).assets as string[]).filter((one) => one === linked.ref)).toHaveLength(1)
  })

  /* An edit never resurrects media: the row is read, changed, and written whole. */
  it("keeps the media recorded before an edit", async () => {
    await createFsPromptStore({ home }).update(rowId, { prompt: "Look at #1 again.\n" })
    const afterSecondEdit = await textOf()
    expect(afterSecondEdit.assets).toEqual(["assets/one.png", "https://example.test/diagram.png"])
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

/* Concurrent creates all land: every change is a read-modify-write of one file. */
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

/* A file that cannot be parsed is refused, and left exactly as it was. */
describe("a library that cannot be parsed", () => {
  const broken = "{ this is not json"

  it("is refused, naming the file, and is not written over", async () => {
    await fs.writeFile(file, broken)
    await expect(createFsPromptStore({ home }).list()).rejects.toThrow(/prompts\.json/)
    expect(await fs.readFile(file, "utf8")).toBe(broken)
  })

  /* And a write is refused too, rather than replacing what it could not read. */
  it("refuses a write against it, leaving it alone", async () => {
    await createFsPromptStore({ home })
      .create({ name: "Nope", description: "Nope", prompt: "nope" })
      .catch(() => undefined)
    expect(await fs.readFile(file, "utf8")).toBe(broken)
  })

  it("refuses JSON that is not a list of rows", async () => {
    await fs.writeFile(file, '{"description": "not an array"}')
    await expect(createFsPromptStore({ home }).list()).rejects.toThrow()
  })

  it("refuses a row missing its text, rather than showing a prompt with none", async () => {
    await fs.writeFile(file, JSON.stringify([{ description: "No prompt" }]))
    await expect(createFsPromptStore({ home }).list()).rejects.toThrow()
  })

  /* An empty file is an empty library, which is the one empty answer. */
  it("reads an empty file as an empty library", async () => {
    await fs.writeFile(file, "")
    expect((await createFsPromptStore({ home }).list()).total).toBe(0)
  })
})
