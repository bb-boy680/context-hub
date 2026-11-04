/**
 * Disk-backed extension space: one directory per extension under
 * `<home>/extensions`. The kernel never writes here — an installer does — so
 * this module only guarantees that a write lands whole inside its own extension
 * directory and that a read cannot leave it. This module runs in the process
 * that owns the disk.
 *
 * The space used to be `<home>/plugins`, which agent plugins now own, so the
 * first read of a home that still holds the old directory moves the extension
 * directories across — see {@link migrateExtensionSpace}.
 */
import { promises as fs } from "node:fs"
import path from "node:path"

import { CORE_SCHEMA, load } from "js-yaml"

import {
  assertPluginId,
  EXTENSION_DIR,
  EXTENSION_RECORDS,
  LEGACY_EXTENSION_DIR,
  PLUGIN_MANIFEST,
} from "../plugins.ts"
import type { PluginRecord, PluginStore } from "../plugins.ts"
import { writeFileAtomic } from "./atomic.ts"
import { resolveStoredFile } from "./assets-fs.ts"

/** Extensions directory under a hub home. */
export function extensionsRoot(home: string): string {
  return path.join(home, EXTENSION_DIR)
}

/**
 * Whether a directory holds an extension: the kernel's own rule, read here
 * without the kernel, because an agent plugin directory may carry a root
 * `plugin.json` too and only this rule tells the two apart.
 */
async function looksLikeExtension(dir: string, name: string): Promise<boolean> {
  const raw = await fs.readFile(path.join(dir, PLUGIN_MANIFEST), "utf8").catch(() => null)
  if (raw === null) return false
  try {
    const manifest = load(raw, { schema: CORE_SCHEMA }) as Record<string, unknown> | null
    return (
      typeof manifest === "object" &&
      manifest !== null &&
      manifest.id === name &&
      (typeof manifest.name === "string" || typeof manifest.name === "object") &&
      /* `apiVersion` was the old marker; a directory carrying it still moves,
         so an old install is not left behind in the agent plugin space. */
      (typeof manifest.engines === "object" || typeof manifest.apiVersion === "string")
    )
  } catch {
    /* A manifest this build cannot read is not one it can claim. */
    return false
  }
}

/**
 * Move a home's extension space from `<home>/plugins` to `<home>/extensions`.
 *
 * Only directories that pass {@link looksLikeExtension} move, so an agent plugin
 * pack already filed in the old directory stays where the plugin library put it.
 * The old directory is removed once it holds nothing else. Runs once per home;
 * a home with no old directory, or one already migrated, does nothing.
 *
 * @param home — the hub home to migrate.
 */
