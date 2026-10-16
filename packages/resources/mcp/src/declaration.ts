/**
 * One MCP server's declaration, in the terms every client file agrees on: a
 * command with arguments, or a URL. Each client spells it its own way — a JSON
 * object, a TOML table, and one of them puts the environment under a nested
 * table — so the extension that knows a client writes the declaration into its
 * file, and this is the value it starts from.
 */

/** How a server is reached. */
export type McpTransport = "stdio" | "sse" | "http"

/** A server the client starts as a child process. */
export interface McpStdioDeclaration {
  transport: "stdio"
  /** The program to run. */
  command: string
  /** Its arguments, already split. */
  args: string[]
  /** Environment variables for that process. */
  env: Record<string, string>
}

/** A server the client reaches over the network. */
export interface McpRemoteDeclaration {
  transport: "sse" | "http"
  /** The endpoint. */
  url: string
  /** Headers sent with every request. */
  headers: Record<string, string>
}

/** A server's declaration, discriminated by how it is reached. */
export type McpDeclaration = McpStdioDeclaration | McpRemoteDeclaration

/**
 * One entry as a client file holds it: the keys a client reads, and only the
 * ones the declaration actually carries. A JSON client writes this object, and
 * a TOML client's entry carries these values.
 */
export type McpEntryValues =
  | { command: string; args?: string[]; env?: Record<string, string> }
  | { url: string; headers?: Record<string, string> }

/**
 * The declaration one client file's entry holds.
 *
 * @param value — what one client file's entry holds for a server.
 * @returns the declaration, or null when the entry says nothing this build can
 * read — an entry a person wrote by hand in another client's dialect.
 */
export function readDeclaration(value: unknown): McpDeclaration | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null
  const held = value as Record<string, unknown>

  const command = held.command
  if (typeof command === "string" && command !== "") {
    return {
      transport: "stdio",
      command,
      args: arrayOf(held.args),
      env: stringsOf(held.env),
    }
  }
  const url = held.url
  if (typeof url === "string" && url !== "") {
    return {
      transport: held.type === "sse" || held.transport === "sse" ? "sse" : "http",
      url,
      headers: stringsOf(held.headers),
    }
  }
  return null
}

/**
 * The entry a client file holds for one declaration.
 */
export function writeDeclaration(declaration: McpDeclaration): McpEntryValues {
  if (declaration.transport === "stdio") {
    const entry: { command: string; args?: string[]; env?: Record<string, string> } = {
      command: declaration.command,
    }
    if (declaration.args.length > 0) entry.args = [...declaration.args]
    if (Object.keys(declaration.env).length > 0) entry.env = { ...declaration.env }
    return entry
  }
  const entry: { url: string; headers?: Record<string, string> } = { url: declaration.url }
  if (Object.keys(declaration.headers).length > 0) entry.headers = { ...declaration.headers }
  return entry
}

/**
 * The declaration as one line a person reads: the command with its arguments,
 * or the URL.
 */
export function declarationLine(declaration: McpDeclaration): string {
  if (declaration.transport === "stdio") {
    return [declaration.command, ...declaration.args].join(" ").trim()
  }
  return declaration.url
}

/**
 * An argument line split into arguments: whitespace separates them, and single
 * or double quotes group a run that carries spaces.
 */
export function splitArguments(line: string): string[] {
  const parts: string[] = []
  let part = ""
  let quote: string | null = null
  let started = false

  for (const char of line) {
    if (quote !== null) {
      if (char === quote) quote = null
      else part += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      started = true
      continue
    }
    if (/\s/.test(char)) {
      if (started || part !== "") parts.push(part)
      part = ""
      started = false
      continue
    }
    part += char
  }
  if (started || part !== "") parts.push(part)
  return parts
}

/** The string values of a record, dropping anything else the file holds. */
function stringsOf(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {}
  const pairs = Object.entries(value as Record<string, unknown>).filter(
    (pair): pair is [string, string] => typeof pair[1] === "string"
  )
  return Object.fromEntries(pairs)
}

/** The string items of an array, dropping anything else the file holds. */
function arrayOf(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}
