/**
 * The one place this hub writes a client's TOML file: a single `[table.name]`
 * entry — or one field of it — is added, replaced or removed, and every other
 * byte is left as it stands. Re-serializing the whole document is not an
 * option: the file belongs to the client, and a round trip through a serializer
 * would rewrite its quoting and drop its comments.
 *
 * Reading is a parser's job (the caller's, through smol-toml). Writing is a
 * line-range replacement followed by a check: the edited text is parsed again
 * and compared against the file it came from, and an edit whose outcome
 * differs from the one asked for is refused instead of written.
 */
import { parse } from "smol-toml"

import { canonical, messageOf, refuse, sameValue } from "./value.ts"

/** The values one entry carries: strings, booleans, string lists, and one sub-table of strings. */
export type TomlEntryValues = Record<
  string,
  string | boolean | string[] | Record<string, string>
>

/** Whether a name can be written as a bare TOML key. */
export function isBareKey(name: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(name)
}

/** A key written the way a table header or assignment must carry it. */
export function writeTomlKey(name: string): string {
  return isBareKey(name) ? name : `"${escapeTomlString(name)}"`
}

/** A string written as a TOML basic string. */
export function writeTomlString(value: string): string {
  return `"${escapeTomlString(value)}"`
}

function escapeTomlString(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("\t", "\\t")
    .replaceAll("\u0000", "\\u0000")
}

/**
 * Add or replace one entry, leaving every other entry of the file alone.
 *
 * @param text — the file's whole contents; empty for a file that is not there.
 * @param table — the top-level table the entry sits under, e.g. `mcp_servers`.
 * @param name — the entry's name, which is its key under that table.
 * @param values — what the entry carries; a nested map becomes a sub-table.
 * @returns the file's new contents.
 * @throws when the edited text does not parse, or when it differs from the
 * original outside the entry — the write is refused rather than written.
 */
export function setTomlEntry(
  text: string,
  table: string,
  name: string,
  values: TomlEntryValues
): string {
  const next = replaceRange(text, table, name, renderEntry(table, name, values))
  assertEntry(text, next, table, name, values)
  return next
}

/**
 * Change one field of one entry, leaving the rest of that entry and the whole
 * rest of the file as they stand. This is how a client is switched off without
 * its declaration being taken away.
 *
 * @param text — the file's whole contents.
 * @param table — the top-level table the entry sits under, e.g. `mcp_servers`.
 * @param name — the entry's name, which is its key under that table.
 * @param field — the field to write, e.g. `enabled`.
 * @param value — what that field is to hold.
 * @returns the file's new contents.
 * @throws when no entry of that table carries the name, or when the edited
 * text differs from the original outside that one field.
 */
export function setTomlField(
  text: string,
  table: string,
  name: string,
  field: string,
  value: string | boolean
): string {
  const lines = text.split("\n")
  const range = entryRange(lines, table, name)
  if (range === null) refuse(`[${table}.${name}] is not in this file`)
  const [start, end] = range

  const line = `${writeTomlKey(field)} = ${
    typeof value === "string" ? writeTomlString(value) : String(value)
  }`
  let at = -1
  for (let index = start + 1; index < end; index += 1) {
    if (assignmentKey(lines[index]) === field) {
      at = index
      break
    }
  }
  const written =
    at < 0
      ? [...lines.slice(0, start + 1), line, ...lines.slice(start + 1)]
      : [...lines.slice(0, at), line, ...lines.slice(at + 1)]

  const next = written.join("\n")
  assertField(text, next, table, name, field, value)
  return next
}

/**
 * Remove one entry and its sub-tables, leaving every other entry of the file
 * alone.
 *
 * @throws when the edited text does not parse, or when it differs from the
 * original outside the entry.
 */
export function clearTomlEntry(text: string, table: string, name: string): string {
  const next = replaceRange(text, table, name, null)
  assertEntry(text, next, table, name, undefined)
  return next
}

