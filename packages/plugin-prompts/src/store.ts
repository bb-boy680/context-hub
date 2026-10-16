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
 * A row is known by an id that is written down the first time the row is, so a
 * description can be corrected without the row changing what it is: the id is
 * what the page keys on, what a delivery names its file after when it writes,
 * and what `update` and `remove` are given. A description that would name a row
 * another one already answers to is refused.
 */
import type { AssetKind } from "@workspace/core"

/** One prompt, as the library stores it and as a card draws it. */
export interface Prompt {
  /**
   * The name it is known by.
   *
   * Written when the row is created, from the description as it was then, and
   * never rewritten: fixing a typo in the description is a correction to the
   * row, not a second row. A file written by hand before this module existed
   * carries none, and one is derived for it as it is read.
   */
  id?: string
  /** The name it is read by, and what a delivered file is named from. */
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

/**
 * What an edit hands over.
 *
 * Every field is optional and an omitted one is left as it is. Correcting the
 * description is the same act as correcting the text — a row read wrong and put
 * right — which is why it does not move the row to another id.
 */
export interface PromptPatch {
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
   * @throws when another prompt's file name would be the same one; the file
   * name is what a delivery writes, so two of them cannot share it.
   */
  create(draft: PromptDraft): Promise<StoredPrompt>
  /**
   * Change one prompt: its text, its description, or both.
   *
   * @throws when no row answers to `id`, or when the new description would name
   * a row another one already answers to.
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
