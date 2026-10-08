/**
 * Disk-backed plugin space: one directory per plugin under `<home>/plugins`.
 * The kernel never writes here — an installer does — so this module only
 * guarantees that a write lands whole inside its own plugin directory and that a
 * read cannot leave it. This module runs in the process that owns the disk.
 */
import { promises as fs } from "node:fs"
import path from "node:path"

import {
  assertPluginId,
  PLUGIN_DIR,
  PLUGIN_MANIFEST,
  PLUGIN_RECORDS,
} from "../plugins.ts"
import type { PluginRecord, PluginStore } from "../plugins.ts"
import { writeFileAtomic } from "./atomic.ts"
import { resolveStoredFile } from "./assets-fs.ts"

/** Plugins directory under a hub home. */
export function pluginsRoot(home: string): string {
  return path.join(home, PLUGIN_DIR)
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

/** Create the plugin store that reads and writes under one hub home. */
export function createFsPluginStore(home: string): PluginStore {
  const root = pluginsRoot(home)
  const recordsPath = path.join(root, PLUGIN_RECORDS)

  /** The directory of one plugin, refusing ids that are not directory names. */
  const pluginDir = (id: string) => path.join(root, assertPluginId(id))

  return {
    root,

    async list() {
      const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
      const ids: string[] = []
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        try {
          assertPluginId(entry.name)
        } catch {
          /* A directory that is not a plugin id stays on disk and out of the list. */
          continue
        }
        const manifest = path.join(root, entry.name, PLUGIN_MANIFEST)
        if ((await fs.stat(manifest).catch(() => null)) === null) continue
        ids.push(entry.name)
      }
      return ids.sort((a, b) => a.localeCompare(b))
    },

    async read(id, file) {
      return fs.readFile(resolveStoredFile(pluginDir(id), file), "utf8")
    },

    async write(id, file, data) {
      await writeFileAtomic(resolveStoredFile(pluginDir(id), file), data)
    },

    async remove(id) {
      await fs.rm(pluginDir(id), { recursive: true, force: true })
      const records = readRecords(await readJsonFile(recordsPath))
      if (records[id] === undefined) return
      delete records[id]
      await writeFileAtomic(recordsPath, `${JSON.stringify(records, null, 2)}\n`)
    },

    async records() {
      return readRecords(await readJsonFile(recordsPath))
    },

    async setRecord(id, record) {
      const records = readRecords(await readJsonFile(recordsPath))
      records[assertPluginId(id)] = record
      await writeFileAtomic(recordsPath, `${JSON.stringify(records, null, 2)}\n`)
    },
  }
}
