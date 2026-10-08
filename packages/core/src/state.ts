/**
 * The hub's state documents: small JSON values the kernel and its extensions
 * keep between runs, one file per name under `<home>/state`. Names double as
 * file names, so they stay path-safe. Media lives in the asset library and
 * skill files live in the skill library; this is the space for everything a
 * feature wants to remember about itself.
 */

/** Route a form serves state documents on. */
export const STATE_ROUTE = "/hub/state"

/** Directory under the hub home that holds the documents. */
export const STATE_DIR = "state"

/**
 * Validate a state name: it becomes a file name, so it stays lowercase and free
 * of separators, spaces, and a leading dot.
 *
 * @param name — the requested document name.
 * @returns the same name, once it is known to be usable.
 */
export function assertStateName(name: string): string {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error(`state name is not allowed: ${name}`)
  }
  return name
}

/** The hub's state documents, owned by whoever holds the disk. */
export interface StateStore {
  /** Where the documents live, for display in settings and diagnostics. */
  readonly root: string
  /** Every document on disk, sorted by name; a name with no file is absent. */
  names(): Promise<string[]>
  /**
   * Read one document. The value is JSON the writer stored, so a reader
   * validates it; a file that is not JSON is an error, not an empty document.
   */
  read(name: string): Promise<unknown>
  /** Replace one document. */
  write(name: string, value: unknown): Promise<void>
}
