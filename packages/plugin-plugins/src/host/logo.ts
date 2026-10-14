/**
 * Finding the picture a pack ships for itself, and keeping the hub's copy of it.
 *
 * A pack's manifest may name an icon, and most do not; what nearly every pack
 * does have is a file whose name says what it is. Which file that is follows the
 * rule in `../pictures.ts`, which a page applies to the tree it has already read
 * so a row can offer the picture this will store; this module is the walk over a
 * directory, and the copy the hub keeps.
 *
 * What is found is *copied* rather than referenced inside the pack: a record
 * holds one kind of reference, and a reference that only resolves while the pack
 * is installed is not one. Storing is the asset store's job — one flat
 * directory, names carrying the pack's own so no two packs share a file.
 *
 * The walk is bounded — depth and entries — because a pack is somebody else's
 * repository and may carry a whole website's worth of images.
 *
 * This module runs in the process that owns the disk.
 */
import { promises as fs } from "node:fs"
import path from "node:path"

import { assetLimit, assetKind, isLink } from "@workspace/core"
import type { AssetStore } from "@workspace/core"

import { bestPicture, PICTURE_DEPTH, PICTURE_SKIPPED, PICTURE_TYPES, pictureOf } from "../pictures.ts"
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
 * Keep the picture a pack ships for itself.
 *
 * @param assets — the hub's asset store, which names and keeps the file.
 * @param packDir — the pack's directory.
 * @param name — the pack's name, which prefixes the file so no two packs share one.
 * @param relative — the picture's path inside the pack.
 * @returns the stored reference, or undefined when the picture is larger than this hub keeps — a pack is worth having for more than its picture, so an oversized one costs the picture rather than the pack.
 */
export async function storePicture(
  assets: AssetStore,
  packDir: string,
  name: string,
  relative: string
): Promise<string | undefined> {
  const bytes = await fs.readFile(path.join(packDir, relative)).catch(() => null)
  if (bytes === null) return undefined
  const kind = assetKind(relative)
  if (bytes.byteLength > assetLimit(kind)) return undefined
  const file = new File([bytes], `${name}-${path.basename(relative)}`, {
    type: PICTURE_TYPES[path.extname(relative).toLowerCase()] ?? "",
  })
  return await assets.put(file)
}
