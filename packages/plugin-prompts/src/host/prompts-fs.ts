/**
 * The prompt library: one JSON file under the hub's own directory, holding
 * every prompt in it.
 *
 * One file rather than one file per prompt, because a prompt is a short piece
 * of text and nothing else. There is no directory to list, no portable document
 * to open on its own, and no second place a row could disagree with — a read is
 * the whole library, which is also what a page draws.
 *
 * Two consequences are handled here rather than hidden:
 *
 * - A file that cannot be parsed is **refused**, never rebuilt. With nothing
 *   beside it to rebuild from, an unreadable file means an unreadable library,
 *   and writing an empty one over it would destroy what a person wrote. The
 *   read throws, the page says so, and the file is left as it is.
 * - A row keeps every field it arrived with. The file is hand-editable — it was
 *   written by hand before this module existed — so a field this module does not
 *   know is carried through a write rather than dropped.
 */
import { promises as fs } from "node:fs"

import { writeFileAtomic } from "@workspace/core/host/atomic"
import { displayPath, resolveHubHome } from "@workspace/core/host/home"

import { slugOf } from "../slug.ts"
import type { Prompt, PromptDraft, PromptPage, PromptStore, StoredPrompt } from "../store.ts"

/** The library's own file name, inside the prompts directory of the hub's home. */
const LIBRARY_FILE = "prompts.json"

/** The directory the library sits in, which is what the name is a directory of. */
const LIBRARY_DIR = "prompts"

/** One row as the file holds it: the shape above, plus whatever else was there. */
type Row = Prompt & Record<string, unknown>

/** Where the library lives. */
export interface PromptStoreOptions {
  /** Hub home; the library is `prompts/prompts.json` inside it. */
  home?: string
}

/**
 * The library file for one hub home.
 *
 * It sits in a directory of its own rather than directly in the hub's home: the
 * home holds one file per concern (`mcp/mcp.json`, `state/`, `skills/`), and a
 * bare `prompts.json` beside those would be the only concern without a place of
 * its own to grow into.
 */
export function promptsFile(home?: string): string {
  return `${resolveHubHome(home)}/${LIBRARY_DIR}/${LIBRARY_FILE}`
}

/** Text a prompt field must be, refused when it is missing or empty. */
function textOf(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`a prompt needs its ${what}`)
  }
  return value
}

/** A list of strings, or none: anything else in the file is not one. */
function stringsOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

/**
 * One row out of the file, checked as it is read.
 *
 * A file a person may edit is a file that may hold something else, so a row
 * that is not one is an error naming what was wrong — not a row skipped in
 * silence, which would read as a prompt that quietly went missing.
 */
function rowOf(value: unknown, at: number): Row {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${LIBRARY_FILE}: entry ${at} is not an object`)
  }
  const held = value as Record<string, unknown>
  return {
    ...held,
    description: textOf(held.description, "description"),
    prompt: textOf(held.prompt, "prompt"),
    tags: stringsOf(held.tags),
    updatedAt: typeof held.updatedAt === "string" ? held.updatedAt : "",
    assets: stringsOf(held.assets),
  }
}

/** The row as it goes back into the file: what a person reads, and nothing derived. */
function lineOf(row: Row): Record<string, unknown> {
  const line: Record<string, unknown> = {}
  /* Every field but the derived one, so a field this module does not know is
     written back rather than dropped. */
  for (const [key, value] of Object.entries(row)) {
    if (key !== "id") line[key] = value
  }
  return line
}

/** Create the library for one hub home. */
export function createFsPromptStore(options: PromptStoreOptions = {}): PromptStore {
  const file = promptsFile(options.home)
  let held: Row[] | null = null

  /**
   * Every row in the file, in the order it holds them.
   *
   * @throws when the file is not a JSON array of rows — see the note above on
   * why that is refused rather than repaired.
   */
  const load = async (): Promise<Row[]> => {
    if (held !== null) return held
    const text = await fs.readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") return null
      throw error
    })
    /* No file yet is an empty library; that is the one empty answer. */
    if (text === null || text.trim() === "") {
      held = []
      return held
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new Error(`${LIBRARY_FILE} is not valid JSON — fix it, or move it aside to start over`)
    }
    if (!Array.isArray(parsed)) {
      throw new Error(`${LIBRARY_FILE} does not hold a list of prompts`)
    }
    held = parsed.map(rowOf)
    return held
  }

  /** Publish the library atomically, in the file's own shape. */
  const save = async (rows: Row[]): Promise<void> => {
    held = rows
    await writeFileAtomic(file, `${JSON.stringify(rows.map(lineOf), null, 2)}\n`)
  }

  /**
   * Run one change after the previous one finished. Every change is a
   * read-modify-write of the one file, so two of them interleaving would let
   * the later write undo the earlier one.
   */
  let tail: Promise<unknown> = Promise.resolve()
  const run = <T>(change: () => Promise<T>): Promise<T> => {
    const next = tail.then(change, change)
    tail = next.catch(() => undefined)
    return next
  }

  /** A row with the name it answers to, which is what every caller holds. */
  const withId = (row: Row): StoredPrompt => ({
    ...(row as Prompt),
    id: slugOf(row.description),
  })

  return {
    async list(): Promise<PromptPage> {
      const items = (await load()).map(withId)
      const seen = new Set<string>()
      for (const row of items) for (const tag of row.tags) seen.add(tag)
      return {
        items,
        total: items.length,
        tags: [...seen].sort((a, b) => a.localeCompare(b)),
        root: displayPath(file),
      }
    },

    create: (draft: PromptDraft) =>
      run(async () => {
        const description = textOf(draft.description, "description")
        const id = slugOf(description)
        const rows = await load()
        /* The file name is what a delivery writes, so a second row that would
           take it would overwrite the first one's file instead of sitting
           beside it. */
        if (rows.some((row) => slugOf(row.description) === id)) {
          throw new Error(`"${description}" is already in this library`)
        }
        const row: Row = {
          description,
          prompt: draft.prompt,
          tags: [...new Set((draft.tags ?? []).map((tag) => tag.trim()).filter(Boolean))],
          updatedAt: new Date().toISOString(),
          assets: [],
        }
        await save([...rows, row])
        return withId(row)
      }),

    remove: (id: string) =>
      run(async () => {
        const rows = await load()
        const kept = rows.filter((row) => slugOf(row.description) !== id)
        /* A name that was not there changes nothing: an empty library stays
           empty, and a file nobody edited is not rewritten. */
        if (kept.length !== rows.length) await save(kept)
      }),
  }
}
