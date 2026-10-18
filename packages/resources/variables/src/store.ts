/**
 * The environment-variable library's seam: what the page asks for and what a
 * form answers with. One implementation reads and writes the library in the
 * process that owns the disk; the browser form sends the same calls over its
 * own channel, so nothing here assumes a transport.
 *
 * A variable is known by its name, which is also what an inserted `${NAME}`
 * names. The store therefore refuses two rows with the same name — that is the
 * one invariant the whole module rests on. A value is stored with the row: this
 * is the hub's own variable library, not a copy of the process environment.
 */

/** Route this library answers on, whichever channel the form carries it over. */
export const VARIABLE_ROUTE = "/hub/variables"

/** The name an environment variable can have: shell-safe and unambiguous. */
export const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

/** The group a new variable lands in when nothing else says otherwise. */
export const DEFAULT_GROUP = "通用"

/** One variable, as the library stores it and as the page draws it. */
export interface Variable {
  /** The identity: unique across the library. */
  name: string
  /** The group it is filed under, as a person named it. */
  group: string
  /** The value, stored with the row. */
  value: string
  /** ISO timestamp of the last write to it. */
  updatedAt: string
}

/** The whole library, which is what the page draws. */
export interface VariableDocument {
  version: 1
  /** Every group in the library, including ones that hold no variable today. */
  groups: string[]
  variables: Variable[]
}

/** What the create dialog hands over, one entry per row. */
export interface VariableDraft {
  name: string
  group?: string
  /** The value the row is created with; it is required. */
  value: string
}

/** What an edit hands over; an omitted field is left as it is. */
export interface VariablePatch {
  name?: string
  group?: string
  /** The replacement value; omitted leaves the stored one alone. */
  value?: string
}

/** Reading and changing the library. */
export interface VariableStore {
  /** The whole library, with the environment standing in for empty values. */
  read(): Promise<VariableDocument>
  /**
   * Add one or more variables in one write.
   *
   * @throws when a name is invalid or already taken — including twice inside
   *   the same batch — or when a row has no value. The name is the identity and
   *   the value is part of the record, so neither is filled in silently.
   */
  create(drafts: readonly VariableDraft[]): Promise<VariableDocument>
  /**
   * Change one variable by its current name.
   *
   * @throws when no row answers to `name`, when the new name is invalid or
   *   taken by another row, or when a field is sent with an unusable value.
   */
  update(name: string, patch: VariablePatch): Promise<VariableDocument>
  /** Delete one by name. A name that is not there is not an error. */
  remove(name: string): Promise<VariableDocument>
  /** Add a group, even before a variable uses it. A duplicate is a no-op. */
  createGroup(group: string): Promise<VariableDocument>
  /**
   * Rename a group; every variable filed under it follows.
   *
   * @throws when either name is empty, the source is the default group, the
   *   target is the default group, the source is not in the library, or the
   *   target is already taken. A rename to the same name is a no-op.
   */
  renameGroup(from: string, to: string): Promise<VariableDocument>
  /**
   * Delete a group; its variables move to the default group.
   *
   * @throws when the name is empty or is the default group. A group that is
   *   not in the library is a no-op.
   */
  removeGroup(group: string): Promise<VariableDocument>
}
