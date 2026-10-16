/**
 * Behaviour check for the prompt library. It runs the store against a temporary
 * hub home and asserts the file contract: the library is one JSON array, a write
 * keeps it in that shape, a row keeps fields this module does not know, and a
 * file that cannot be parsed is refused rather than rebuilt.
 *
 * The last one is the reason this file exists. With nothing beside the JSON to
 * rebuild from, "repair the library" would mean writing an empty one over
 * whatever a person wrote — so the check pins the refusal, not a recovery.
 *
 * Run from the package: `node scripts/check-prompt-store.ts`
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { createFsPromptStore, promptsFile } from "../src/host/prompts-fs.ts"

let failures = 0

function check(what: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`  ok   ${what}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${what}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`)
}

const home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-prompts-"))
const file = promptsFile(home)
console.log(`home: ${home}`)

const store = createFsPromptStore({ home })

/* An empty home lists nothing, and says where it looked. */
const empty = await store.list()
check("an empty library lists nothing", empty.total === 0, empty)
check("the page names the library file", empty.root.endsWith("prompts.json"), empty.root)
check("an empty read does not create the file", (await fs.stat(file).catch(() => null)) === null)

/* Create writes the array the file is meant to be. */
const created = await store.create({
  description: "Review a diff before committing",
  prompt: "Review the diff.\nReport what it changes.\n",
  tags: ["code quality", "code quality"],
})
check("create keys the row by its description", created.id === "review-a-diff-before-committing", created.id)
check("create keeps the description as written", created.description === "Review a diff before committing")
check("create de-duplicates its tags", created.tags.length === 1, created.tags)

const written = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>[]
check("the library is one array", Array.isArray(written) && written.length === 1, written)
check(
  "a row holds the person's fields in their own names",
  JSON.stringify(Object.keys(written[0] ?? {}).sort()) ===
    JSON.stringify(["assets", "description", "id", "prompt", "tags", "updatedAt"]),
  written[0]
)
/* The library stores what a person typed, trailing newline and all: settling
   the bytes a delivered file gets is the delivery's job, not the library's. */
check("the row keeps the prompt exactly as it was typed", written[0]?.prompt === "Review the diff.\nReport what it changes.\n", written[0]?.prompt)
/* The library is one file in a place of its own: no per-prompt file beside it,
   and nothing else in the hub's home either. */
check(
  "the library is the only file in its directory",
  (await fs.readdir(path.dirname(file))).join(" ") === "prompts.json",
  await fs.readdir(path.dirname(file))
)
check("nothing else was added to the hub home", (await fs.readdir(home)).join(" ") === "prompts", await fs.readdir(home))

/* The id is written down when the row is, so a description can be corrected
   later without the row becoming another one. */
const listed = await store.list()
check("list returns what was created", listed.total === 1, listed.total)
check("the row comes back with its id", listed.items[0]?.id === created.id, listed.items[0])
check("the id is written into the file", written[0]?.id === created.id, written[0]?.id)
/* A library written by hand before this module existed carries no id, and the
   one its description makes stands in for it as it is read. */
await fs.writeFile(file, JSON.stringify([{ description: "Hand written", prompt: "x" }]))
const derived = await createFsPromptStore({ home }).list()
check(
  "a row with no id answers to the name its description makes",
  derived.items[0]?.id === "hand-written",
  derived.items[0]
)
await fs.writeFile(
  file,
  JSON.stringify([{ description: "Hand written", prompt: "x", id: "kept" }])
)
check(
  "a row with an id answers to that one",
  (await createFsPromptStore({ home }).list()).items[0]?.id === "kept"
)
/* Back to the one created row, for the assertions that follow. */
await fs.writeFile(file, JSON.stringify([written[0]], null, 2))
check("the library is back to the one row", (await store.list()).total === 1)

/* Two descriptions whose file name would collide are one place to write. */
let refused: unknown = null
await store
  .create({ description: "review a diff before committing", prompt: "other" })
  .catch((error: unknown) => {
    refused = error
  })
check("a colliding description is refused", refused instanceof Error, refused)
check("being refused writes nothing", (await store.list()).total === 1)

