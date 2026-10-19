/**
 * The prompt library: a JSON index in the hub's own directory, and one markdown
 * file per prompt beside it.
 *
 * The index holds what a page draws — id, title, description, tags, media — and
 * the markdown file holds the text itself. The split exists for one reason: a
 * prompt is read by a person before it is used, and a diff of one markdown file
 * is that reading, while the same edit inside a JSON array is a line of escaped
 * newlines nobody can approve.
 *
 * The index stays the source of truth for everything but the text. It is still
 * one file, so a write is one atomic replace, and a row still keeps every field
 * it arrived with: the file is hand-editable, so a field this module does not
 * know is carried through a write rather than dropped.
 *
 * Two consequences are handled here rather than hidden:
 *
 * - A file that cannot be read is **refused**, never rebuilt. A broken index or
 *   a missing/empty markdown file throws, the page says so, and nothing is
 *   written over it. An unreferenced markdown file is ignored, never adopted.
 * - A library written before the split is **migrated in place** on the first
 *   read: each row's text is written to its own file, then the index is
 *   rewritten atomically without the text. The text lands first, so a failure
 *   at any point leaves the index as it was and a retry finishes the job.
 */
import { randomUUID } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"

import { assetKind, assetRef, createAssetStore, readSource } from "@context-hub/core"
import type { AssetStore } from "@context-hub/core"
import { writeFileAtomic } from "@context-hub/core/host/atomic"
import { createFsAssetLibrary } from "@context-hub/core/host"
import { displayPath, resolveHubHome } from "@context-hub/core/host/home"

import { slugOf } from "../slug.ts"
import type {
  PromptAsset,
  PromptDraft,
  PromptPage,
  PromptPatch,
  PromptStore,
  StoredPrompt,
} from "../store.ts"

/** The index's own file name, inside the prompts directory of the hub's home. */
const LIBRARY_FILE = "prompts.json"

/** The directory the library sits in, which is what the name is a directory of. */
const LIBRARY_DIR = "prompts"

/** What every prompt's own file is called. */
const BODY_EXTENSION = ".md"

/**
 * One row as the index holds it: the metadata, plus whatever else was there.
 *
 * The text is not part of it — that is the file `file` names.
 */
interface Row extends Record<string, unknown> {
  id?: string
  name: string
  description: string
  /** The bare file name of the markdown file holding this prompt's text. */
  file: string
  tags: string[]
  updatedAt: string
  assets: string[]
}

/** One row with the text it owns, which is what every operation works on. */
interface Entry {
  row: Row
  /** The prompt's text, read from `row.file`. */
  body: string
}

/** Where the library lives. */
export interface PromptStoreOptions {
  /** Hub home; the library is the `prompts/` directory inside it. */
  home?: string
  /**
   * An already-built asset store, for a form that keeps media its own way —
   * the hub's own `<home>/assets` when absent.
   */
  assets?: AssetStore
}

/** Where the library's files live. */
export function promptsDir(home?: string): string {
  return `${resolveHubHome(home)}/${LIBRARY_DIR}`
}

/** The index file, which is also what `list()` reports as the library's home. */
export function promptsFile(home?: string): string {
  return `${promptsDir(home)}/${LIBRARY_FILE}`
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
 * A row's title.
 *
 * A library written by hand before the field existed carries none, and the
 * description stands in: the description was the title then, and what a
 * delivery names its file after has to come out where it already was.
 */
function titleOf(held: unknown, description: string): string {
  return typeof held === "string" && held.trim() !== "" ? held : description
}

/**
 * The markdown file one row names.
 *
 * A bare file name, because it is joined to the library's directory: a stored
 * path that climbed out of it would let a row read and overwrite any file the
 * hub can reach. The extension is checked too, so a row cannot point at the
 * index itself.
 */
function fileNameOf(value: unknown, at: number): string {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.includes("/") ||
    value.includes("\\") ||
    value === "." ||
    value === ".." ||
    !value.endsWith(BODY_EXTENSION)
  ) {
    throw new Error(
      `${LIBRARY_FILE}: entry ${at} needs its file to be a name ending in ${BODY_EXTENSION}`
    )
  }
  return value
}

