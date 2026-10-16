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
    JSON.stringify(["assets", "description", "prompt", "tags", "updatedAt"]),
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

/* The id is derived, never stored: a row read back carries one, the file does not. */
const listed = await store.list()
check("list returns what was created", listed.total === 1, listed.total)
check("the row comes back with its id", listed.items[0]?.id === created.id, listed.items[0])
check("the file holds no id", written[0]?.id === undefined, written[0]?.id)

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

/* Removal takes the one row out and leaves the other. */
await store.remove("added-by-hand")
const kept = await store.list()
check("remove takes the row out", kept.total === 1 && kept.items[0]?.id === created.id, kept.items.map((one) => one.id))
check("removing an unknown name is harmless", await store.remove("never-existed").then(() => true).catch(() => false))
check("the library is unchanged by that", (await store.list()).total === 1)

/* Concurrent creates all land: every change is a read-modify-write of one file. */
const racing = createFsPromptStore({ home })
await Promise.all([
  racing.create({ description: "Racing one", prompt: "one" }),
  racing.create({ description: "Racing two", prompt: "two" }),
  racing.create({ description: "Racing three", prompt: "three" }),
])
const raced = await createFsPromptStore({ home }).list()
check("three concurrent creates all land", raced.total === 5, raced.total)
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
