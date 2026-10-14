/**
 * The directory hash both libraries compare against: every file's relative path
 * and bytes, in path order, fed to one SHA-256.
 *
 * The algorithm is the skills CLI's, and deliberately so: it writes that number
 * into `skills-lock.json` at install time, and the only way to answer "has this
 * skill been edited since" is to compute the same number again. Changing the
 * order, the separator, or what is skipped would silently make every recorded
 * hash unusable, so the golden value in `plugin-skills/scripts/check-upstream.ts`
 * pins it.
 *
 * A plugin pack is hashed with the same function: it is a directory of files
 * with no external tool to agree with, and one implementation is one place for
 * this to be wrong.
 *
 * This module runs in the process that owns the disk.
 */
import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"

/** Entries the hash leaves out; a repository's own bookkeeping is not the content. */
const SKIPPED = new Set([".git", "node_modules"])

/** One file the hash covers. */
interface HashedFile {
  relative: string
  bytes: Buffer
}

async function collect(dir: string, at: string, into: HashedFile[]): Promise<void> {
  const entries = await fs.readdir(at, { withFileTypes: true })
  for (const entry of entries) {
    if (SKIPPED.has(entry.name)) continue
    const full = path.join(at, entry.name)
    if (entry.isDirectory()) {
      await collect(dir, full, into)
      continue
    }
    if (!entry.isFile()) continue
    into.push({
      relative: path.relative(dir, full).split(path.sep).join("/"),
      bytes: await fs.readFile(full),
    })
  }
}

/**
 * The hash of every file under one directory, as the skills CLI computes it.
 *
 * @param dir — the directory, absolute.
 * @returns the hex digest of its contents.
 */
export async function folderHash(dir: string): Promise<string> {
  const files: HashedFile[] = []
  await collect(dir, dir, files)
  files.sort((left, right) => left.relative.localeCompare(right.relative))
  const hash = createHash("sha256")
  for (const file of files) {
    hash.update(file.relative)
    hash.update(file.bytes)
  }
  return hash.digest("hex")
}
