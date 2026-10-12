/**
 * Everything a client extension needs to read and write its own file: the
 * declaration both sides agree on, the two format editors, and the failure
 * shape. It travels as one value on the `mcp` service, because an installed
 * plugin is a directory downloaded from somewhere and imports nothing — the
 * module it would have imported from is not on its disk.
 *
 * A package built inside this repo may import the same functions directly; they
 * are the same functions either way, so a provider written here and one
 * downloaded from elsewhere behave identically.
 */
import { parse } from "smol-toml"

import {
  declarationLine,
  readDeclaration,
  splitArguments,
  writeDeclaration,
  type McpDeclaration,
  type McpEntryValues,
} from "./declaration.ts"
import { McpError, mcpFailure, type McpFailure } from "./failure.ts"
import { editJson, jsonValueLines, parseJsonc, readJsonObject, valueAt } from "./jsonc.ts"
import {
  clearTomlEntry,
  isBareKey,
  setTomlEntry,
  setTomlField,
  tomlEntryLines,
  writeTomlKey,
  writeTomlString,
  type TomlEntryValues,
} from "./toml.ts"

/** The declaration helpers a provider writes an entry with. */
export interface McpDeclarationTools {
  /** Read one client file's entry into a declaration, or null when it holds none. */
  readDeclaration(value: unknown): McpDeclaration | null
  /** The entry a client file holds for one declaration. */
  writeDeclaration(declaration: McpDeclaration): McpEntryValues
  /** The command with its arguments, or the URL, as one line. */
  declarationLine(declaration: McpDeclaration): string
  /** An argument line split into arguments, quotes grouping a run with spaces. */
  splitArguments(line: string): string[]
}

/** The JSONC editor, for a client whose file is JSON with comments. */
export interface McpJsonTools {
  /**
   * The text with one path set to `value`, or with that path taken out when
   * `value` is `undefined`. Every other byte stays as it stands.
   *
   * @throws when the text is not JSONC, when the edit cannot be expressed, or
   * when the edited text differs from the original outside that path.
   */
  editJson(
    text: string | null,
    path: readonly (string | number)[],
    value: unknown
  ): string
  /** The JSON object a file holds, or null when the file holds nothing at all. */
  readJsonObject(text: string | null): Record<string, unknown> | null
  /** A JSONC document's value; throws when the text is not JSONC. */
  parseJsonc(text: string): unknown
  /** The value a path leads to, or `undefined` when it leads nowhere. */
  valueAt(document: unknown, path: readonly (string | number)[]): unknown
  /** The 1-based lines one value occupies, or null when the path leads nowhere. */
  jsonValueLines(text: string, path: readonly (string | number)[]): [number, number] | null
}

/** The TOML editor, for a client whose file is TOML. */
export interface McpTomlTools {
  /**
   * A TOML document parsed into plain values. This is here because a plugin
   * that arrived as a folder has no parser of its own to import.
   *
   * @throws when the text is not TOML.
   */
  parseToml(text: string): Record<string, unknown>
  /** Add or replace one entry, leaving every other entry alone. */
  setTomlEntry(text: string, table: string, name: string, values: TomlEntryValues): string
  /** Change one field of one entry, leaving the rest of the file alone. */
  setTomlField(
    text: string,
    table: string,
    name: string,
    field: string,
    value: string | boolean
  ): string
  /** Remove one entry and its sub-tables. */
  clearTomlEntry(text: string, table: string, name: string): string
  /** The 1-based lines one entry occupies, or null when the file holds none. */
  tomlEntryLines(text: string, table: string, name: string): [number, number] | null
}

/** How a provider reports what went wrong. */
export interface McpFailureTools {
  /**
   * A failure the provider already named, so the screen shows its own sentence
   * rather than a stack line. The key is the provider's, and its own language
   * pack translates it.
   */
  McpError: typeof McpError
  /** The failure a caught value stands for, for a caller that catches broadly. */
  mcpFailure(error: unknown, fallback: string): McpFailure
}

/**
 * What {@link McpRegistry.tools} carries: the whole toolkit, in one value a
 * plugin that imports nothing can take apart.
 */
export interface McpTools
  extends McpDeclarationTools,
    McpJsonTools,
    McpTomlTools,
    McpFailureTools {
  /** A key written the way TOML spells it, quoted when it is not bare. */
  writeTomlKey(name: string): string
  /** A string written as a TOML basic string. */
  writeTomlString(value: string): string
  /** Whether a name can be written as a bare TOML key. */
  isBareKey(name: string): boolean
}

/** A TOML document parsed into plain values, for a plugin with no parser of its own. */
function parseToml(text: string): Record<string, unknown> {
  return parse(text) as Record<string, unknown>
}

/** The toolkit itself, assembled in one place so nothing can go missing from it. */
export const mcpTools: McpTools = {
  readDeclaration,
  writeDeclaration,
  declarationLine,
  splitArguments,
  editJson,
  readJsonObject,
  parseJsonc,
  valueAt,
  jsonValueLines,
  parseToml,
  setTomlEntry,
  setTomlField,
  clearTomlEntry,
  tomlEntryLines,
  writeTomlKey,
  writeTomlString,
  isBareKey,
  McpError,
  mcpFailure,
}