/* A field this module does not know survives a write: the file is hand-editable. */
const hand = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>[]
hand[0] = { ...hand[0], author: "me", assets: ["assets/one.png"] }
await fs.writeFile(file, JSON.stringify(hand, null, 2))
await createFsPromptStore({ home })
  .create({ description: "Added by hand", prompt: "second" })
  .catch(() => undefined)
const afterAdd = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>[]
check("a field written by hand is still there", afterAdd[0]?.author === "me", afterAdd[0])
check("a media reference written by hand is still there", JSON.stringify(afterAdd[0]?.assets) === '["assets/one.png"]', afterAdd[0]?.assets)
check("the stored prompt's text is unchanged", afterAdd[0]?.prompt === "Review the diff.\nReport what it changes.\n", afterAdd[0]?.prompt)

/* Removal takes the one row out and leaves the other. A fresh store each time,
   since the file was written behind the first one's back above and its own copy
   of the library is stale by now — reading through it would check a memory
   rather than the file. */
await createFsPromptStore({ home }).remove("added-by-hand")
const kept = await createFsPromptStore({ home }).list()
check("remove takes the row out", kept.total === 1 && kept.items[0]?.id === created.id, kept.items.map((one) => one.id))
check("removing an unknown name is harmless", await createFsPromptStore({ home }).remove("never-existed").then(() => true).catch(() => false))
check("the library is unchanged by that", (await createFsPromptStore({ home }).list()).total === 1)

/* An edit replaces the text, stamps the row, and leaves everything else alone. */
const textOf = async (): Promise<Record<string, unknown>> =>
  (JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>[])[0] ?? {}
const before = await textOf()
check("the fixture's own field is on the row before the edit", before.author === "me", before)

/* The row is aged first, so the new stamp can only have come from the edit. */
const held = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>[]
held[0] = { ...held[0], updatedAt: "2000-01-01T00:00:00.000Z" }
await fs.writeFile(file, JSON.stringify(held, null, 2))
const edited = await createFsPromptStore({ home }).update(created.id, { prompt: "Look at #1.\n" })
const afterEdit = await textOf()
check("update replaces the text", afterEdit.prompt === "Look at #1.\n", afterEdit.prompt)
check("update returns the row it wrote", edited.prompt === "Look at #1.\n", edited)
check("update stamps the row", afterEdit.updatedAt !== "2000-01-01T00:00:00.000Z", afterEdit.updatedAt)
check("update keeps a field it does not know", afterEdit.author === "me", afterEdit)
check("update keeps the row's media", JSON.stringify(afterEdit.assets) === '["assets/one.png"]', afterEdit.assets)
check("update keys the row the same way", edited.id === created.id, edited.id)

let emptyEdit: unknown = null
await createFsPromptStore({ home })
  .update(created.id, { prompt: "   " })
  .catch((failure: unknown) => {
    emptyEdit = failure
  })
check("an empty edit is refused", emptyEdit instanceof Error, emptyEdit)
check("the refused edit wrote nothing", (await textOf()).prompt === "Look at #1.\n")

let unknownEdit: unknown = null
await createFsPromptStore({ home })
  .update("never-existed", { prompt: "nope" })
  .catch((failure: unknown) => {
    unknownEdit = failure
  })
check("editing a row that is not there is refused", unknownEdit instanceof Error, unknownEdit)
check("the refusal names the row", (unknownEdit as Error | null)?.message.includes("never-existed") === true, unknownEdit)

/* Correcting the description is a correction, not a second row: the row keeps
   the id it was written with, so nothing that already points at it moves. */
const renamed = await createFsPromptStore({ home }).update(created.id, {
  description: "Review a diff before pushing",
})
check("the description is the corrected one", renamed.description === "Review a diff before pushing", renamed)
check("the row keeps the id it was written with", renamed.id === created.id, renamed.id)
check(
  "and the file still holds that id",
  (await textOf()).id === created.id,
  (await textOf()).id
)
check(
  "the row is still reached by its old id",
  (await createFsPromptStore({ home }).list()).items[0]?.id === created.id
)
/* The name is freed, not hoarded: another row may take the description the
   first one has given up — under an id of its own, since the first row still
   answers to the one it was written with. */
const took = await createFsPromptStore({ home }).create({
  description: "Review a diff before committing",
  prompt: "another",
})
check("a description another row gave up can be taken", took.id !== created.id, [took.id, created.id])
check("and it answers to a name of its own", took.id === "review-a-diff-before-committing-2", took.id)
check("the row that gave the name up keeps its own", (await createFsPromptStore({ home }).list()).items[0]?.id === created.id)

