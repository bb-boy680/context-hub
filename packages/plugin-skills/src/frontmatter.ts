/**
 * SKILL.md frontmatter reading and rewriting. Parse reads the keys the hub
 * owns; write replaces only those lines, so hand-written keys, comments, and
 * ordering survive a round trip through the editor.
 */

const DELIMITER = "---"

/** The fields the hub owns in a skill's frontmatter. */
export interface Frontmatter {
  name?: string
  description?: string
  tags?: string[]
}

/** A parsed SKILL.md: its frontmatter fields and the body after the block. */
export interface ParsedSkillFile {
  frontmatter: Frontmatter
  body: string
}

/** One `key: value` line of the frontmatter block. */
interface Line {
  key: string
  /** Raw text after the colon, trimmed. */
  value: string
}

/** Split a SKILL.md into its frontmatter lines and the remaining body. */
function split(text: string): { lines: Line[]; body: string } {
  /* Editors on Windows save a BOM; it must not hide the opening delimiter. */
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n")
  if (!normalized.startsWith(`${DELIMITER}\n`)) {
    return { lines: [], body: normalized }
  }
  const end = normalized.indexOf(`\n${DELIMITER}`, DELIMITER.length)
  if (end < 0) return { lines: [], body: normalized }
  const block = normalized.slice(DELIMITER.length + 1, end)
  const body = normalized.slice(end + DELIMITER.length + 1).replace(/^\n/, "")
  const lines: Line[] = []
  for (const raw of block.split("\n")) {
    const match = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(raw)
    if (match) lines.push({ key: match[1], value: match[2].trim() })
  }
  return { lines, body }
}

/** Strip one layer of matching quotes. */
function unquote(value: string): string {
  if (value.length >= 2 && (value.startsWith('"') || value.startsWith("'"))) {
    const quote = value[0]
    if (value.endsWith(quote)) return value.slice(1, -1)
  }
  return value
}

/** Read an inline list `[a, b]`, a comma list, or a single scalar. */
function parseList(value: string): string[] {
  const inner =
    value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value
  return inner
    .split(",")
    .map((item) => unquote(item.trim()))
    .filter((item) => item !== "")
}

/** Parse the frontmatter of a SKILL.md. */
export function parseSkillFile(text: string): ParsedSkillFile {
  const { lines, body } = split(text)
  const frontmatter: Frontmatter = {}
  for (const line of lines) {
    if (line.key === "name") frontmatter.name = unquote(line.value)
    else if (line.key === "description")
      frontmatter.description = unquote(line.value)
    else if (line.key === "tags") frontmatter.tags = parseList(line.value)
  }
  return { frontmatter, body }
}

/** Render one frontmatter line for a value. */
function render(key: string, value: string | string[]): string {
  if (Array.isArray(value)) return `${key}: [${value.join(", ")}]`
  return `${key}: ${value}`
}

/** The fields the hub owns in a skill's frontmatter. */
const OWNED = new Set(["name", "description", "tags"])

/**
 * Rewrite the hub-owned fields, preserving every other line of the file.
 *
 * @param text — the current SKILL.md contents.
 * @param next — fields to write; a field left out keeps the value already on
 *   disk, so writing tags alone does not drop the name and description.
 * @returns the new contents, with the frontmatter block first.
 */
export function writeSkillFile(text: string, next: Frontmatter): string {
  const { lines, body } = split(text)
  const current = new Map(lines.map((line) => [line.key, line.value]))
  const name = next.name ?? current.get("name")
  const description = next.description ?? current.get("description")
  const tags =
    next.tags ?? (current.has("tags") ? parseList(current.get("tags") ?? "") : undefined)
  const out: string[] = []
  if (name !== undefined) out.push(render("name", name))
  if (description !== undefined) out.push(render("description", description))
  if (tags !== undefined) out.push(render("tags", tags))
  /* Unknown keys keep their raw text, so hand-written values survive as they are. */
  for (const line of lines) {
    if (!OWNED.has(line.key)) out.push(`${line.key}: ${line.value}`)
  }
  const trimmedBody = body.replace(/\s*$/, "")
  return `${DELIMITER}\n${out.join("\n")}\n${DELIMITER}\n\n${trimmedBody}\n`
}

/** The starter SKILL.md a newly created skill receives. */
export function starterSkillFile(draft: {
  name: string
  description: string
  tags?: string[]
}): string {
  return writeSkillFile("", {
    name: draft.name,
    description: draft.description,
    tags: draft.tags ?? [],
  })
}
