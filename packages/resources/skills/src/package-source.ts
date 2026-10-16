/**
 * The Package field speaks the vocabulary of the `skills` CLI, so the field has
 * to read back what a person pastes there: a bare source, an `owner/repo@skill`
 * pin, or a whole `npx skills add …` command copied out of a README. Parsing
 * lives here rather than in the dialog because the two things it produces — the
 * source and the skills to take — are what every form of the download needs.
 */

/** What one download was asked for. */
export interface PackageRequest {
  /** What the CLI fetches: `owner/repo`, a git URL, or a link to a SKILL.md. */
  source: string
  /** Skills pinned inside the package; empty means every skill it holds. */
  skills: string[]
}

/** Flags that take their value from the next token, whatever that value means. */
const VALUE_FLAGS = new Set([
  "-a",
  "--agent",
  "-s",
  "--skill",
  "--source",
  "--path",
  "--dir",
])

const SKILL_FLAGS = new Set(["-s", "--skill"])

/** Drop one layer of surrounding quotes from a token. */
function unquote(token: string): string {
  const first = token[0]
  if (first !== '"' && first !== "'") return token
  return token.endsWith(first) && token.length > 1 ? token.slice(1, -1) : token
}

/**
 * Split `owner/repo@skill` into its two halves. Only that shorthand carries a
 * pin: on a URL the `@` separates credentials, and the CLI fails when one is
 * glued to it, so a URL is answered unchanged.
 */
function splitPin(source: string): { source: string; skill?: string } {
  if (
    source.includes("://") ||
    source.startsWith(".") ||
    source.startsWith("/") ||
    source.includes("\\")
  ) {
    return { source }
  }
  const at = source.lastIndexOf("@")
  if (at <= 0 || at === source.length - 1) return { source }
  const head = source.slice(0, at)
  /* A scope or path that is missing a half is not a pin, it is a broken source. */
  if (!head.includes("/")) return { source }
  return { source: head, skill: source.slice(at + 1) }
}

/**
 * Read the Package field.
 *
 * @param input — what the person typed or pasted.
 * @returns the source to fetch and the skills pinned by name. A command prefix
 *   (`npx skills[@version] add`) and every flag are dropped; flags that would
 *   change where the CLI writes are ignored, because the hub always installs
 *   into its own directory.
 */
export function parsePackageRequest(input: string): PackageRequest {
  const tokens = input
    .trim()
    .split(/\s+/)
    .map(unquote)
    .filter((token) => token !== "")

  if (tokens[0] === "npx") tokens.shift()
  if (tokens[0] !== undefined && /^skills(@.+)?$/.test(tokens[0])) tokens.shift()
  if (tokens[0] === "add") tokens.shift()

  let source = ""
  const skills: string[] = []
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    const inline = /^(--skill|-s)=(.+)$/.exec(token)
    if (inline !== null) {
      skills.push(inline[2])
      continue
    }
    if (SKILL_FLAGS.has(token)) {
      const pinned = tokens[index + 1]
      if (pinned !== undefined) skills.push(pinned)
      index += 1
      continue
    }
    if (token.startsWith("-")) {
      /* Another flag's value is never a source; skip what it points at. */
      if (VALUE_FLAGS.has(token)) index += 1
      continue
    }
    if (source === "") source = token
  }

  const pinned = splitPin(source)
  if (pinned.skill !== undefined) skills.push(pinned.skill)

  return { source: pinned.source, skills: [...new Set(skills)] }
}