/**
 * The 1-based lines one entry occupies — its own table and its sub-tables —
 * for a pane that reads the entry apart from the rest of the file. Best
 * effort: null when no header names it or the found range does not hold it.
 */
export function tomlEntryLines(
  text: string,
  table: string,
  name: string
): [number, number] | null {
  const range = entryRange(text.split("\n"), table, name)
  if (range === null) return null
  const [start, end] = range
  return end <= start ? null : [start + 1, end]
}

/** The entry rendered as the tables a TOML file holds it as. */
function renderEntry(table: string, name: string, values: TomlEntryValues): string {
  const path = `${table}.${writeTomlKey(name)}`
  const lines: string[] = []
  const nested: [string, Record<string, string>][] = []

  for (const [key, value] of Object.entries(values)) {
    const written = writeTomlKey(key)
    if (typeof value === "string") lines.push(`${written} = ${writeTomlString(value)}`)
    else if (typeof value === "boolean") lines.push(`${written} = ${String(value)}`)
    else if (Array.isArray(value)) {
      lines.push(`${written} = [${value.map(writeTomlString).join(", ")}]`)
    } else nested.push([key, value])
  }

  const blocks = [`[${path}]\n${lines.join("\n")}`]
  for (const [key, fields] of nested) {
    const body = Object.entries(fields)
      .map(([field, value]) => `${writeTomlKey(field)} = ${writeTomlString(value)}`)
      .join("\n")
    blocks.push(`[${path}.${writeTomlKey(key)}]\n${body}`)
  }
  return blocks.join("\n\n")
}

/**
 * The text with the entry's tables replaced by `block`, which is null when the
 * entry is to be removed. When no header names the entry and the edit is an
 * insertion, the block is appended at the end.
 */
function replaceRange(text: string, table: string, name: string, block: string | null): string {
  const lines = text.split("\n")
  const range = entryRange(lines, table, name)
  if (range === null) {
    if (block === null) return text
    const body = text.replace(/\s+$/, "")
    return body === "" ? `${block}\n` : `${body}\n\n${block}\n`
  }
  const [start, end] = range
  const kept = [...lines.slice(0, start), ...lines.slice(end)]
  const body = kept.join("\n").replace(/\s+$/, "")
  if (block === null) return body === "" ? "" : `${body}\n`
  return body === "" ? `${block}\n` : `${body}\n\n${block}\n`
}

/**
 * The `[start, end)` line indices one entry's tables occupy — from the first
 * header naming it to the line before the next header that does not. Null when
 * no header names it.
 *
 * A line that starts with `[` inside a multi-line string would be misread as a
 * header; {@link assertEntry} is what keeps that from being written, because
 * the cut would leave the parse or the comparison different.
 */
function entryRange(lines: string[], table: string, name: string): [number, number] | null {
  let start = -1
  let end = -1
  for (let index = 0; index < lines.length; index += 1) {
    const path = headerPath(lines[index])
    if (path === null) continue
    const mine =
      path.length >= 2 && path[0] === table && path[1] === name
    if (mine) {
      if (start < 0) start = index
      end = index + 1
      continue
    }
    if (start >= 0) break
  }
  if (start < 0) return null
  /* The entry's last table owns every line up to the next header. */
  for (let index = end; index < lines.length; index += 1) {
    if (headerPath(lines[index]) !== null) break
    end = index + 1
  }
  return [start, end]
}

/** The dotted key path of a table header line, or null when the line is not a header. */
function headerPath(line: string): string[] | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith("[") || trimmed.startsWith("[[")) return null
  const close = trimmed.indexOf("]")
  if (close < 0) return null
  return splitKeyPath(trimmed.slice(1, close))
}

/** A dotted key path split at its dots, with quoted segments unquoted. */
function splitKeyPath(inner: string): string[] {
  const parts: string[] = []
  let part = ""
  let quote: string | null = null
  for (const char of inner) {
    if (quote !== null) {
      if (char === quote) quote = null
      else part += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === ".") {
      parts.push(part.trim())
      part = ""
      continue
    }
    part += char
  }
  parts.push(part.trim())
  return parts
}

