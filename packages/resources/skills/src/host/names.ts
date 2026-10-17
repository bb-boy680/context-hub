/** The names the library writes, and the one place that refuses a dangerous one. */

/** Names Windows refuses as a directory whatever the case or extension. */
const DEVICES = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  ...Array.from({ length: 9 }, (_unused, at) => `com${at + 1}`),
  ...Array.from({ length: 9 }, (_unused, at) => `lpt${at + 1}`),
])

/** Whether a name is one Windows would refuse to create. */
function isDevice(name: string): boolean {
  return DEVICES.has(name.toLowerCase())
}

/**
 * Reject a skill directory name that would write outside the library root.
 *
 * @param name — the folder name a skill is about to take on disk.
 * @returns the same name, so callers can use it inline.
 */
export function assertSkillName(name: string): string {
  if (
    name === "" ||
    name === "." ||
    name === ".." ||
    name.startsWith(".") ||
    name.includes("/") ||
    name.includes("\\") ||
    isDevice(name)
  ) {
    throw new Error(`unusable skill name: ${name}`)
  }
  return name
}

/**
 * The name a newly created skill takes, which is also the directory it lives
 * in and the name every action targets.
 *
 * It has to survive a round trip through the filesystem, so it may not carry a
 * separator, a device name, or a trailing space or dot — Windows silently
 * strips those, and the name would stop matching the directory. Nothing
 * narrows the characters further: a name with spaces is still a name a person
 * wrote, and the hub has no reason to rename it.
 *
 * @param name — the name a person asked for.
 * @returns the same name, so callers can use it inline.
 */
export function assertNewSkillName(name: string): string {
  if (name.trim() !== name) {
    throw new Error(`a skill name may not start or end with a space: "${name}"`)
  }
  assertSkillName(name)
  if (name.endsWith(".")) {
    throw new Error(`a skill name may not end with a dot: ${name}`)
  }
  return name
}
