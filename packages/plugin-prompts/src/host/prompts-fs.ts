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

import { assetKind, assetRef, createAssetStore, readSource } from "@workspace/core"
import type { AssetStore } from "@workspace/core"
import { writeFileAtomic } from "@workspace/core/host/atomic"
import { createFsAssetLibrary } from "@workspace/core/host"
import { displayPath, resolveHubHome } from "@workspace/core/host/home"

import { slugOf } from "../slug.ts"
import type {
  Prompt,
  PromptAsset,
  PromptDraft,
  PromptPage,
  PromptPatch,
  PromptStore,
  StoredPrompt,
} from "../store.ts"

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
  /**
   * An already-built asset store, for a form that keeps media its own way —
   * the hub's own `<home>/assets` when absent.
   */
  assets?: AssetStore
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

/** A text field a prompt must carry, refused when it is missing or empty. */
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
  return { ...row }
}

/**
 * The id one row answers to.
 *
 * Written down when the row is created, so a description can be corrected
 * without moving the row. A library a person wrote by hand carries none, and
 * the one its description makes stands in until something writes the row again.
 */
function idOf(row: Row): string {
  const held = row.id
  return typeof held === "string" && held.trim() !== "" ? held : slugOf(row.description)
}

/**
 * An id no row in this library answers to.
 *
 * Correcting a description leaves the row answering to the id it was written
 * with, so the name it gave up is free again — and a row created under that
 * name has to answer to something else. The description still decides what a
 * delivery writes, so the suffix never reaches a file.
 */
function freeId(rows: Row[], wanted: string): string {
  const held = (candidate: string) => rows.some((row) => idOf(row) === candidate)
  if (!held(wanted)) return wanted
  for (let count = 2; ; count += 1) {
    const candidate = `${wanted}-${count}`
    if (!held(candidate)) return candidate
  }
}

/**
 * One uploaded file as this prompt's own.
 *
 * The hub's asset directory is flat and content-addressed, so two prompts that
 * upload the same bytes would otherwise be handed one file: dropping the
 * picture from one would take it out of the other too. Prefixing the name with
 * the prompt it belongs to is what gives each row a reference of its own.
 */
function owned(id: string, file: File): File {
  return new File([file], `${id}-${file.name}`, { type: file.type })
}

/** Create the library for one hub home. */
export function createFsPromptStore(options: PromptStoreOptions = {}): PromptStore {
  const file = promptsFile(options.home)
  const assets =
    options.assets ??
    createAssetStore(createFsAssetLibrary(resolveHubHome(options.home)))
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
    id: idOf(row),
  })

  /** Where one row sits, or a refusal naming a row this library does not hold. */
  const at = (rows: Row[], id: string): number => {
    const found = rows.findIndex((row) => idOf(row) === id)
    if (found < 0) throw new Error(`${id} is not in this library`)
    return found
  }

  /** Replace one row, leaving every other row and field as it was. */
  const replace = async (rows: Row[], index: number, row: Row): Promise<void> => {
    const next = [...rows]
    next[index] = row
    await save(next)
  }

  /**
   * Record one reference on a row, last in the display order.
   *
   * Queued like every other change: this is a second read-modify-write of the
   * same file, and one that interleaved with a create would undo it.
   */
  const recordAsset = (id: string, ref: string): Promise<PromptAsset> =>
    run(async () => {
      const rows = await load()
      const index = at(rows, id)
      const row = rows[index] as Row
      await replace(rows, index, {
        ...row,
        assets: [...row.assets.filter((item) => item !== ref), ref],
        updatedAt: new Date().toISOString(),
      })
      return { ref, kind: assetKind(ref) }
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
        const rows = await load()
        /* What a delivery writes is named after the description, so a second
           row whose description says the same thing would write over the first
           one's file instead of sitting beside it. */
        const named = slugOf(description)
        if (rows.some((row) => slugOf(row.description) === named)) {
          throw new Error(`"${description}" is already in this library`)
        }
        const row: Row = {
          /* Two rows cannot answer to one id, and a corrected description may
             have left this name held by a row that no longer uses it. */
          id: freeId(rows, named),
          description,
          prompt: draft.prompt,
          tags: [...new Set((draft.tags ?? []).map((tag) => tag.trim()).filter(Boolean))],
          updatedAt: new Date().toISOString(),
          assets: [],
        }
        await save([...rows, row])
        return withId(row)
      }),

    update: (id: string, patch: PromptPatch) =>
      run(async () => {
        /* Every field is checked before the row is looked up, so an edit that
           names nothing is refused rather than stamping the row for no change. */
        const text = patch.prompt === undefined ? undefined : textOf(patch.prompt, "prompt")
        const description =
          patch.description === undefined ? undefined : textOf(patch.description, "description")
        const tags =
          patch.tags === undefined
            ? undefined
            : [...new Set(patch.tags.map((tag) => tag.trim()).filter(Boolean))]
        const rows = await load()
        const index = at(rows, id)
        const row = rows[index] as Row
        if (description !== undefined && description !== row.description) {
          /* Correcting a description does not move the row, but it may not take
             what another row's delivery writes to either. */
          const named = slugOf(description)
          if (rows.some((one, position) => position !== index && slugOf(one.description) === named)) {
            throw new Error(`"${description}" is already in this library`)
          }
        }
        if (text === undefined && description === undefined && tags === undefined) return withId(row)
        const next: Row = {
          ...row,
          ...(text === undefined ? {} : { prompt: text }),
          ...(description === undefined ? {} : { description }),
          ...(tags === undefined ? {} : { tags }),
          updatedAt: new Date().toISOString(),
        }
        await replace(rows, index, next)
        return withId(next)
      }),

    remove: (id: string) =>
      run(async () => {
        const rows = await load()
        const kept = rows.filter((row) => idOf(row) !== id)
        /* A name that was not there changes nothing: an empty library stays
           empty, and a file nobody edited is not rewritten. */
        if (kept.length === rows.length) return
        await save(kept)
        /* The pictures go with the row. They are the hub's own files, uploaded
           under the row's name, so nothing else can reach them once the row
           that listed them is gone — leaving them behind would be a leak with
           no way to see it. Written after the index, the way every other
           removal in this hub is ordered. */
        for (const row of rows) {
          if (idOf(row) !== id) continue
          for (const ref of row.assets) await assets.remove(ref)
        }
      }),

    async putAsset(id: string, file: File): Promise<PromptAsset> {
      at(await load(), id)
      return recordAsset(id, await assets.put(owned(id, file)))
    },

    async addAssetSource(id: string, source: string): Promise<PromptAsset> {
      const rows = await load()
      const row = rows[at(rows, id)] as Row
      const parsed = readSource(source)
      if (parsed.kind === "link") {
        /* Re-adding a link keeps one entry; the hub does not own it. */
        if (row.assets.includes(parsed.ref)) {
          return { ref: parsed.ref, kind: assetKind(parsed.ref) }
        }
        return recordAsset(id, parsed.ref)
      }
      return recordAsset(id, await assets.put(owned(id, parsed.file)))
    },

    deleteAsset: (id: string, ref: string) =>
      run(async () => {
        const rows = await load()
        const index = at(rows, id)
        const row = rows[index] as Row
        /* A reference this row does not hold belongs to another one, and the
           asset directory is shared: dropping it here would delete a file this
           prompt never referenced. */
        if (!row.assets.includes(ref)) return
        await assets.remove(ref)
        await replace(rows, index, {
          ...row,
          assets: row.assets.filter((item) => item !== ref),
          updatedAt: new Date().toISOString(),
        })
      }),

    assetUrl: (ref) => assetRef(ref),
  }
}
