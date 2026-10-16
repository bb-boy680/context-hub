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
 * @returns one entry per directory and file, depth first, in name order.
 */
export function walkSkillDir(dir: string): Promise<SkillFileEntry[]> {
  return walk(dir, dir, 0)
}

async function walk(dir: string, base: string, depth: number): Promise<SkillFileEntry[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  const rows: SkillFileEntry[] = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name.startsWith(".")) continue
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
