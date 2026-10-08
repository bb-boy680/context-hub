/**
 * Disk side of folder browsing: list one directory level for a form that cannot
 * read the disk itself. The walk is one level deep and never follows a link, so
 * listing a folder cannot leave it; a link is followed only far enough to learn
 * whether entering it leads to a folder, because the hub installs skills as
 * links and a listing that hid them could not show what is installed.
 */
import { promises as fs } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

import { displayPath } from "./home.ts"
import type { BrowseCrumb, BrowseEntry, DirectoryListing } from "../fs-browse.ts"

/** Folders one listing reports before it says it stopped early. */
const MAX_ENTRIES = 2000

/**
 * The trail from the person's home (or the filesystem root) down to `target`,
 * so a form can offer every step without knowing where the home is.
 */
function crumbsOf(target: string): BrowseCrumb[] {
  const home = homedir()
  const base =
    target === home || target.startsWith(home + path.sep)
      ? home
      : path.parse(target).root
  const crumbs: BrowseCrumb[] = []
  let step = target
  while (step !== base && step !== path.dirname(step)) {
    crumbs.unshift({ name: path.basename(step), path: step })
    step = path.dirname(step)
  }
  crumbs.unshift({ name: base === home ? "~" : base, path: base })
  return crumbs
}

/**
 * List the folders inside one directory.
 *
 * @param target — the directory to list, absolute; the person's home is the
 *   caller's choice, not this one's.
 * @returns the folders it holds, sorted by name.
 */
export async function listDirectory(target: string): Promise<DirectoryListing> {
  const resolved = path.resolve(target)
  const dirents = await fs.readdir(resolved, { withFileTypes: true })
  const entries: BrowseEntry[] = []
  let truncated = false
  for (const dirent of dirents) {
    if (entries.length >= MAX_ENTRIES) {
      truncated = true
      break
    }
    const full = path.join(resolved, dirent.name)
    if (dirent.isSymbolicLink()) {
      const reached = await fs.stat(full).catch(() => null)
      if (reached?.isDirectory() !== true) continue
      const link = await fs.readlink(full).catch(() => null)
      entries.push(link === null ? { name: dirent.name, path: full } : { name: dirent.name, path: full, link })
      continue
    }
    if (dirent.isDirectory()) entries.push({ name: dirent.name, path: full })
  }
  entries.sort((left, right) => left.name.localeCompare(right.name))
  const parent = path.dirname(resolved)
  return {
    path: resolved,
    display: displayPath(resolved),
    parent: parent === resolved ? null : parent,
    crumbs: crumbsOf(resolved),
    entries,
    truncated,
  }
}

/**
 * Whether a folder exists and can be entered as one.
 *
 * @param target — the path a form reported.
 * @returns true when the path resolves to a directory.
 */
export async function isDirectory(target: string): Promise<boolean> {
  const stat = await fs.stat(target).catch(() => null)
  return stat?.isDirectory() === true
}
