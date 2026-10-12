/**
 * Reading and editing a client's JSON file: one node is written, replaced or
 * removed by splicing its own text, and every other byte — comments, trailing
 * commas, indentation, key order, the layout of objects this edit does not
 * touch — is left as it stands. These files belong to the clients, several of
 * them carry comments a person wrote, and one of them holds every project's
 * settings beside the servers the hub writes.
 *
 * A serializer is not an option for the same reason: re-printing a document
 * reflows the layout its owner chose. So writing is a text splice, followed by
 * a check that parses the result and compares it against the file it came from;
 * an edit whose outcome differs from the one asked for is refused, not written.
 */
import {
  findNodeAtLocation,
  parse,
  parseTree,
  printParseErrorCode,
  type Node,
  type ParseError,
} from "jsonc-parser"

import { canonical, messageOf, refuse, sameValue } from "./value.ts"

/** How the readers treat a document: these files carry comments and trailing commas. */
const OPTIONS = { allowTrailingComma: true, disallowComments: false } as const

/** What one added level of nesting is indented with. */
const INDENT = "  "

/**
 * A JSONC document's value.
 *
 * @param text — the file's whole contents.
 * @throws when the text is not JSONC; the message names the first error the
 * parser reported.
 */
export function parseJsonc(text: string): unknown {
  const problems: ParseError[] = []
  const value: unknown = parse(text, problems, OPTIONS)
  const first = problems[0]
  if (first !== undefined) {
    throw new Error(`${printParseErrorCode(first.error)} at offset ${first.offset}`)
  }
  return value
}

/**
 * The JSON object a file holds, for a file whose top level is an object (every
 * client file here is one).
 *
 * @param text — the file's whole contents, or null for a file that is not there.
 * @returns the object, or null when the file holds nothing at all.
 * @throws when the text is not JSONC, or when its top level is not an object.
 */
export function readJsonObject(text: string | null): Record<string, unknown> | null {
  if (text === null || text.trim() === "") return null
  const value = parseJsonc(text)
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("this file does not hold a JSON object")
  }
  return value as Record<string, unknown>
}

/**
 * The value a path leads to inside a parsed document.
 *
 * @param document — a parsed document, or any value on the way down.
 * @param path — the keys to walk, from the top level down.
 * @returns what the path leads to, or `undefined` when it leads nowhere.
 */
export function valueAt(document: unknown, path: readonly (string | number)[]): unknown {
  let held: unknown = document
  for (const key of path) {
    if (typeof held !== "object" || held === null) return undefined
    held = (held as Record<string | number, unknown>)[key]
  }
  return held
}

/**
 * A file's text with one path set to `value` — or, when `value` is `undefined`,
 * with that path taken out. Nothing else in the file moves: an object the edit
 * emptied is left in place, because the hub did not write it and does not know
 * whether its owner wants it kept.
 *
 * A path is created only inside a parent that already exists; a file that holds
 * nothing is built from the path up, which is how a client with no config yet
 * gets its first entry. A path whose parents are missing is refused rather than
 * invented.
 *
 * @param text — the file's whole contents; null for a file that is not there.
 * @param path — the keys to walk, from the top level down.
 * @param value — what the path is to hold, or `undefined` to take it out.
 * @returns the file's new contents.
 * @throws when the text is not JSONC, when the edit cannot be expressed, or
 * when the edited text differs from the original outside that path.
 */
export function editJson(
  text: string | null,
  path: readonly (string | number)[],
  value: unknown
): string {
  const source = text ?? ""
  if (path.length === 0) throw new Error("an edit needs a path")
  const empty = source.trim() === ""
  if (empty && value === undefined) return source

  const before = empty ? undefined : parseJsonc(source)
  const tree = empty ? undefined : parseTree(source, undefined, OPTIONS)
  const node = tree === undefined ? undefined : findNodeAtLocation(tree, [...path])

  let next: string
  if (value === undefined) {
    /* Taking out something this file does not hold changes nothing. */
    if (node === undefined) return source
    /* The property leaves, not the value alone: its key goes with it. */
    next = remove(source, propertyOf(tree, path))
  } else if (node !== undefined) {
    /* A value written over another keeps the shape of the property it belongs
       to: contents one level in from where that property starts, its closing
       brace back at that column. */
    const property = propertyOf(tree, path)
    next = `${source.slice(0, node.offset)}${render(value, columnAt(source, property.offset), spansLines(source, node))}${source.slice(node.offset + node.length)}`
  } else if (tree === undefined) {
    next = `${JSON.stringify(nest(path, value), null, INDENT)}\n`
  } else {
    next = insert(source, tree, path, value)
  }

  assertEdit(before, next, path, value)
  return next
}

