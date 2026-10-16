/**
 * Which file is a pack's own picture.
 *
 * A pack's manifest may name an icon, and most do not; what nearly every pack
 * does have is a file whose name says what it is. The rule that reads one is here
 * rather than where it is applied, because it is applied twice: the host walks a
 * pack's directory to copy the picture into the hub's asset library, and a page
 * walks the tree it already read to preview the same picture while a folder is
 * being chosen. Both must agree, or a row would offer a picture the library then
 * says the pack does not have.
 *
 * Where a picture is looked for is a rule too: near the pack root, skipping the
 * directories that hold somebody else's files.
 *
 * This module imports nothing and runs on both sides of the wire.
 */

/** Extensions a picture the hub can serve is stored with, and the type each is one. */
export const PICTURE_TYPES: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
}

/** How deep below the pack root a picture may sit and still be the pack's own. */
export const PICTURE_DEPTH = 3

/** Directories that hold somebody else's files rather than the pack's own. */
export const PICTURE_SKIPPED: readonly string[] = [".git", "node_modules"]

/** A file that might be a pack's picture, and everything that ranks it. */
export interface PackPicture {
  /** Its path inside the pack, `/`-separated. */
  relative: string
  /** How far below the pack root it sits. */
  depth: number
  /** Its name is exactly `logo` or `icon`, rather than carrying one of them. */
  standalone: boolean
  /** Its name carries nothing saying which variant of the picture it is. */
  plain: boolean
}

/** Suffixes that mark a variant rather than the picture itself. */
const VARIANT =
  /(?:^|[-_.])(dark|light|small|large|sm|lg|xs|xl|2x|3x|@2x|@3x|mono|white|black|color|colour)(?:[-_.]|$)/i

/** Languages and locales a logo is often shipped in. */
const LOCALE = /(?:^|[-_.])([a-z]{2}|[a-z]{2}-[a-z]{2})(?:[-_.]|$)/i

/** Whether a file name says it is a logo or an icon. */
function namesPicture(stem: string): boolean {
  return /(?:^|[-_.])(?:logo|icon)(?:[-_.]|$)/i.test(stem)
}

/**
 * Read one file as a candidate for its pack's picture.
 *
 * This is the whole rule: whether the file sits near enough to the pack root,
 * whether it is a picture by name and by extension, and what ranks it. The two
 * callers differ only in how they reach the files.
 *
 * @param relative — its path inside the pack, `/`-separated.
 * @param depth — how far below the pack root it sits, the pack's own files being 1.
 * @returns what ranks it, or null when the file is not the pack's picture to offer.
 */
export function pictureOf(relative: string, depth: number): PackPicture | null {
  if (depth > PICTURE_DEPTH) return null
  const segments = relative.split("/")
  if (segments.slice(0, -1).some((one) => PICTURE_SKIPPED.includes(one))) return null
  const cut = relative.lastIndexOf(".")
  const slash = relative.lastIndexOf("/")
  const extension = cut > slash ? relative.slice(cut).toLowerCase() : ""
  if (PICTURE_TYPES[extension] === undefined) return null
  const stem = relative.slice(slash + 1, cut)
  if (!namesPicture(stem)) return null
  return {
    relative,
    depth,
    standalone: /^(?:logo|icon)$/i.test(stem),
    plain: !VARIANT.test(stem) && !LOCALE.test(stem),
  }
}

/**
 * Whether one candidate is the better picture: nearer the root, then a name that
 * is the word itself, then a name that says nothing extra, then path order, which
 * is only there so the same pack always answers the same way.
 */
function before(left: PackPicture, right: PackPicture): number {
  return (
    left.depth - right.depth ||
    Number(right.standalone) - Number(left.standalone) ||
    Number(right.plain) - Number(left.plain) ||
    left.relative.localeCompare(right.relative)
  )
}

/**
 * The picture among the files that were looked at.
 *
 * @param found — every file the walk took to be a candidate.
 * @returns the best one, or undefined when there was none.
 */
export function bestPicture(found: readonly PackPicture[]): PackPicture | undefined {
  return [...found].sort(before)[0]
}
