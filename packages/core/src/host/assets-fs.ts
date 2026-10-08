/**
 * Disk-backed asset library. Files live under `<home>/assets`, so a recorded
 * path like `assets/cover.png` resolves the same way in every form: `<home>`
 * plus the path.
 *
 * Writes replace files atomically (a sibling temp file renamed into place, with
 * a bounded retry for Windows sharing errors), so a reader never sees a partial
 * file. This module runs in the process that owns the disk.
 */
import { randomUUID } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"

import { ASSET_DIR, assetKind, assetLimit, limitMessage } from "../assets.ts"
import type { AssetLibrary } from "../assets.ts"

/** Prefix for in-flight replacements; readers skip it. */
const TEMP_PREFIX = ".tmp-"

/** Characters no file name may carry: path separators plus the Windows reserved set. */
const RESERVED_IN_NAME = /[\\/:*?"<>|]/

/** Windows reports transient sharing failures while another handle closes. */
const RETRYABLE = new Set(["EACCES", "EBUSY", "EPERM"])

/** Reject a name that would escape, hide, or fail to write. */
function assertSafeName(value: string): string {
  if (value === "" || value === "." || value === ".." || value.startsWith(".")) {
    throw new Error(`asset name is not allowed: ${value}`)
  }
  if (RESERVED_IN_NAME.test(value)) {
    throw new Error(`asset name is not allowed: ${value}`)
  }
  return value
}

/**
 * Resolve one recorded path against the hub home.
 *
 * @param home — the hub home directory.
 * @param relative — a path recorded by the library.
 * @returns the absolute file path.
 */
export function resolveStoredFile(home: string, relative: string): string {
  const resolved = path.resolve(home, relative)
  const prefix = home.endsWith(path.sep) ? home : home + path.sep
  if (!resolved.startsWith(prefix)) {
    throw new Error(`path escapes the hub home: ${relative}`)
  }
  return resolved
}

async function statOrNull(target: string) {
  try {
    return await fs.stat(target)
  } catch {
    return null
  }
}

/** Create the asset library that writes under one hub home. */
export function createFsAssetLibrary(home: string): AssetLibrary {
  const dir = path.join(home, ASSET_DIR)

  return {
    root: dir,

    async put(name, bytes, contentType) {
      await fs.mkdir(dir, { recursive: true })
      const original = assertSafeName(path.basename(name))
      const kind = assetKind(original, contentType)
      const limit = assetLimit(kind)
      if (bytes.byteLength > limit) throw new Error(limitMessage(kind))
      let file = original
      let suffix = 1
      while ((await statOrNull(path.join(dir, file))) !== null) {
        file = `${path.basename(original, path.extname(original))}-${suffix++}${path.extname(original)}`
      }
      /* Write beside the target and rename, so a failed write leaves no half file. */
      const temporary = path.join(dir, `${TEMP_PREFIX}${randomUUID()}`)
      await fs.writeFile(temporary, bytes)
      try {
        for (let attempt = 0; ; attempt += 1) {
          try {
            await fs.rename(temporary, path.join(dir, file))
            break
          } catch (error) {
            const code = (error as NodeJS.ErrnoException).code ?? ""
            if (!RETRYABLE.has(code) || attempt >= 4) throw error
            await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)))
          }
        }
      } catch (error) {
        await fs.rm(temporary, { force: true })
        throw error
      }
      return `${ASSET_DIR}/${file}`
    },

    async remove(relative) {
      await fs.rm(resolveStoredFile(home, relative), { force: true })
    },
  }
}