/** The property node a path names, whose text carries the key and its value. */
function propertyOf(tree: Node | undefined, path: readonly (string | number)[]): Node {
  const property = tree === undefined ? undefined : propertyAt(tree, path)
  if (property === undefined) refuse(`${path.join(".")} is not a property of this file`)
  return property
}

/**
 * The 1-based lines one value occupies — the lines its text spans, so a pane
 * can point at the entry a client file holds.
 *
 * @returns the first and last line, or null when the path leads nowhere.
 */
export function jsonValueLines(
  text: string,
  path: readonly (string | number)[]
): [number, number] | null {
  const tree = parseTree(text, undefined, OPTIONS)
  const node = tree === undefined ? undefined : findNodeAtLocation(tree, [...path])
  if (node === undefined) return null
  return [lineOf(text, node.offset), lineOf(text, node.offset + node.length)]
}

/**
 * Put one value into the deepest object this file already holds on the path,
 * creating the levels below it in the same edit and in that object's own layout.
 *
 * Levels a file does not have yet are created, because a client that has no
 * config yet still gets its first entry; a caller that must not invent one —
 * Claude Code's per-project record, say — is where that rule belongs, not here.
 */
function insert(
  source: string,
  tree: Node,
  path: readonly (string | number)[],
  value: unknown
): string {
  let depth = 0
  let parent = tree
  while (depth < path.length - 1) {
    const held = findNodeAtLocation(tree, [...path.slice(0, depth + 1)])
    if (held === undefined || held.type !== "object") break
    parent = held
    depth += 1
  }

  const key = path[depth]
  if (typeof key !== "string") refuse("a JSON object's keys are names")
  const written = nest(path.slice(depth + 1), value)
  const multiline = spansLines(source, parent)
  const indent = indentIn(source, parent)
  const entry = `${quote(key)}: ${render(written, indent, multiline)}`
  const properties = parent.children ?? []

  if (properties.length === 0) {
    /* An empty object is written from inside its own braces, so an inline `{}`
       stays inline and a block one grows a line. */
    const body = multiline ? `\n${indent}${entry}\n${indent.slice(0, -INDENT.length)}` : entry
    return `${source.slice(0, parent.offset + 1)}${body}${source.slice(parent.offset + parent.length - 1)}`
  }

  const last = properties[properties.length - 1]
  if (last === undefined) refuse("this object cannot take another property")
  const at = last.offset + last.length
  const added = multiline ? `\n${indent}${entry}` : ` ${entry}`
  return `${source.slice(0, at)},${added}${source.slice(at)}`
}

/** The property node a path names, whose text carries the key and its value. */
function propertyAt(tree: Node, path: readonly (string | number)[]): Node | undefined {
  const key = path.at(-1)
  const parent = findNodeAtLocation(tree, [...path.slice(0, -1)])
  return (parent?.children ?? []).find((child) => child.children?.[0]?.value === key)
}

/**
 * Take one property out.
 *
 * When the property sits on a line of its own — the layout every client file
 * here is written in — its whole line goes, together with the one comma that
 * separated it: what is left is the file as it reads without that line, never a
 * blank indented one. Any other layout (a property sharing a line with its
 * neighbours) is cut narrowly instead, comma and all, because there is no line
 * that belongs to it alone.
 */
function remove(source: string, node: Node): string {
  const end = node.offset + node.length
  const start = lineStart(source, node.offset)
  const after = newlineEnd(source, end)
  const before = source.slice(start, node.offset)
  /* What the property left on its own line: its comma, then the newline. */
  const lineTail = source.slice(end, after).trim()

  const ownsItsLine = before.trim() === "" && (lineTail === "" || lineTail === ",")
  if (!ownsItsLine) {
    const [from, to] = compactRange(source, node)
    return `${source.slice(0, from)}${source.slice(to)}`
  }

  /* The line goes, terminator included. When the property carried no comma of
     its own, the one the property above kept for it goes too — on its own,
     because the newline after that comma ends the line above, which stays. */
  const ranges: [number, number][] = [[start, after]]
  if (lineTail === "") {
    const comma = source.lastIndexOf(",", start - 1)
    if (comma >= 0 && source.slice(comma + 1, start).trim() === "") ranges.push([comma, comma + 1])
  }

  let text = source
  for (const [from, to] of ranges.sort((left, right) => right[0] - left[0])) {
    text = `${text.slice(0, from)}${text.slice(to)}`
  }
  return text
}

