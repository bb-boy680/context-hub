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
      typeof manifest.apiVersion === "string"
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

async function readJsonFile(file: string): Promise<unknown> {
  const raw = await fs.readFile(file, "utf8").catch(() => null)
  if (raw === null) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    /* A records file this build cannot read is rebuilt, not trusted. */
    return null
  }
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
      const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
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
      return ids.sort((a, b) => a.localeCompare(b))
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
      await fs.rm(pluginDir(id), { recursive: true, force: true })
      const records = readRecords(await readJsonFile(recordsPath))
      if (records[id] === undefined) return
      delete records[id]
      await writeFileAtomic(recordsPath, `${JSON.stringify(records, null, 2)}\n`)
    },

    async records() {
      await migrated
      return readRecords(await readJsonFile(recordsPath))
    },

    async setRecord(id, record) {
      await migrated
      const records = readRecords(await readJsonFile(recordsPath))
      records[assertPluginId(id)] = record
      await writeFileAtomic(recordsPath, `${JSON.stringify(records, null, 2)}\n`)
    },
  }
}
