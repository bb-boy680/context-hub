/**
 * The prompt library's seam: what the page asks for and what a form answers
 * with. One implementation reads and writes the library in the process that
 * owns the disk; the browser form sends the same calls over its own channel, so
 * nothing here assumes a transport.
 *
 * A record is written the way a person reads it: `name` is the short title,
 * `description` the sentence under it, `prompt` the text. The field names are
 * the file's own, so the file and this shape stay one thing and a hand edit
 * needs no translation.
 *
 * A row is known by an id, opaque and written down the first time the row is,
 * so a name can be corrected without the row changing what it is: the id is what
 * the page keys on and what `update` and `remove` are given. The name is what a
 * delivery names its file after, so a second row whose name would reach that
 * same file is refused — which is a collision between two file names, not a
 * claim on the wording.
 */
import type { AssetKind } from "@context-hub/core"

/**
 * Route this library answers on, whichever channel the form carries it over.
 *
 * One home for it on both sides of the wire: the browser store and the host
 * bridge each used to spell it themselves, so the two ends of a call could
 * drift apart with nothing to notice — a route is a string, not a type.
 */
export const PROMPT_ROUTE = "/hub/prompts"

/** One prompt, as the library stores it and as a card draws it. */
export interface Prompt {
  /**
   * The row's identity, opaque and never rewritten.
   *
   * Written when the row is created, so a name can be corrected without the row
   * becoming another one. A file written by hand before this module existed
   * carries none, and the name its description makes stands in for it as it is
   * read.
   */
  id?: string
  /**
   * The short title, and what a delivered file is named from.
   *
   * A title is a phrase and a description is a sentence, so they are two fields
   * rather than one: the file name has to stay usable in an agent's own command
   * list, and a description written well runs past that. A row written before
   * this field existed carries none, and its description stands in as it is read.
   */
  name: string
  /** The sentence under the title: what it is for, in as much detail as helps. */
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
   * The text of a prompt is what a card draws, so these are shown where the
   * whole prompt is read — the detail dialog's picture tab — and nowhere else.
   * Each is a remote URL the hub only references, or a path into the hub's own
   * asset directory.
   */
  assets: string[]
}

/** One piece of media a prompt references. */
export interface PromptAsset {
  /** The recorded reference: a remote URL, or a path relative to the hub home. */
  ref: string
  kind: AssetKind
}

/** One row with the id it answers to; a hand-written row gets one as it is read. */
export interface StoredPrompt extends Prompt {
  /** The id `update` and `remove` are given, and what the page keys on. */
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
  name: string
  description: string
  prompt: string
  tags?: readonly string[]
}

/**
 * What an edit hands over.
 *
 * Every field is optional and an omitted one is left as it is. Correcting the
 * name or the description is the same act as correcting the text — a row read
 * wrong and put right — which is why it does not move the row to another id.
 */
export interface PromptPatch {
  name?: string
  description?: string
  prompt?: string
  tags?: readonly string[]
}

/** Reading and changing the library. */
export interface PromptStore {
  /** Every prompt, with the categories in use. */
  list(): Promise<PromptPage>
  /**
   * Add one.
   *
   * @throws when another prompt's file name would be the same one; the name is
   * what a delivery writes, so two of them cannot share a file.
   */
  create(draft: PromptDraft): Promise<StoredPrompt>
  /**
   * Change one prompt: its name, its description, its text, or any of them.
   *
   * @throws when no row answers to `id`, or when the new name would reach the
   * file another row already delivers to.
   */
  update(id: string, patch: PromptPatch): Promise<StoredPrompt>
  /** Delete one by its id. A row that is not there is not an error. */
  remove(id: string): Promise<void>
  /** Take over one uploaded file, record it, and answer with its reference. */
  putAsset(id: string, file: File): Promise<PromptAsset>
  /**
   * Add one pasted source. A remote address is recorded as it is; a `data:`
   * source is stored as a file the hub owns.
   */
  addAssetSource(id: string, source: string): Promise<PromptAsset>
  /** Drop one reference, deleting the stored file when the hub owns it. */
  deleteAsset(id: string, ref: string): Promise<void>
  /** The URL that shows one reference; a remote URL passes through unchanged. */
  assetUrl(ref: string): string
}
