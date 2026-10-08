/**
 * Atomic file replacement for everything the hub writes: a completed temporary
 * file renamed into place, so a reader never sees a partial write. Windows
 * reports transient sharing failures while another handle closes, hence the
 * bounded retry. This module runs in the process that owns the disk.
 */
import { randomUUID } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"

/** Prefix for in-flight replacements; readers skip it. */
export const TEMP_PREFIX = ".tmp-"

/** Windows reports transient sharing failures while another handle closes. */
const RETRYABLE = new Set(["EACCES", "EBUSY", "EPERM"])

/**
 * Write a file by renaming a completed temporary file over it.
 *
 * @param target — the file to replace; its directory is created when missing.
 * @param data — the contents to write.
 */
export async function writeFileAtomic(
  target: string,
  data: string | Uint8Array
): Promise<void> {
  const dir = path.dirname(target)
  await fs.mkdir(dir, { recursive: true })
  const temporary = path.join(dir, `${TEMP_PREFIX}${randomUUID()}`)
  await fs.writeFile(temporary, data)
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rename(temporary, target)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? ""
      if (!RETRYABLE.has(code) || attempt >= 4) {
        await fs.rm(temporary, { force: true })
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)))
    }
  }
}
