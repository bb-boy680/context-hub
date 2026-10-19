/**
 * The JSON Schema a server answered, as the tree the tools pane draws: one
 * conversion here keeps the pane free of schema vocabulary, and the cache can
 * keep what the wire carried rather than a rendering of it.
 *
 * A schema is read for what a reader needs — the type glyph, the name, whether
 * it is required, and the sentence the server wrote about it. Anything else
 * (`$ref`, `anyOf`, formats) is left unread rather than guessed at: a field
 * that is drawn as its primitive self is still true, while an invented tree
 * would not be.
 */
import type { McpProbeTool } from "./probe.ts"
import type { McpField, McpTool } from "./tools.ts"

/** One tool as the pane renders it. */
export function toolTree(tool: McpProbeTool): McpTool {
  return {
    name: tool.name,
    title: tool.title ?? tool.name,
    description: tool.description ?? "",
    input: fieldsOf(tool.inputSchema),
    inputDescription: schemaText(tool.inputSchema),
    output: fieldsOf(tool.outputSchema),
    outputDescription: schemaText(tool.outputSchema),
  }
}

/** The properties one schema declares, as tree fields. */
export function fieldsOf(schema: unknown): McpField[] {
  const held = objectOf(schema)
  if (held === null) return []
  const properties = objectOf(held.properties)
  if (properties === null) return []
  const required = new Set(stringsOf(held.required))
  return Object.entries(properties).map(([name, value]) =>
    fieldOf(name, value, required.has(name))
  )
}

/** One property, or one array's items, as a tree field. */
function fieldOf(name: string, schema: unknown, required: boolean): McpField {
  const held = objectOf(schema) ?? {}
  const type = typeOf(held)
  const description = schemaText(schema)
  const shared = { name, type, ...(description === "" ? {} : { description }) }

  if (type === "object") {
    return { ...shared, ...(required ? { required } : {}), children: fieldsOf(held) }
  }
  if (type === "array") {
    /* An array draws one row for its items; a primitive item has nothing under
       it, so the row carries the item's own type and stops there. */
    const item = fieldOf("items", held.items, false)
    return {
      ...shared,
      ...(required ? { required } : {}),
      children: [item],
    }
  }
  return { ...shared, ...(required ? { required } : {}) }
}

/**
 * The sentence one schema carries about itself: its own `description`, or the
 * `title` a schema generation tool wrote in its place — both are what a
 * person reads on the row, and a title is better than a bare name.
 */
function schemaText(schema: unknown): string {
  const held = objectOf(schema)
  if (held === null) return ""
  if (typeof held.description === "string" && held.description !== "") return held.description
  if (typeof held.title === "string" && held.title !== "") return held.title
  return ""
}

/** The type a schema draws as, from the declaration or what it carries. */
function typeOf(schema: Record<string, unknown>): McpField["type"] {
  if (schema.type === "object" || objectOf(schema.properties) !== null) return "object"
  if (schema.type === "array" || schema.items !== undefined) return "array"
  if (schema.type === "boolean") return "boolean"
  if (schema.type === "number" || schema.type === "integer") return "number"
  return "string"
}

/** One value read as an object, or null when it is anything else. */
function objectOf(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** The strings one array holds. */
function stringsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}
