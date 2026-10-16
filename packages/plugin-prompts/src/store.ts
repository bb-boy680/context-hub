/**
 * The prompt library's seam: what the page asks for and what a form answers
 * with. One implementation reads and writes the library in the process that
 * owns the disk; the browser form sends the same calls over its own channel, so
 * nothing here assumes a transport.
 *
 * A record is written the way a person reads it: `description` names it,
 * `prompt` is the text. The field names are the file's own, so the file and
 * this shape stay one thing and a hand edit needs no translation.
 *
 * There is no separate id. A row is known by the file name its description
 * makes — the same name a delivery writes — so nothing has to stay in step with
 * a second identity, and a description that would collide with another row's
 * name is refused rather than allowed to overwrite it.
 */

/** One prompt, as the library stores it and as a card draws it. */
export interface Prompt {
  /** The name it is known by, and what its file name is made from. */
  description: string
  /** The prompt itself. */
  prompt: string
  /** Categories it belongs to, shared with the other asset kinds. */
  tags: string[]
  /** ISO timestamp of the last write to it. */
  updatedAt: string
  /**
   * Media references, kept where a person put them.
   *
   * Nothing writes one yet: a prompt is its text, and the card draws that. The
   * field is here because the library file has it, and dropping a field a
   * person may have written by hand would be losing their data.
   */
  assets: string[]
}

/** One row with the name it answers to; `id` is derived, never stored. */
export interface StoredPrompt extends Prompt {
  /** The file name `description` makes, which is the row's key. */
  id: string
}

/** What the page draws from one read. */
export interface PromptPage {
  items: StoredPrompt[]
  total: number
  /** Every category in use across the library, for the filter bar. */
  tags: string[]
  /** Where the library lives, as a person reads it. */
  root: string
}

/** What the add dialog hands over. */
export interface PromptDraft {
  description: string
  prompt: string
  tags?: readonly string[]
}

/** Reading and changing the library. */
export interface PromptStore {
  /** Every prompt, with the categories in use. */
  list(): Promise<PromptPage>
  /**
   * Add one.
   *
   * @throws when another prompt's file name would be the same one; the file
   * name is what a delivery writes, so two of them cannot share it.
   */
  create(draft: PromptDraft): Promise<StoredPrompt>
  /** Delete one by its id. A row that is not there is not an error. */
  remove(id: string): Promise<void>
}
