/** The names the library writes, and the one place that refuses a dangerous one. */

/** Characters Windows refuses in a file name, plus the separators on both platforms. */
const RESERVED = /[<>:"|?*]/
/** Device names Windows will not accept as a directory name, whatever the extension. */
const DEVICES = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i

/**
 * Reject a pack name that would write outside the library root, or that no
 * filesystem would take. The name is a directory name and the id every client
 * will know the pack by, so both are judged here.
 *
 * @param name — the directory name a pack is about to take on disk.
 * @param what — what the name belongs to, for the refusal to name it.
 * @returns the same name, so callers can use it inline.
 * @throws {Error} for a name that is empty, hidden, a path, a control character, or a reserved device.
 */
export function assertSafeSegment(name: string, what: string): string {
  const hasControl = [...name].some((character) => character.codePointAt(0)! < 0x20)
  if (
    name === "" ||
    name === "." ||
    name === ".." ||
    name.startsWith(".") ||
    name.includes("/") ||
    name.includes("\\") ||
    RESERVED.test(name) ||
    hasControl ||
    DEVICES.test(name) ||
    name !== name.trim()
  ) {
    throw new Error(`unusable ${what}: ${JSON.stringify(name)}`)
  }
  return name
}

/**
 * Reject a path that would be written outside the pack it belongs to. A folder a
 * person chose arrives from a page as a list of paths, so every one of them is
 * judged before it names a file to write.
 *
 * @param path — a file's path inside the chosen folder, with `/` separators.
 * @returns the same path, so callers can use it inline.
 * @throws {Error} for an empty path, an absolute one, or one with a `..`, `\`, or `:` segment.
 */
export function assertPackRelative(path: string): string {
  const parts = path.split("/")
  const unusable = (part: string) =>
    part === "" || part === "." || part === ".." || part.includes("\\") || part.includes(":")
  if (path === "" || path.startsWith("/") || parts.some(unusable)) {
    throw new Error(`unusable path in the folder: ${JSON.stringify(path)}`)
  }
  return parts.join("/")
}
