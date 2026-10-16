/** The names the library writes, and the one place that refuses a dangerous one. */

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
    name.includes("\\")
  ) {
    throw new Error(`unusable skill name: ${name}`)
  }
  return name
}