/** The span one property occupies in a layout it shares with its neighbours, comma included. */
function compactRange(source: string, node: Node): [number, number] {
  let start = node.offset
  let end = node.offset + node.length
  let at = start - 1
  while (at >= 0 && /\s/.test(source[at] ?? "")) at -= 1
  if (source[at] === ",") {
    /* The property before this one keeps the comma that separated them. */
    start = at
    while (start > 0 && /[ \t]/.test(source[start - 1] ?? "")) start -= 1
  } else {
    at = end
    while (at < source.length && /\s/.test(source[at] ?? "")) at += 1
    if (source[at] === ",") end = at + 1
  }
  return [start, end]
}

/** The index the line an offset falls on begins at. */
function lineStart(source: string, offset: number): number {
  return source.lastIndexOf("\n", offset - 1) + 1
}

/** The index just past the newline that ends the line an offset falls on. */
function newlineEnd(source: string, offset: number): number {
  const at = source.indexOf("\n", offset)
  return at < 0 ? source.length : at + 1
}

/**
 * One value as JSON text, indented to sit where it is being written. A value
 * written into a single-line object stays on one line: breaking it would reflow
 * the box that holds it, which is exactly what these edits do not do.
 */
function render(value: unknown, indent: string, multiline: boolean): string {
  if (!multiline) return JSON.stringify(value)
  return JSON.stringify(value, null, INDENT).replaceAll("\n", `\n${indent}`)
}

/** The path turned into nested objects, so one call can write a whole document. */
function nest(path: readonly (string | number)[], value: unknown): unknown {
  let held = value
  for (let at = path.length - 1; at >= 0; at -= 1) {
    const key = path[at]
    if (typeof key !== "string") refuse("a JSON object's keys are names")
    held = { [key]: held }
  }
  return held
}

/** A key written the way JSON spells it. */
function quote(key: string): string {
  return JSON.stringify(key)
}

/** Whether the text a node spans carries more than one line. */
function spansLines(source: string, node: Node): boolean {
  return source.slice(node.offset, node.offset + node.length).includes("\n")
}

/** The indentation a token carries on its own line: the spaces before it. */
function columnAt(source: string, offset: number): string {
  const start = source.lastIndexOf("\n", offset - 1) + 1
  return " ".repeat(Math.max(0, offset - start))
}

/** The indentation one object's properties sit at, one level in from it. */
function indentIn(source: string, parent: Node): string {
  const first = parent.children?.[0]
  if (first === undefined) return columnAt(source, parent.offset) + INDENT
  const cell = columnAt(source, first.offset)
  /* A property that starts its own line keeps that line's indentation; one that
     shares a line is aligned under the property it follows. */
  return cell === "" ? INDENT : cell
}

/** The 1-based line an offset falls on. */
function lineOf(text: string, offset: number): number {
  return text.slice(0, offset).split("\n").length
}

/**
 * Prove an edit did what it was asked and nothing else: the text parses, the
 * path now holds what was asked — or is gone — and every other value in the
 * document is the one the file already had.
 *
 * @throws with the mismatch named, never with the file half-written.
 */
function assertEdit(
  before: unknown,
  after: string,
  path: readonly (string | number)[],
  wanted: unknown
): void {
  let edited: unknown
  try {
    edited = parseJsonc(after)
  } catch (error) {
    throw new Error(`the edit left this file unreadable: ${messageOf(error)}`, { cause: error })
  }

  const asked = wanted === undefined ? undefined : canonical(wanted)
  if (!sameValue(canonical(valueAt(edited, path)), asked)) {
    refuse(`${path.join(".")} does not hold what was asked`)
  }
  if (!sameValue(marked(before, path), marked(edited, path))) {
    refuse(`${path.join(".")} is not the only change`)
  }
}

/** The marker both sides of a comparison carry at the edited path. */
const MARKER = "\u0000edited"

/**
 * A document with one path replaced by a marker, so two sides compare what the
 * edit was allowed to touch. Parent objects a side does not have are created,
 * which is what makes an edit into a file that held nothing comparable with the
 * document it produced.
 */
function marked(document: unknown, path: readonly (string | number)[]): unknown {
  const copy = structuredClone(document ?? {}) as Record<string | number, unknown>
  let held = copy
  for (const key of path.slice(0, -1)) {
    const step = held[key]
    if (typeof step === "object" && step !== null) {
      held = step as Record<string | number, unknown>
      continue
    }
    const fresh: Record<string | number, unknown> = {}
    held[key] = fresh
    held = fresh
  }
  const last = path.at(-1)
  if (last !== undefined) held[last] = MARKER
  return canonical(copy)
}
