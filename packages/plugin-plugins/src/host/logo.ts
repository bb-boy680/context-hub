/**
 * Finding the picture a pack ships for itself, and keeping the hub's copy of it.
 *
 * A pack's manifest may name an icon, and most do not; what nearly every pack
 * does have is a file whose name says what it is. Which file that is follows the
 * rule in `../pictures.ts`, which a page applies to the tree it has already read
 * so a row can offer the picture this will store; this module is the walk over a
 * directory, and the copy that lands in the hub's asset library.
 *
 * What is found is *copied* rather than referenced inside the pack: a record
 * holds one kind of reference, and a reference that only resolves while the pack
 * is installed is not one.
 *
 * A pack's copies live in a directory of their own, `<assets>/<pack>/`. A pack's
 * name is unique in the library, so a directory named after one holds that pack's
 * files and nothing else — which is what lets the copies be removed exactly when
 * the pack is collected again or dropped. A flat `<pack>-<file>` name cannot say
 * where the pack's name ends, so nothing could tell one pack's file from another
 * named like it.
 *
 * The walk is bounded — depth and entries — because a pack is somebody else's
 * repository and may carry a whole website's worth of images.
 *
 * This module runs in the process that owns the disk.
 */
import { promises as fs } from "node:fs"
import path from "node:path"

import { ASSET_DIR, assetKind, assetLimit, isLink } from "@workspace/core"
import type { AssetLibrary } from "@workspace/core"
import { writeFileAtomic } from "@workspace/core/host/atomic"

import { bestPicture, PICTURE_DEPTH, PICTURE_SKIPPED, pictureOf } from "../pictures.ts"
import type { PackPicture } from "../pictures.ts"

/** How many files the walk will look at before it gives up and takes nothing. */
const MAX_ENTRIES = 4000

/** Walk one directory, collecting whatever might be the pack's picture. */
async function walk(
  root: string,
  at: string,
  depth: number,
  found: PackPicture[],
  budget: { left: number }
): Promise<void> {
  if (depth > PICTURE_DEPTH || budget.left <= 0) return
  const entries = await fs.readdir(at, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (budget.left <= 0) return
    if (entry.isDirectory()) {
      if (PICTURE_SKIPPED.includes(entry.name)) continue
      await walk(root, path.join(at, entry.name), depth + 1, found, budget)
      continue
    }
    if (!entry.isFile()) continue
    budget.left -= 1
    const relative = path.relative(root, path.join(at, entry.name)).split(path.sep).join("/")
    const picture = pictureOf(relative, depth)
    if (picture !== null) found.push(picture)
  }
}

/**
 * The picture a pack ships for itself.
 *
 * @param dir — the pack's directory.
 * @returns its path inside the pack, or undefined when the pack carries none.
 */
export async function findLogo(dir: string): Promise<string | undefined> {
  const found: PackPicture[] = []
  await walk(dir, dir, 1, found, { left: MAX_ENTRIES })
  return bestPicture(found)?.relative
}

/** Where one pack's copies are kept, as a path relative to the hub home. */
export function picturesOf(name: string): string {
  return `${ASSET_DIR}/${name}`
}

/** Whether a recorded asset is one this pack brought. */
export function ownsPicture(name: string, ref: string): boolean {
  return ref.startsWith(`${picturesOf(name)}/`)
}

/**
 * Whether a recorded asset is still there to be read. A link is somebody else's
 * address and is kept as written; anything else names a file this hub holds.
 *
 * @param home — the hub home, which a stored reference is relative to.
 * @param ref — one recorded reference.
 */
export async function assetPresent(home: string, ref: string): Promise<boolean> {
  if (isLink(ref)) return true
  return (await fs.stat(path.join(home, ...ref.split("/"))).catch(() => null)) !== null
}

/**
 * Copy one picture out of a pack into the hub's asset library.
 *
 * @param assets — the hub's asset library.
 * @param packDir — the pack's directory.
 * @param name — the pack's name, which is also the directory the copy is kept in.
 * @param relative — the picture's path inside the pack.
 * @returns the stored reference, or undefined when the picture is larger than this hub keeps — a pack is worth having for more than its picture, so an oversized one costs the picture rather than the pack.
 */
export async function storePicture(
  assets: AssetLibrary,
  packDir: string,
  name: string,
  relative: string
): Promise<string | undefined> {
  const bytes = await fs.readFile(path.join(packDir, relative))
  /* The hub's own library refuses an oversized file; a pack's picture is not
     worth failing a collection over, so this is where that limit is applied. */
  if (bytes.byteLength > assetLimit(assetKind(relative))) return undefined
  const file = path.basename(relative)
  const target = path.join(assets.root, name, file)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await writeFileAtomic(target, bytes)
  return `${picturesOf(name)}/${file}`
}

/** Drop every copy the hub keeps for one pack. A pack with none is not an error. */
export async function clearPictures(assets: AssetLibrary, name: string): Promise<void> {
  await fs.rm(path.join(assets.root, name), { recursive: true, force: true })
}
