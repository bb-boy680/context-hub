/**
 * The variable index: one JSON document in the hub's own directory.
 *
 * The document holds **names and groups only**. The values are written into the
 * machine's environment by {@link EnvironmentPort}, and read back from there
 * whenever the page asks. That split is the point of the module: a value is
 * something the machine owns, not something the hub's index keeps a second copy
 * of, and a shell started later sees exactly what the page shows.
 *
 * The whole module is one collection rather than one file per row. A variable
 * is a name and a group more than it is a document, so the rows are edited on
 * one screen and handed over in batches; a single atomic replace keeps the
 * batch all-or-nothing.
 *
 * A file that cannot be read or parsed is **refused**, never rebuilt: a broken
 * document throws and nothing is written over it. A `value` left in a file by
 * an earlier build is ignored and dropped on the next write; it is not copied
 * into the environment behind the user's back.
 */
import { promises as fs } from "node:fs"
import path from "node:path"

import { writeFileAtomic } from "@context-hub/core/host/atomic"
import { resolveHubHome } from "@context-hub/core/host/home"

import {
  DEFAULT_GROUP,
  VARIABLE_NAME,
  type Variable,
  type VariableDocument,
  type VariableDraft,
  type VariablePatch,
  type VariableStore,
} from "../store.ts"
import { createEnvironment, type EnvironmentPort } from "./environment.ts"

/** The directory the library sits in, inside the hub home. */
const LIBRARY_DIR = "variables"

/** The collection's own file name, inside that directory. */
const LIBRARY_FILE = "variables.json"

/** One row as the file holds it, plus whatever a hand edit left beside it. */
interface StoredRow extends Record<string, unknown> {
  name: string
  group: string
  updatedAt: string
}

/** The whole document as the file holds it. */
interface StoredDocument extends Record<string, unknown> {
  version: 1
  groups: string[]
  variables: StoredRow[]
}

/** Where the library lives. */
export interface VariableStoreOptions {
  /** Hub home; the library is the `variables/` directory inside it. */
  home?: string
  /** The machine-environment writer; tests pass an in-memory one. */
  environment?: EnvironmentPort
}

/** The collection's path. */
export function variablesPath(home?: string): string {
  return path.join(resolveHubHome(home), LIBRARY_DIR, LIBRARY_FILE)
}

/** A name as the library stores it, or a refusal that names the input. */
function nameOf(value: unknown): string {
  if (typeof value !== "string") throw new Error("variable name is required")
  const name = value.trim()
  if (!VARIABLE_NAME.test(name)) {
    throw new Error(`invalid variable name: ${JSON.stringify(value)}`)
  }
  return name
}

/** A group as the library stores it; an absent one lands in the default group. */
function groupOf(value: unknown): string {
  if (value === undefined || value === null) return DEFAULT_GROUP
  if (typeof value !== "string") throw new Error("group must be a string")
  const group = value.trim()
  return group === "" ? DEFAULT_GROUP : group
}

/** A group the caller names explicitly; unlike a row's group, an empty one is a mistake. */
function requiredGroupOf(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("group name is required")
  }
  return value.trim()
}

/** A value a caller asked to write; empty is not a value. */
function requiredValueOf(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("variable value is required")
  }
  if (value.includes("\0")) throw new Error("a value cannot contain NUL")
  return value
}

/** A value a caller asked to write, or undefined when the row only records a name. */
function optionalValueOf(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== "string") throw new Error("variable value must be a string")
  if (value.includes("\0")) throw new Error("a value cannot contain NUL")
  return value.trim() === "" ? undefined : value
}

/** Add a group to the document once. */
function rememberGroup(document: StoredDocument, group: string): void {
  if (!document.groups.includes(group)) document.groups.push(group)
}