/* But two rows may not deliver to one file. */
let takenName: unknown = null
await createFsPromptStore({ home })
  .update(created.id, { description: "Review a diff before committing" })
  .catch((failure: unknown) => {
    takenName = failure
  })
check("an edit may not take what another row delivers to", takenName instanceof Error, takenName)
check(
  "and the row it was refused for is unchanged",
  (await textOf()).description === "Review a diff before pushing",
  (await textOf()).description
)

/* An edit that says nothing changes nothing, rather than stamping the row. */
const aged = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>[]
aged[0] = { ...aged[0], updatedAt: "2000-01-01T00:00:00.000Z" }
await fs.writeFile(file, JSON.stringify(aged, null, 2))
await createFsPromptStore({ home }).update(created.id, {})
check(
  "an edit with nothing in it leaves the row's stamp alone",
  (await textOf()).updatedAt === "2000-01-01T00:00:00.000Z",
  (await textOf()).updatedAt
)

/* The description goes back, so the rest of this file reads one row: the row
   that took the freed name is dropped again. */
await createFsPromptStore({ home }).remove(took.id)
await createFsPromptStore({ home }).update(created.id, {
  description: "Review a diff before committing",
})
check(
  "the library is the row this file started with",
  (await createFsPromptStore({ home }).list()).total === 1,
  (await createFsPromptStore({ home }).list()).items.map((one) => one.id)
)

/* Media: an uploaded file lands in the hub's own directory and is recorded last. */
const shot = new File([new Uint8Array([1, 2, 3, 4])], "shot.png", { type: "image/png" })
const put = await createFsPromptStore({ home }).putAsset(created.id, shot)
check("the reference names the hub's asset directory", put.ref.startsWith("assets/"), put.ref)
check("the reference is read as a picture", put.kind === "image", put.kind)
check(
  "the file is really on disk",
  (await fs.stat(path.join(home, put.ref)).catch(() => null)) !== null,
  put.ref
)
const withMedia = await textOf()
check(
  "the reference is recorded last in the row",
  JSON.stringify(withMedia.assets) === JSON.stringify(["assets/one.png", put.ref]),
  withMedia.assets
)

/* Two prompts uploading the same bytes are two files: the asset directory is
   content-addressed, so a shared reference would make one row's delete the
   other row's loss. */
const second = await createFsPromptStore({ home }).create({
  description: "Another prompt",
  prompt: "second",
})
const other = await createFsPromptStore({ home }).putAsset(second.id, shot)
check("the same bytes under another prompt is another reference", other.ref !== put.ref, [put.ref, other.ref])
await createFsPromptStore({ home }).deleteAsset(created.id, put.ref)
check(
  "dropping one leaves the other's file alone",
  (await fs.stat(path.join(home, other.ref)).catch(() => null)) !== null,
  other.ref
)
check(
  "and leaves its row alone",
  (await createFsPromptStore({ home }).list()).items.some((one) => one.id === second.id)
)
check(
  "the dropped reference is no longer on the row",
  JSON.stringify((await textOf()).assets) === '["assets/one.png"]',
  (await textOf()).assets
)

/* A reference this row never held belongs to another row, and the directory is
   shared — dropping it here would delete a file this prompt never referenced. */
const stray = "assets/not-mine.png"
await fs.writeFile(path.join(home, stray), "x")
await createFsPromptStore({ home }).deleteAsset(created.id, stray)
check(
  "a reference the row does not hold is left where it is",
  (await fs.stat(path.join(home, stray)).catch(() => null)) !== null
)

/* A link is recorded as written, and re-adding it keeps one entry. */
const linked = await createFsPromptStore({ home }).addAssetSource(
  created.id,
  "https://example.test/diagram.png"
)
check("a link is recorded as it was pasted", linked.ref === "https://example.test/diagram.png", linked)
check("a link is read as a picture", linked.kind === "image", linked.kind)
check(
  "the link is on the row",
  (await textOf()).assets !== undefined &&
    ((await textOf()).assets as string[]).includes(linked.ref),
  (await textOf()).assets
)
check(
  "adding the same link twice records it once",
  (await createFsPromptStore({ home }).addAssetSource(created.id, linked.ref)).ref === linked.ref &&
    ((await textOf()).assets as string[]).filter((one) => one === linked.ref).length === 1,
  (await textOf()).assets
)

