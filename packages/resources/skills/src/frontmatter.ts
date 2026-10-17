/**
 * SKILL.md frontmatter reading and writing. Parse reads the keys the hub owns;
 * write renders the starter block of a newly created skill.
 *
 * The block is real YAML, not a list of `key: value` lines. A description is
 * routinely written as a block scalar — `description: |` with the sentences
 * under it — and quoted values, flow lists and nested keys are all ordinary.
 * Reading it line by line loses every one of those: the indicator becomes the
 * value and the sentence under it becomes nothing. So the block goes through
 * js-yaml, and only the three keys below are taken from it. A block that does
 * not parse yields no fields rather than an error: a hand-written manifest the
 * hub cannot read must still list, and losing a description is better than
 * losing the skill.
 */

import { CORE_SCHEMA, dump, load } from "js-yaml"

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

/** Split a SKILL.md into its raw frontmatter block and the remaining body. */
function split(text: string): { block: string | null; body: string } {
  /* Editors on Windows save a BOM; it must not hide the opening delimiter. */
  const normalized = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).replace(
    /\r\n/g,
    "\n"
  )
  if (!normalized.startsWith(`${DELIMITER}\n`)) {
    return { block: null, body: normalized }
  }
  const end = normalized.indexOf(`\n${DELIMITER}`, DELIMITER.length)
  if (end < 0) return { block: null, body: normalized }
  const block = normalized.slice(DELIMITER.length + 1, end)
  const body = normalized.slice(end + DELIMITER.length + 1).replace(/^\n/, "")
  return { block, body }
}

/** Read the hub's fields out of one YAML block, or nothing when it will not parse. */
function fieldsOf(block: string): Frontmatter {
  let parsed: unknown
  try {
    parsed = load(block, { schema: CORE_SCHEMA })
  } catch {
    /* An unreadable block hides no skill: it reads as one that says nothing. */
    return {}
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {}
  }
  const record = parsed as Record<string, unknown>
  const frontmatter: Frontmatter = {}
  if (typeof record.name === "string") frontmatter.name = record.name
  /*
   * The edges go, the inside stays: a literal block carries the author's line
   * breaks and blank lines, and those are the description, not formatting.
   */
  if (typeof record.description === "string") {
    frontmatter.description = record.description.trim()
  }
  if (Array.isArray(record.tags)) {
    frontmatter.tags = record.tags.filter(
      (tag): tag is string => typeof tag === "string"
    )
  }
  return frontmatter
}

/** Parse the frontmatter of a SKILL.md. */
export function parseSkillFile(text: string): ParsedSkillFile {
  const { block, body } = split(text)
  return { frontmatter: block === null ? {} : fieldsOf(block), body }
}

/** The starter SKILL.md a newly created skill receives. */
export function starterSkillFile(draft: {
  name: string
  description: string
  tags?: string[]
}): string {
  /* Rendered by the same YAML writer that parses it, so a description carrying
     a colon, a `#`, or a line break cannot produce a block nothing can read. */
  const block = dump(
    {
      name: draft.name,
      description: draft.description,
      tags: draft.tags ?? [],
    },
    { lineWidth: -1 }
  ).trimEnd()
  return `${DELIMITER}\n${block}\n${DELIMITER}\n\n\n`
}
