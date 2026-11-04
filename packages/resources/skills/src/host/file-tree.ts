/**
 * The file tree of one skill directory. The library and a workspace both show
 * a skill's files, and both read them the same way: one level at a time,
 * sorted, `/`-separated, with hidden files left out.
 */
import { promises as fs } from "node:fs"
import path from "node:path"

import type { SkillFileEntry } from "../store.ts"

/**
 * List everything under a skill directory.
 *
 * @param dir — the skill's own directory.
 * @returns one entry per directory and file, depth first, folders before files
 *   and each run in name order.
 */
export function walkSkillDir(dir: string): Promise<SkillFileEntry[]> {
  return walk(dir, dir, 0)
}

async function walk(dir: string, base: string, depth: number): Promise<SkillFileEntry[]> {
  const entries = (await fs.readdir(dir, { withFileTypes: true }).catch(() => []))
    .filter((entry) => !entry.name.startsWith("."))
    .sort((left, right) => {
      /* Folders first at each level, then files; a folder precedes what it
         holds because it is pushed before the walk descends into it. */
      if (left.isDirectory() !== right.isDirectory()) return left.isDirectory() ? -1 : 1
      return left.name.localeCompare(right.name)
    })
  const rows: SkillFileEntry[] = []
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name)
    const relative = path.relative(base, absolute).split(path.sep).join("/")
    if (entry.isDirectory()) {
      rows.push({ path: relative, depth, directory: true, bytes: 0 })
      rows.push(...(await walk(absolute, base, depth + 1)))
    } else {
      const stat = await fs.stat(absolute).catch(() => null)
      rows.push({ path: relative, depth, directory: false, bytes: stat?.size ?? 0 })
    }
  }
  return rows
}