/** Read text into the shape this module promises, preserving unknown fields. */
function parseDocument(text: string, file: string): StoredDocument {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`${file} is not valid JSON`)
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`${file} does not hold a variable document`)
  }
  const raw = parsed as Record<string, unknown>
  if (!Array.isArray(raw.variables)) {
    throw new Error(`${file} does not hold a variables array`)
  }

  const variables: StoredRow[] = []
  const seen = new Set<string>()
  for (const item of raw.variables) {
    if (typeof item !== "object" || item === null) {
      throw new Error(`${file} holds a variable that is not an object`)
    }
    const row = item as Record<string, unknown>
    const name = nameOf(row.name)
    if (seen.has(name)) throw new Error(`duplicate variable name: ${name}`)
    seen.add(name)
    /* An earlier build kept the value here; this one does not. Drop it rather
       than carry it forward as an unknown field. */
    const { value: legacy, ...rest } = row
    void legacy
    variables.push({
      ...rest,
      name,
      group: groupOf(row.group),
      updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "",
    })
  }

  const groups: string[] = []
  const remember = (group: string) => {
    if (!groups.includes(group)) groups.push(group)
  }
  if (Array.isArray(raw.groups)) {
    for (const group of raw.groups) {
      if (typeof group === "string" && group.trim() !== "") remember(group.trim())
    }
  }
  remember(DEFAULT_GROUP)
  for (const row of variables) remember(row.group)

  return { ...raw, version: 1, groups, variables }
}

/** One row as the page reads it: the name's value comes from the environment. */
function shown(row: StoredRow, environment: EnvironmentPort): Variable {
  return {
    name: row.name,
    group: row.group,
    value: environment.get(row.name) ?? "",
    updatedAt: row.updatedAt,
  }
}

