/**
 * The comparison both format editors prove their work with.
 *
 * An edit is accepted only when the document it produced holds what was asked
 * and nothing else changed. That check compares two parsed documents, so it
 * needs one notion of equality that ignores what the parser happened to build:
 * key order, object prototypes, and the difference between a table a file
 * declared and one that was nested.
 */

/**
 * A parsed value reduced to plain objects with sorted keys, so two documents
 * compare by content — a parser builds its tables without a prototype, and key
 * order is the file's, not the comparison's business.
 */
export function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value === null || typeof value !== "object") return value
  const entries = Object.entries(value as Record<string, unknown>).map(
    ([key, held]) => [key, canonical(held)] as const
  )
  entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
  return Object.fromEntries(entries)
}

/**
 * Deep equality over canonical values: plain objects compare by their own keys,
 * arrays by position, everything else by `===`.
 */
export function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((item, index) => sameValue(item, right[index]))
  }
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) {
    return false
  }
  const held = Object.entries(left as Record<string, unknown>)
  const other = right as Record<string, unknown>
  if (held.length !== Object.keys(other).length) return false
  return held.every(([key, value]) => Object.hasOwn(other, key) && sameValue(value, other[key]))
}

/** Refuse an edit, naming why; the caller writes only what this accepted. */
export function refuse(reason: string): never {
  throw new Error(`refused to write this file: ${reason}`)
}

/** The message one thrown value carries, for a refusal a person reads. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
