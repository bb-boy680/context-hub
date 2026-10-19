/**
 * The text a prompt becomes when it is delivered as a file.
 *
 * A command, an agents file and a rule all write one file named after the
 * prompt, and the difference between them is exactly this module: a command and
 * an agents file put the frontmatter an agent needs in front of the body, while
 * a rule (and an install) is the prompt as it was written. Keeping all of them
 * in one function is what stops the files drifting apart.
 *
 * Text is normalised here and nowhere else, so a prompt typed on Windows and a
 * prompt typed in the browser land on disk byte for byte the same.
 */

/** The delimiter an agent's frontmatter block is fenced with. */
const DELIMITER = "---"

/** How much of a body becomes a description when none was given. */
const DESCRIPTION_LIMIT = 80

/** What one delivery writes. */
export interface CommandFileInput {
  /** The prompt's display name; the frontmatter carries it. */
  name: string
  /** A sentence for the frontmatter; derived from the body when absent. */
  description?: string
  /** The prompt itself, as it was typed. */
  body: string
  /** Whether to put the block an agent reads ahead of the body. */
  frontmatter: boolean
}

/** Strip a BOM and settle on LF, so a round trip is byte-stable. */
function normalize(text: string): string {
  return text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n")
}

/** The first line of a body that says something, trimmed of markdown leaders. */
export function describeBody(body: string): string {
  for (const raw of normalize(body).split("\n")) {
    /* Every leader, not just the first: "## Heading" is a heading, and a
       description left as "# Heading" would then need quoting to stay YAML. */
    const line = raw.replace(/^\s*(?:[#>*+-]+\s*|\d+\.\s*)+/, "").trim()
    if (line === "") continue
    return line.length > DESCRIPTION_LIMIT
      ? `${line.slice(0, DESCRIPTION_LIMIT - 1).trimEnd()}…`
      : line
  }
  return ""
}

/**
 * Render one YAML scalar.
 *
 * A description is one line of a bare-scalar document, so almost anything that
 * is not alphanumeric has to be quoted — a colon followed by a space, a leading
 * indicator, and a trailing space each mean something to a YAML reader. Quoting
 * is the narrow answer: a description that needs none stays readable.
 */
function scalar(value: string): string {
  const plain = value.replace(/\s+/g, " ").trim()
  if (plain !== "" && /^[A-Za-z0-9][A-Za-z0-9 .,'()/&+-]*$/.test(plain)) return plain
  return `"${plain.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

/**
 * The whole file one delivery writes.
 *
 * @param input — the prompt and whether this file is a command.
 * @returns the file's text, LF-terminated, with exactly one trailing newline.
 */
export function commandFile(input: CommandFileInput): string {
  const body = normalize(input.body).replace(/\s+$/, "")
  if (!input.frontmatter) return body === "" ? "" : `${body}\n`
  const description = (input.description ?? "").trim() || describeBody(input.body)
  const lines = [`name: ${scalar(input.name)}`]
  if (description !== "") lines.push(`description: ${scalar(description)}`)
  return `${DELIMITER}\n${lines.join("\n")}\n${DELIMITER}\n\n${body}\n`
}