/**
 * Prove an edit did what it was asked and nothing else: both texts parse, the
 * entry now holds what was asked (or is gone), and every other part of the
 * document is the one the file already had.
 *
 * @throws with the mismatch named, never with the file half-written — the
 * caller writes only what this accepted.
 */
function assertEntry(
  before: string,
  after: string,
  table: string,
  name: string,
  values: TomlEntryValues | undefined
): void {
  const [original, edited] = parseBoth(before, after)
  const asked = values === undefined ? undefined : canonical(values)
  if (!sameValue(canonical(entryOf(edited, table, name)), asked)) {
    refuse(`[${table}.${name}] does not hold what was asked`)
  }
  if (!sameValue(outside(original, table, name), outside(edited, table, name))) {
    refuse(`[${table}.${name}] is not the only change`)
  }
}

/**
 * Prove a field edit did what it was asked and nothing else: the entry still
 * holds everything it held, minus that field, and the rest of the document is
 * untouched.
 *
 * @throws with the mismatch named, never with the file half-written.
 */
function assertField(
  before: string,
  after: string,
  table: string,
  name: string,
  field: string,
  value: string | boolean
): void {
  const [original, edited] = parseBoth(before, after)
  const was = entryOf(original, table, name)
  const now = entryOf(edited, table, name)
  if (typeof was !== "object" || was === null) refuse(`[${table}.${name}] is not in this file`)
  if (typeof now !== "object" || now === null) refuse(`[${table}.${name}] is not in this file`)
  if (!sameValue((now as Record<string, unknown>)[field], value)) {
    refuse(`[${table}.${name}].${field} does not hold what was asked`)
  }
  if (!sameValue(restOf(was as Record<string, unknown>, field), restOf(now as Record<string, unknown>, field))) {
    refuse(`[${table}.${name}].${field} is not the only change`)
  }
  if (!sameValue(outside(original, table, name), outside(edited, table, name))) {
    refuse(`[${table}.${name}].${field} is not the only change`)
  }
}

/** Both texts parsed, or a refusal naming what the edit broke. */
function parseBoth(before: string, after: string): [Record<string, unknown>, Record<string, unknown>] {
  try {
    return [parse(before) as Record<string, unknown>, parse(after) as Record<string, unknown>]
  } catch (error) {
    throw new Error(`the edit left this file unreadable: ${messageOf(error)}`, {
      cause: error,
    })
  }
}

/** One table's entry, with one field taken out of it. */
function restOf(entry: Record<string, unknown>, field: string): unknown {
  const rest = { ...entry }
  delete rest[field]
  return canonical(rest)
}

/** The document with one entry taken out, ready to compare. */
function outside(document: Record<string, unknown>, table: string, name: string): unknown {
  return canonical(withoutEntry(document, table, name))
}

/** The key of a `key = value` line, or null when the line carries none. */
function assignmentKey(line: string): string | null {
  const trimmed = line.trim()
  if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("[")) return null
  const at = trimmed.indexOf("=")
  if (at < 0) return null
  const key = trimmed.slice(0, at).trim()
  const quote = key[0]
  if ((quote === '"' || quote === "'") && key[key.length - 1] === quote) return key.slice(1, -1)
  return key
}

/** The entry a parsed document holds under one table, or undefined. */
function entryOf(
  document: Record<string, unknown>,
  table: string,
  name: string
): unknown {
  const held = document[table]
  if (typeof held !== "object" || held === null) return undefined
  return (held as Record<string, unknown>)[name]
}

/** A parsed document with the entry taken out, and the table dropped once it is empty. */
function withoutEntry(
  document: Record<string, unknown>,
  table: string,
  name: string
): Record<string, unknown> {
  const copy = { ...document }
  const held = copy[table]
  if (typeof held !== "object" || held === null) return copy
  const rest = { ...(held as Record<string, unknown>) }
  delete rest[name]
  if (Object.keys(rest).length === 0) delete copy[table]
  else copy[table] = rest
  return copy
}