/** The disk-backed index, with the machine environment as the value store. */
export function createFsVariableStore(
  options: VariableStoreOptions = {}
): VariableStore {
  const file = variablesPath(options.home)
  const environment = options.environment ?? createEnvironment()

  /** The document as it is written; values are not part of it. */
  async function readStored(): Promise<StoredDocument> {
    let text: string
    try {
      text = await fs.readFile(file, "utf8")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: 1, groups: [DEFAULT_GROUP], variables: [] }
      }
      throw error
    }
    return parseDocument(text, file)
  }

  /** Write the whole collection as one atomic replace. */
  async function writeStored(document: StoredDocument): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true })
    await writeFileAtomic(file, `${JSON.stringify(document, null, 2)}\n`)
  }

  /** What the page draws: every name, with the environment's value beside it. */
  async function read(): Promise<VariableDocument> {
    await environment.ready()
    const document = await readStored()
    return {
      version: 1,
      groups: document.groups,
      variables: document.variables.map((row) => shown(row, environment)),
    }
  }

  return {
    read,

    async create(drafts: readonly VariableDraft[]) {
      if (drafts.length === 0) throw new Error("at least one variable is required")
      await environment.ready()
      const document = await readStored()
      const names = new Set(document.variables.map((row) => row.name))
      const now = new Date().toISOString()

      const entries = drafts.map((draft) => {
        const name = nameOf(draft.name)
        if (names.has(name)) throw new Error(`variable already exists: ${name}`)
        names.add(name)
        return {
          name,
          group: groupOf(draft.group),
          value: optionalValueOf(draft.value),
        }
      })

      /* The environment is written first: a row that says a value exists must
         not be recorded before it does. A row without a value writes nothing,
         so an environment value set outside the hub stays as it is. Anything
         already written is taken back when a later write or the index write
         fails. */
      const written: string[] = []
      const previous = new Map<string, string | undefined>()
      try {
        for (const entry of entries) {
          if (entry.value === undefined) continue
          previous.set(entry.name, environment.get(entry.name))
          await environment.set(entry.name, entry.value)
          written.push(entry.name)
        }
        for (const entry of entries) {
          rememberGroup(document, entry.group)
          document.variables.push({
            name: entry.name,
            group: entry.group,
            updatedAt: now,
          })
        }
        await writeStored(document)
      } catch (error) {
        for (const name of written) {
          const before = previous.get(name)
          if (before === undefined) {
            await environment.remove(name).catch(() => undefined)
          } else {
            await environment.set(name, before).catch(() => undefined)
          }
        }
        throw error
      }

      return read()
    },

    async update(name: string, patch: VariablePatch) {
      await environment.ready()
      const document = await readStored()
      const target = nameOf(name)
      const index = document.variables.findIndex((row) => row.name === target)
      if (index < 0) throw new Error(`unknown variable: ${target}`)
      if (
        patch.name === undefined &&
        patch.group === undefined &&
        patch.value === undefined
      ) {
        throw new Error("an edit needs a name, a group, or a value")
      }

      const row = document.variables[index] as StoredRow
      const previousValue = environment.get(target)
      const nextName = patch.name === undefined ? target : nameOf(patch.name)
      if (
        nextName !== target &&
        document.variables.some((one) => one.name === nextName)
      ) {
        throw new Error(`variable already exists: ${nextName}`)
      }
      const nextGroup = patch.group === undefined ? row.group : groupOf(patch.group)
      const nextValue =
        patch.value === undefined ? previousValue : requiredValueOf(patch.value)

      /* What the environment should hold after this edit. A rename with no new
         value carries the current value across; a row whose value is already
         missing stays missing. */
      const envChanged = nextName !== target || patch.value !== undefined
      let envWritten = false
      try {
        if (envChanged) {
          if (nextValue !== undefined) {
            await environment.set(nextName, nextValue)
            envWritten = true
          }
          if (nextName !== target && previousValue !== undefined) {
            await environment.remove(target)
          }
        }

        const next: StoredRow = { ...row, name: nextName, group: nextGroup }
        if (nextGroup !== row.group) rememberGroup(document, nextGroup)
        next.updatedAt = new Date().toISOString()
        document.variables[index] = next
        await writeStored(document)
      } catch (error) {
        /* Put the environment back the way it was before rethrowing. */
        if (envWritten) await environment.remove(nextName).catch(() => undefined)
        if (previousValue !== undefined) {
          await environment.set(target, previousValue).catch(() => undefined)
        }
        throw error
      }

      return read()
    },

    async remove(name: string) {
      await environment.ready()
      const document = await readStored()
      const target = nameOf(name)
      const index = document.variables.findIndex((row) => row.name === target)
      /* A name this index does not hold is not ours to remove from the machine
         environment, even when the environment happens to have it. */
      if (index < 0) return read()

      const previousValue = environment.get(target)
      try {
        await environment.remove(target)
        document.variables.splice(index, 1)
        await writeStored(document)
      } catch (error) {
        if (previousValue !== undefined) {
          await environment.set(target, previousValue).catch(() => undefined)
        }
        throw error
      }
      return read()
    },

    async createGroup(group: string) {
      const document = await readStored()
      const name = requiredGroupOf(group)
      if (!document.groups.includes(name)) {
        document.groups.push(name)
        await writeStored(document)
      }
      return read()
    },

    async renameGroup(from: string, to: string) {
      const document = await readStored()
      const source = requiredGroupOf(from)
      const next = requiredGroupOf(to)
      if (source === DEFAULT_GROUP) {
        throw new Error("the default group cannot be renamed")
      }
      if (next === DEFAULT_GROUP) {
        throw new Error("cannot rename a group to the default group")
      }
      if (!document.groups.includes(source)) {
        throw new Error(`unknown group: ${source}`)
      }
      if (source === next) return read()
      if (document.groups.includes(next)) {
        throw new Error(`group already exists: ${next}`)
      }
      document.groups[document.groups.indexOf(source)] = next
      for (const row of document.variables) {
        if (row.group === source) row.group = next
      }
      await writeStored(document)
      return read()
    },

    async removeGroup(group: string) {
      const document = await readStored()
      const target = requiredGroupOf(group)
      if (target === DEFAULT_GROUP) {
        throw new Error("the default group cannot be removed")
      }
      if (!document.groups.includes(target)) return read()
      document.groups = document.groups.filter((one) => one !== target)
      for (const row of document.variables) {
        if (row.group === target) row.group = DEFAULT_GROUP
      }
      await writeStored(document)
      return read()
    },
  }
}