/** Whether one raw row already holds a file name. */
function hasFile(row: Record<string, unknown>): boolean {
  return typeof row.file === "string" && row.file.trim() !== ""
}

/** The text without the UTF-8 BOM some editors put first; it is not the prompt. */
function withoutBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/**
 * One row out of the index, checked as it is read.
 *
 * A file a person may edit is a file that may hold something else, so a row
 * that is not one is an error naming what was wrong — not a row skipped in
 * silence, which would read as a prompt that quietly went missing.
 */
function rowOf(value: Record<string, unknown>, at: number): Row {
  if ("prompt" in value) {
    /* Both places cannot be right, and picking one would silently discard the
       other. The migration takes the prompt out; a row still carrying it after
       that has been edited by hand into a state this store will not guess at. */
    throw new Error(`${LIBRARY_FILE}: entry ${at} carries both a prompt and a file`)
  }
  const description = textOf(value.description, "description")
  return {
    ...value,
    /* A row written before the title existed reads as one titled by its
       description: what it is called on screen, and the file it delivers to,
       both come out where they already were. */
    name: titleOf(value.name, description),
    description,
    file: fileNameOf(value.file, at),
    tags: stringsOf(value.tags),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    assets: stringsOf(value.assets),
  }
}

/**
 * The id one row answers to.
 *
 * Written down when the row is created, so a title can be corrected without
 * moving the row. A library a person wrote by hand carries none, and the one
 * its title makes stands in until something writes the row again.
 */
