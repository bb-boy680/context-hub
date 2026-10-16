/**
 * Adding a prompt to an agent's instruction file.
 *
 * The instruction file belongs to the person: they write other things in it,
 * they edit it between visits, and it may have been written on another
 * platform. So this adds one marked section and touches nothing else —
 * every other byte of the file comes back unchanged, including its newlines.
 *
 * The markers are what make a second click harmless: clicking "add to
 * CLAUDE.md" twice must leave one section, not two. Nothing in the agents'
 * own formats offers such a marker, so the hub carries its own, namespaced
 * and in a comment form that never renders.
 */

/** The two markers that fence a prompt's section, named after its file. */
const OPEN = (slug: string) => `<!-- context-hub:${slug} -->`
const CLOSE = (slug: string) => `<!-- /context-hub:${slug} -->`

/** One prompt, as a section of an instruction file. */
export interface SectionInput {
  /** The prompt's file name, which is also the section's identity. */
  slug: string
  /** The heading the section takes. */
  title: string
  /** The prompt itself. */
  body: string
}

/** The newline a file already uses, so adding a section does not rewrite it. */
function newlineOf(text: string): string {
  return text.includes("\r\n") ? "\r\n" : "\n"
}

/** Strip a BOM and settle on LF for the work in between. */
function toLf(text: string): string {
  return text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n")
}

/** The marked section on its own, in LF. */
function section(input: SectionInput): string {
  const body = toLf(input.body).replace(/\s+$/, "")
  const lines = [OPEN(input.slug), `## ${input.title}`, ""]
  if (body !== "") lines.push(body, "")
  lines.push(CLOSE(input.slug))
  return lines.join("\n")
}

/**
 * Put a prompt's section into an instruction file, replacing the one already
 * there under the same name.
 *
 * @param text — the file's current contents, or `null` when it is not there yet.
 * @param input — the prompt and the heading it takes.
 * @returns the file's new contents: the section replaced in place where it was,
 * appended at the end otherwise, with one trailing newline.
 */
export function withSection(text: string | null, input: SectionInput): string {
  const newline = text === null ? "\n" : newlineOf(text)
  const current = text === null ? "" : toLf(text).replace(/\s+$/, "")
  const block = section(input)

  const opened = current.indexOf(OPEN(input.slug))
  const next =
    opened < 0
      ? current === ""
        ? block
        : `${current}\n\n${block}`
      : (() => {
          /* A file that ends inside the block — someone deleted the closing
             marker — is still this block's, so the replacement runs to the end
             rather than starting a second one. */
          const closed = current.indexOf(CLOSE(input.slug), opened)
          const tail =
            closed < 0
              ? ""
              : current.slice(closed + CLOSE(input.slug).length).replace(/^\n+/, "")
          const head = current.slice(0, opened)
          return tail === "" ? `${head}${block}` : `${head}${block}\n\n${tail}`
        })()

  return newline === "\n" ? `${next}\n` : `${next.replace(/\n/g, newline)}${newline}`
}