/* An edit never resurrects media: the row is read, changed, and written whole. */
await createFsPromptStore({ home }).update(created.id, { prompt: "Look at #1 again.\n" })
const afterSecondEdit = await textOf()
check(
  "an edit keeps the media recorded before it",
  JSON.stringify(afterSecondEdit.assets) ===
    JSON.stringify(["assets/one.png", linked.ref]),
  afterSecondEdit.assets
)

/* Media on a row that is not there is refused rather than invented. */
let unknownAsset: unknown = null
await createFsPromptStore({ home })
  .putAsset("never-existed", shot)
  .catch((failure: unknown) => {
    unknownAsset = failure
  })
check("uploading to a row that is not there is refused", unknownAsset instanceof Error, unknownAsset)

/* Deleting a prompt takes its pictures with it: they are uploaded under the
   row's own name, so nothing can reach them once the row that listed them is
   gone. The bytes are its own, so this is a file no other row names. */
const orphan = await createFsPromptStore({ home }).putAsset(
  second.id,
  new File([new Uint8Array([9, 9, 9])], "orphan.png", { type: "image/png" })
)
check(
  "the second row's own file is on disk before the delete",
  (await fs.stat(path.join(home, orphan.ref)).catch(() => null)) !== null,
  orphan.ref
)
check("and it is not the first row's file", orphan.ref !== other.ref, [orphan.ref, other.ref])
await createFsPromptStore({ home }).remove(second.id)
check(
  "deleting the row deletes the files it uploaded",
  (await Promise.all(
    [orphan.ref, other.ref].map((ref) => fs.stat(path.join(home, ref)).catch(() => null))
  )).every((found) => found === null),
  [orphan.ref, other.ref]
)

/* Concurrent creates all land: every change is a read-modify-write of one file. */
const racing = createFsPromptStore({ home })
await Promise.all([
  racing.create({ description: "Racing one", prompt: "one" }),
  racing.create({ description: "Racing two", prompt: "two" }),
  racing.create({ description: "Racing three", prompt: "three" }),
])
const raced = await createFsPromptStore({ home }).list()
check("three concurrent creates all land", raced.total === 4, raced.total)
check(
  "the tags come from the rows, sorted and unique",
  JSON.stringify(raced.tags) === JSON.stringify(["code quality"]),
  raced.tags
)

/* A file that cannot be parsed is refused, and left exactly as it was. */
const broken = "{ this is not json"
await fs.writeFile(file, broken)
let error: unknown = null
await createFsPromptStore({ home })
  .list()
  .catch((failure: unknown) => {
    error = failure
  })
check("an unparsable library is refused", error instanceof Error, error)
check("the refusal names the file", (error as Error | null)?.message.includes("prompts.json") === true, error)
check("the unreadable file was not written over", (await fs.readFile(file, "utf8")) === broken)

/* And a write is refused too, rather than replacing what it could not read. */
await createFsPromptStore({ home })
  .create({ description: "Nope", prompt: "nope" })
  .catch(() => undefined)
check("a write against an unparsable library leaves it alone", (await fs.readFile(file, "utf8")) === broken)

/* JSON that is not a list of rows says so rather than being read as one. */
await fs.writeFile(file, '{"description": "not an array"}')
let shapeError: unknown = null
await createFsPromptStore({ home })
  .list()
  .catch((failure: unknown) => {
    shapeError = failure
  })
check("an object instead of an array is refused", shapeError instanceof Error, shapeError)

/* A row missing its text is named, rather than shown as a prompt with none. */
await fs.writeFile(file, JSON.stringify([{ description: "No prompt" }]))
let rowError: unknown = null
await createFsPromptStore({ home })
  .list()
  .catch((failure: unknown) => {
    rowError = failure
  })
check("a row with no prompt is refused", rowError instanceof Error, rowError)

/* An empty file is an empty library, which is the one empty answer. */
await fs.writeFile(file, "")
check("an empty file reads as an empty library", (await createFsPromptStore({ home }).list()).total === 0)

console.log(failures === 0 ? "\nall checks passed" : `\n${failures} failed`)
process.exitCode = failures === 0 ? 0 : 1