function idOf(row: Row): string {
  const held = row.id
  return typeof held === "string" && held.trim() !== "" ? held : slugOf(row.name)
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
  const dir = promptsDir(options.home)
  const file = promptsFile(options.home)
  const assets =
    options.assets ??
    createAssetStore(createFsAssetLibrary(resolveHubHome(options.home)))
  let held: Entry[] | null = null
  let loading: Promise<Entry[]> | null = null

  /**
   * The raw rows in the index, before any of them is trusted.
   *
   * @throws when the file is not a JSON array of objects — see the note above on
   * why that is refused rather than repaired.
   */
  const readIndex = async (): Promise<Record<string, unknown>[]> => {
    const text = await fs.readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") return null
      throw error
    })
    /* No file yet is an empty library; that is the one empty answer. */
    if (text === null || text.trim() === "") return []
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new Error(`${LIBRARY_FILE} is not valid JSON — fix it, or move it aside to start over`)
    }
    if (!Array.isArray(parsed)) {
      throw new Error(`${LIBRARY_FILE} does not hold a list of prompts`)
    }
    return parsed.map((value, at) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(`${LIBRARY_FILE}: entry ${at} is not an object`)
      }
      return value as Record<string, unknown>
    })
  }

  /** Publish the index atomically, in the file's own shape. */
  const writeIndex = async (entries: Entry[]): Promise<void> => {
    await writeFileAtomic(file, `${JSON.stringify(entries.map((entry) => entry.row), null, 2)}\n`)
    held = entries
  }

  /** Publish one prompt's text. Always written before the index that names it. */
  const writeBody = (entry: Entry): Promise<void> =>
    writeFileAtomic(path.join(dir, entry.row.file), entry.body)

  /**
   * One row's text, read from the file it names.
   *
   * @throws when the file is not there or holds nothing: the row says a prompt
   * exists, and an empty answer would draw a prompt that is not what its file
   * says.
   */
  const readBody = async (name: string, at: number): Promise<string> => {
    const text = await fs.readFile(path.join(dir, name), "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") {
        throw new Error(`${LIBRARY_FILE}: entry ${at} points at ${name}, which is not there`)
      }
      throw error
    })
    /* Editors on Windows save a BOM; it is not part of the prompt. */
    const body = withoutBom(text)
    if (body.trim() === "") {
      throw new Error(`${LIBRARY_FILE}: entry ${at} points at ${name}, which is empty`)
    }
    return body
  }

  /** Whether a file is already on disk. */
  const exists = async (target: string): Promise<boolean> =>
    fs.stat(target).then(
      () => true,
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT" || error.code === "ENOTDIR") return false
        throw error
      }
    )

  /**
   * Move a library written before the split into the split shape.
   *
   * The text is written first and the index last, so an interrupted migration
   * leaves the index untouched and the next read finishes the job: a text file
   * already holding the same bytes is the one this migration would write, and
   * is kept rather than refused.
   *
   * @returns the rows as the rewritten index holds them, or the same rows when
   * there was nothing to migrate.
   */
  const migrate = async (rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> => {
    const jobs = new Map<number, { file: string; body: string }>()
    const claimed = new Map<string, number>()
    for (const [at, row] of rows.entries()) {
      if (hasFile(row)) {
        if ("prompt" in row) {
          throw new Error(`${LIBRARY_FILE}: entry ${at} carries both a prompt and a file`)
        }
        claimed.set(fileNameOf(row.file, at), at)
        continue
      }
      if (!("prompt" in row)) continue
      /* Everything is checked before anything is written: a bad row found after
         the first text file landed would leave a half-migrated library. */
      const description = textOf(row.description, "description")
      const body = textOf(row.prompt, "prompt")
      const name = titleOf(row.name, description)
      const bodyFile = `${slugOf(name)}${BODY_EXTENSION}`
      const taken = claimed.get(bodyFile)
      if (taken !== undefined) {
        throw new Error(
          `${LIBRARY_FILE}: entries ${taken} and ${at} would write the same file ${bodyFile}`
        )
      }
      claimed.set(bodyFile, at)
      jobs.set(at, { file: bodyFile, body })
    }
    if (jobs.size === 0) return rows

    for (const job of jobs.values()) {
      const target = path.join(dir, job.file)
      const current = await fs.readFile(target, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT" || error.code === "ENOTDIR") return null
        throw error
      })
      /* A file already there belongs to the person unless it is byte for byte
         what this migration would have written. */
      if (current !== null) {
        if (withoutBom(current) !== job.body) {
          throw new Error(
            `${job.file} is already there and is not this prompt's — move it aside to migrate`
          )
        }
        continue
      }
      await writeFileAtomic(target, job.body)
    }

    const next = rows.map((row, at) => {
      const job = jobs.get(at)
      if (job === undefined) return row
      const rest = { ...row }
      delete rest.prompt
      return { ...rest, file: job.file }
    })
    await fs.mkdir(dir, { recursive: true })
    await writeFileAtomic(file, `${JSON.stringify(next, null, 2)}\n`)
    return next
  }

  /** Every row with its text, in the index's order. */
  const readAll = async (): Promise<Entry[]> => {
    const rows = await migrate(await readIndex())
    const entries: Entry[] = []
    const files = new Map<string, number>()
    for (const [at, row] of rows.entries()) {
      const parsed = rowOf(row, at)
      const seen = files.get(parsed.file)
      if (seen !== undefined) {
        /* Two rows naming one file would let either write overwrite the other's
           text, and the index gives no rule for which one won. */
        throw new Error(`${LIBRARY_FILE}: entries ${seen} and ${at} both point at ${parsed.file}`)
      }
      files.set(parsed.file, at)
      entries.push({ row: parsed, body: await readBody(parsed.file, at) })
    }
    return entries
  }

  /** The library, read once and kept until a change replaces it. */
  const load = (): Promise<Entry[]> => {
    if (held !== null) return Promise.resolve(held)
    if (loading === null) {
      loading = readAll().then(
        (entries) => {
          held = entries
          return entries
        },
        (error: unknown) => {
          /* A failed read is retried next time rather than remembered: a file
             fixed by hand should be readable without restarting the hub. */
          loading = null
          throw error
        }
      )
    }
    return loading
  }

  /**
   * Run one change after the previous one finished. A change is a read, up to
   * two file writes, and the index write; two of them interleaving would let
   * the later index undo the earlier one.
   */
  let tail: Promise<unknown> = Promise.resolve()
  const run = <T>(change: () => Promise<T>): Promise<T> => {
    const next = tail.then(change, change)
    tail = next.catch(() => undefined)
    return next
  }

  /** A row with the text it owns, which is what every caller holds. */
  const withId = (entry: Entry): StoredPrompt => ({
    id: idOf(entry.row),
    name: entry.row.name,
    description: entry.row.description,
    prompt: entry.body,
    tags: entry.row.tags,
    updatedAt: entry.row.updatedAt,
    assets: entry.row.assets,
  })

  /** Where one row sits, or a refusal naming a row this library does not hold. */
  const at = (entries: Entry[], id: string): number => {
    const found = entries.findIndex((entry) => idOf(entry.row) === id)
    if (found < 0) throw new Error(`${id} is not in this library`)
    return found
  }

  /**
   * Record one reference on a row, last in the display order.
   *
   * Queued like every other change: it rewrites the shared index, and one that
   * interleaved with a create would undo it.
   */
  const recordAsset = (id: string, ref: string): Promise<PromptAsset> =>
    run(async () => {
      const entries = await load()
      const index = at(entries, id)
      const entry = entries[index] as Entry
      const next = [...entries]
      next[index] = {
        ...entry,
        row: {
          ...entry.row,
          assets: [...entry.row.assets.filter((item) => item !== ref), ref],
          updatedAt: new Date().toISOString(),
        },
      }
      await writeIndex(next)
      return { ref, kind: assetKind(ref) }
    })

  return {
    async list(): Promise<PromptPage> {
      const entries = await load()
      const items = entries.map(withId)
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
        const name = textOf(draft.name, "name")
        const description = textOf(draft.description, "description")
        const entries = await load()
        /* What a delivery writes is named after the title, and so is the text's
           own file; a second row with the same one would write over the first
           instead of sitting beside it. Two rows may say the same thing about
           themselves; they may not share a file name. */
        const named = slugOf(name)
        if (entries.some((entry) => slugOf(entry.row.name) === named)) {
          throw new Error(`"${name}" is already in this library`)
        }
        const bodyFile = `${named}${BODY_EXTENSION}`
        /* A file nobody's row names is not adopted: it belongs to a person who
           put it there, and writing over it would lose what they wrote. */
        if (await exists(path.join(dir, bodyFile))) {
          throw new Error(`"${name}" is already a file in this library's directory`)
        }
        const entry: Entry = {
          row: {
            /* Opaque and generated, so nothing about the wording decides what
               the row is: correcting a title corrects the row rather than
               making one. */
            id: randomUUID(),
            name,
            description,
            file: bodyFile,
            tags: [...new Set((draft.tags ?? []).map((tag) => tag.trim()).filter(Boolean))],
            updatedAt: new Date().toISOString(),
            assets: [],
          },
          body: draft.prompt,
        }
        await writeBody(entry)
        await writeIndex([...entries, entry])
        return withId(entry)
      }),

    update: (id: string, patch: PromptPatch) =>
      run(async () => {
        /* Every field is checked before the row is looked up, so an edit that
           names nothing is refused rather than stamping the row for no change. */
        const text = patch.prompt === undefined ? undefined : textOf(patch.prompt, "prompt")
        const name = patch.name === undefined ? undefined : textOf(patch.name, "name")
        const description =
          patch.description === undefined ? undefined : textOf(patch.description, "description")
        const tags =
          patch.tags === undefined
            ? undefined
            : [...new Set(patch.tags.map((tag) => tag.trim()).filter(Boolean))]
        const entries = await load()
        const index = at(entries, id)
        const entry = entries[index] as Entry
        if (name !== undefined && name !== entries[index]?.row.name) {
          /* Correcting a title does not move the row, but it may not reach the
             file another row's delivery writes to either. */
          const named = slugOf(name)
          if (
            entries.some(
              (one, position) => position !== index && slugOf(one.row.name) === named
            )
          ) {
            throw new Error(`"${name}" is already in this library`)
          }
        }
        if (text === undefined && name === undefined && description === undefined && tags === undefined) {
          return withId(entry)
        }
        const body = text ?? entry.body
        const nextFile =
          name === undefined || name === entry.row.name
            ? entry.row.file
            : `${slugOf(name)}${BODY_EXTENSION}`
        const next: Entry = {
          row: {
            ...entry.row,
            ...(name === undefined ? {} : { name }),
            ...(description === undefined ? {} : { description }),
            ...(tags === undefined ? {} : { tags }),
            file: nextFile,
            updatedAt: new Date().toISOString(),
          },
          body,
        }
        if (nextFile !== entry.row.file) {
          const target = path.join(dir, nextFile)
          if (await exists(target)) {
            throw new Error(`"${name}" is already a file in this library's directory`)
          }
          /* The new text lands first and the old file goes last: a crash in
             between leaves an unreferenced file, never an index pointing at
             nothing. */
          await writeBody(next)
          const rest = [...entries]
          rest[index] = next
          await writeIndex(rest)
          await fs.rm(path.join(dir, entry.row.file), { force: true })
        } else {
          if (text !== undefined) await writeBody(next)
          const rest = [...entries]
          rest[index] = next
          await writeIndex(rest)
        }
        return withId(next)
      }),

    remove: (id: string) =>
      run(async () => {
        const entries = await load()
        const kept = entries.filter((entry) => idOf(entry.row) !== id)
        /* A name that was not there changes nothing: an empty library stays
           empty, and a file nobody edited is not rewritten. */
        if (kept.length === entries.length) return
        const gone = entries.find((entry) => idOf(entry.row) === id) as Entry
        /* The index loses the row first, so a crash leaves an unreferenced text
           file rather than an index pointing at a deleted one. */
        await writeIndex(kept)
        await fs.rm(path.join(dir, gone.row.file), { force: true })
        /* The pictures go with the row. They are the hub's own files, uploaded
           under the row's name, so nothing else can reach them once the row
           that listed them is gone — leaving them behind would be a leak with
           no way to see it. */
        for (const ref of gone.row.assets) await assets.remove(ref)
      }),

    async putAsset(id: string, file: File): Promise<PromptAsset> {
      at(await load(), id)
      return recordAsset(id, await assets.put(owned(id, file)))
    },

    async addAssetSource(id: string, source: string): Promise<PromptAsset> {
      const entries = await load()
      const entry = entries[at(entries, id)] as Entry
      const parsed = readSource(source)
      if (parsed.kind === "link") {
        /* Re-adding a link keeps one entry; the hub does not own it. */
        if (entry.row.assets.includes(parsed.ref)) {
          return { ref: parsed.ref, kind: assetKind(parsed.ref) }
        }
        return recordAsset(id, parsed.ref)
      }
      return recordAsset(id, await assets.put(owned(id, parsed.file)))
    },

    deleteAsset: (id: string, ref: string) =>
      run(async () => {
        const entries = await load()
        const index = at(entries, id)
        const entry = entries[index] as Entry
        /* A reference this row does not hold belongs to another one, and the
           asset directory is shared: dropping it here would delete a file this
           prompt never referenced. */
        if (!entry.row.assets.includes(ref)) return
        await assets.remove(ref)
        const next = [...entries]
        next[index] = {
          ...entry,
          row: {
            ...entry.row,
            assets: entry.row.assets.filter((item) => item !== ref),
            updatedAt: new Date().toISOString(),
          },
        }
        await writeIndex(next)
      }),

    assetUrl: (ref) => assetRef(ref),
  }
}