export async function migrateExtensionSpace(home: string): Promise<void> {
  const legacy = path.join(home, LEGACY_EXTENSION_DIR)
  const entries = await fs.readdir(legacy, { withFileTypes: true }).catch(() => null)
  if (entries === null) return
  const root = extensionsRoot(home)
  await fs.mkdir(root, { recursive: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const from = path.join(legacy, entry.name)
    if (!(await looksLikeExtension(from, entry.name))) continue
    const to = path.join(root, entry.name)
    if ((await fs.stat(to).catch(() => null)) !== null) continue
    await fs.rename(from, to).catch(async (error: unknown) => {
      /* A rename across devices fails; a copy this large never legitimately does. */
      if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error
      await fs.cp(from, to, { recursive: true })
      await fs.rm(from, { recursive: true, force: true })
    })
  }
  const records = path.join(legacy, EXTENSION_RECORDS)
  if ((await fs.stat(records).catch(() => null)) !== null) {
    await fs.rename(records, path.join(root, EXTENSION_RECORDS)).catch(() => undefined)
  }
  /* The plugin library owns the old directory now: hand it over empty. */
  const left = await fs.readdir(legacy).catch(() => [])
  if (left.length === 0) await fs.rmdir(legacy).catch(() => undefined)
}

interface RecordsDocument {
  format: 1
  order: string[]
  records: Record<string, PluginRecord>
}

/** Keep only well-formed records, so a hand-edited file cannot break the catalog. */
function readRecords(value: unknown): Record<string, PluginRecord> {
  if (typeof value !== "object" || value === null) return {}
  const records: Record<string, PluginRecord> = {}
  for (const [id, entry] of Object.entries(value)) {
    if (typeof entry !== "object" || entry === null) continue
    const { version, source, installedAt, integrity } = entry as Record<string, unknown>
    if (typeof version !== "string" || typeof source !== "string") continue
    try {
      assertPluginId(id)
    } catch {
      continue
    }
    records[id] = {
      version,
      source,
      installedAt: typeof installedAt === "string" ? installedAt : "",
      ...(typeof integrity === "string" ? { integrity } : {}),
    }
  }
  return records
}

/** Serialise record changes across stores that point at the same home. */
const recordQueues = new Map<string, Promise<void>>()

function withRecords<T>(root: string, operation: () => Promise<T>): Promise<T> {
  const key = path.resolve(root)
  const previous = recordQueues.get(key) ?? Promise.resolve()
  const result = previous.then(operation)
  const settled = result.then(() => undefined, () => undefined)
  recordQueues.set(key, settled)
  void settled.then(() => {
    if (recordQueues.get(key) === settled) recordQueues.delete(key)
  })
  return result
}

async function loadRecords(file: string): Promise<{ document: RecordsDocument; legacy: boolean }> {
  let raw: string
  try {
    raw = await fs.readFile(file, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { document: { format: 1, order: [], records: {} }, legacy: false }
    throw error
  }
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error("invalid extension records")
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("invalid extension records")
  }
  const document = value as Record<string, unknown>
  if (typeof document.format === "number") {
    if (document.format !== 1 || !Array.isArray(document.order) ||
      typeof document.records !== "object" || document.records === null || Array.isArray(document.records)) {
      throw new Error("invalid extension records format")
    }
    const order: string[] = []
    for (const id of document.order) {
      if (typeof id !== "string" || order.includes(id)) continue
      try { assertPluginId(id) } catch { continue }
      order.push(id)
    }
    return { document: { format: 1, order, records: readRecords(document.records) }, legacy: order.length !== document.order.length }
  }
  const records = readRecords(document)
  return { document: { format: 1, order: Object.keys(records), records }, legacy: true }
}

async function saveRecords(file: string, document: RecordsDocument): Promise<void> {
  await writeFileAtomic(file, `${JSON.stringify(document, null, 2)}\n`)
}

/** One migration per home: concurrent stores share it instead of racing. */
const migrations = new Map<string, Promise<void>>()

function migrationOf(home: string): Promise<void> {
  const running = migrations.get(home)
  if (running !== undefined) return running
  const task = migrateExtensionSpace(home).finally(() => {
    migrations.delete(home)
  })
  migrations.set(home, task)
  return task
}

/** Create the extension store that reads and writes under one hub home. */
export function createFsPluginStore(home: string): PluginStore {
  const root = extensionsRoot(home)
  const recordsPath = path.join(root, EXTENSION_RECORDS)
  /* Every entry point waits on the same migration, so a home that still holds
     the old directory is never read from two places at once. */
  const migrated = migrationOf(home)

  /** The directory of one extension, refusing ids that are not directory names. */
  const pluginDir = (id: string) => path.join(root, assertPluginId(id))

  return {
    root,

    async list() {
      await migrated
      return withRecords(root, async () => {
        const entries = await fs.readdir(root, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return []
          throw error
        })
        const ids: string[] = []
        for (const entry of entries) {
          if (!entry.isDirectory()) continue
          try {
            assertPluginId(entry.name)
          } catch {
            /* A directory that is not an extension id stays on disk and out of the list. */
            continue
          }
          const manifest = path.join(root, entry.name, PLUGIN_MANIFEST)
          if ((await fs.stat(manifest).catch(() => null)) === null) continue
          ids.push(entry.name)
        }
        try {
          const { document, legacy } = await loadRecords(recordsPath)
          const present = new Set(ids)
          const order = document.order.filter((id) => present.has(id))
          for (const id of ids) if (!order.includes(id)) order.push(id)
          if (legacy || order.length !== document.order.length || order.some((id, i) => id !== document.order[i])) {
            await saveRecords(recordsPath, { ...document, order })
          }
          return order
        } catch (error) {
          console.warn("Could not persist extension order:", error)
          return ids
        }
      })
    },

    async read(id, file) {
      await migrated
      return fs.readFile(resolveStoredFile(pluginDir(id), file), "utf8")
    },

    async write(id, file, data) {
      await migrated
      await writeFileAtomic(resolveStoredFile(pluginDir(id), file), data)
    },

    async remove(id) {
      await migrated
      await withRecords(root, async () => {
        const { document } = await loadRecords(recordsPath)
        await fs.rm(pluginDir(id), { recursive: true, force: true })
        delete document.records[id]
        document.order = document.order.filter((entry) => entry !== id)
        await saveRecords(recordsPath, document)
      })
    },

    async records() {
      await migrated
      return withRecords(root, async () => {
        try { return (await loadRecords(recordsPath)).document.records } catch { return {} }
      })
    },

    async commitInstall(id, record, install) {
      await migrated
      return withRecords(root, async () => {
        assertPluginId(id)
        await install()
        try {
          const { document } = await loadRecords(recordsPath)
          if (!document.order.includes(id)) document.order.push(id)
          document.records[id] = record
          await saveRecords(recordsPath, document)
          return undefined
        } catch (error) {
          return error instanceof Error ? error.message : String(error)
        }
      })
    },

    async setRecord(id, record) {
      await migrated
      await withRecords(root, async () => {
        const { document } = await loadRecords(recordsPath)
        assertPluginId(id)
        if (!document.order.includes(id)) document.order.push(id)
        document.records[id] = record
        await saveRecords(recordsPath, document)
      })
    },
  }
}
