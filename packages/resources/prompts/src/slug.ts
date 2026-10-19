/**
 * The one place a prompt's name becomes a file name.
 *
 * Four actions write a file named after the prompt — install, generate a
 * command, generate a rule, generate an agents file — so they all call this,
 * and a name reaches the same file from any of them. It is also the trust
 * boundary: the name is typed into a dialog, and everything downstream
 * (`PlaceRef.file`, the dev bridge's `assertPlaceFile`) validates by splitting
 * on `/`, which a backslash walks straight past. So the safety is settled here
 * rather than borrowed.
 *
 * Letters and digits of any script survive — a name written in Chinese should
 * read as itself on disk, not collapse to an empty string.
 */

/** Names Windows gives to devices, which no file may take. */
const RESERVED = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  ...Array.from({ length: 9 }, (_, at) => `com${at + 1}`),
  ...Array.from({ length: 9 }, (_, at) => `lpt${at + 1}`),
])

/** How much of a name a file name keeps; long enough to stay readable. */
const LIMIT = 64

/**
 * Turn a display name into the file name its actions write under.
 *
 * @param name — the name as it was typed.
 * @returns a name that is safe on every platform and never empty.
 * @throws never; a name with nothing usable in it falls back to a digest, since
 * refusing here would make the dialog's own validation the only guard.
 */
export function slugOf(name: string): string {
  const cleaned = name
    .normalize("NFC")
    .toLowerCase()
    /* Everything that is not a letter or a digit becomes the separator: this
       covers path separators, the reserved punctuation, and control characters
       in one rule rather than a deny list that can be walked around. */
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
  /* Slicing can leave the separator it cut through. */
  const clipped = cleaned.slice(0, LIMIT).replace(/-+$/g, "")
  if (clipped !== "" && !RESERVED.has(clipped)) return clipped
  /* Nothing survived — a name of punctuation only, or a device name. */
  return `p${digest(name)}`
}

/**
 * A short, stable mark of a name, for the names that leave nothing behind.
 *
 * FNV-1a over the code points, in base 36: not a security hash, just the same
 * answer every time so a second click reaches the file the first one made.
 */
function digest(name: string): string {
  let hash = 0x811c9dc5
  for (const character of name.normalize("NFC")) {
    for (const byte of new TextEncoder().encode(character)) {
      hash = Math.imul((hash ^ byte) >>> 0, 0x01000193) >>> 0
    }
  }
  return hash.toString(36)
}
