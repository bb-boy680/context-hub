/**
 * Disk-backed state store: one JSON file per document under `<home>/state`, so
 * kernel state survives a reload and travels with the hub instead of with one
 * browser profile. Writes replace files atomically. This module runs in the
 * process that owns the disk.
 */
import { promises as fs } from "node:fs"
import path from "node:path"

import { assertStateName, STATE_DIR } from "../state.ts"
import type { StateStore } from "../state.ts"
import { writeFileAtomic } from "./atomic.ts"

/** State directory under a hub home. */
export function stateRoot(home: string): string {
  return path.join(home, STATE_DIR)
}

/** Create the state store that writes under one hub home. */
export function createFsStateStore(home: string): StateStore {
  const root = stateRoot(home)

  const fileOf = (name: string) =>
    path.join(root, `${assertStateName(name)}.json`)

  return {
    root,

    async names() {
      const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
      const names: string[] = []
      for (const entry of entries) {
        if (!entry.isFile() || path.extname(entry.name) !== ".json") continue
        const name = path.basename(entry.name, ".json")
        try {
          names.push(assertStateName(name))
        } catch {
          /* A file that is not a state document stays on disk and out of the list. */
        }
      }
      return names.sort((a, b) => a.localeCompare(b))
    },

    async read(name) {
      const file = fileOf(name)
      const raw = await fs.readFile(file, "utf8").catch(() => null)
      if (raw === null) return null
      try {
        /* An editor on Windows may save the file with a byte order mark. */
        return JSON.parse(raw.replace(/^\uFEFF/, "")) as unknown
      } catch {
        throw new Error(`state document is not JSON: ${file}`)
      }
    },

    async write(name, value) {
      await writeFileAtomic(fileOf(name), `${JSON.stringify(value, null, 2)}\n`)
    },
  }
}
