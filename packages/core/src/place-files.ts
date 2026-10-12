/**
 * The client configuration files a hub consumer reads and writes: the place
 * vocabulary both sides use, the reader and writer a form implements, the wire
 * one call takes, and the check every form applies before touching a file.
 *
 * A place names a file relative to one of two roots — the workspace in use, or
 * the user's home directory — so no caller can name a path outside them. The
 * disk side then checks the place again before it resolves anything.
 */

/**
 * Which root a contributed path is relative to. One scope is a property of the
 * machine and the other of one folder, so a place is either in every workspace
 * at once or in the one in use.
 */
export type AssetScope = "workspace" | "global"

/** One file under one of those roots. */
export interface PlaceRef {
  /** The root `file` is resolved under. */
  scope: AssetScope
  /** The file inside that root, `/`-separated, e.g. ".claude.json". */
  file: string
}

/**
 * Reading and writing those files.
 *
 * Clients own them: a write replaces a whole file's contents, and it is the
 * caller's job to have read the file first and to hand back a text that differs
 * only where it meant to (the MCP toolkit's editors do exactly that).
 */
export interface PlaceFiles {
  /**
   * Read one file.
   *
   * @returns its text, or null when it — or the root it sits under — is not there.
   * @throws when the form refuses the place, or the file cannot be read.
   */
  read(place: PlaceRef): Promise<string | null>
  /**
   * Write one file, replacing its contents.
   *
   * @throws when the form refuses the place, or the root does not exist.
   */
  write(place: PlaceRef, text: string): Promise<void>
  /** Delete one file; a file that is not there is not an error. */
  remove(place: PlaceRef): Promise<void>
  /**
   * The workspace in use, as a path, or null when this hub has none.
   *
   * A client that keys its own state by project path needs this to find the
   * record it already wrote rather than writing a second one beside it.
   */
  workspace(): Promise<string | null>
}

/** Route a host serves client configuration files on. */
export const PLACE_FILES_ROUTE = "/hub/place-files"

/** What one call asks for. */
export interface PlaceCall {
  action: "read" | "write" | "remove" | "workspace"
  /** The file to work on, relative to its scope's root; the file actions need it. */
  ref?: PlaceRef
  /** The file's new contents; a write without it is refused. */
  text?: string
}

const ACTIONS: readonly string[] = ["read", "write", "remove", "workspace"]

/**
 * Read one call off a request body.
 *
 * @param body — the parsed body, of no known type: it crossed a wire.
 * @returns the call, with the fields this route understands.
 * @throws when the body is not one of these calls; the message names what was
 * missing, never what the caller should have sent instead.
 */
export function readPlaceCall(body: unknown): PlaceCall {
  if (typeof body !== "object" || body === null) throw new Error("a call is an object")
  const held = body as { action?: unknown; ref?: unknown; text?: unknown }
  if (typeof held.action !== "string" || !ACTIONS.includes(held.action)) {
    throw new Error(`unknown action: ${String(held.action)}`)
  }
  const action = held.action as PlaceCall["action"]
  /* The workspace is a property of the hub, not of a file, so it names none. */
  if (action === "workspace") return { action }
  if (typeof held.ref !== "object" || held.ref === null) throw new Error("a call needs a place")
  const ref = held.ref as { scope?: unknown; file?: unknown }
  if (typeof ref.scope !== "string") throw new Error("a place needs a scope")
  if (typeof ref.file !== "string") throw new Error("a place needs a file")
  if (action === "write" && typeof held.text !== "string") {
    throw new Error("a write needs the file's text")
  }
  return {
    action,
    ref: { scope: ref.scope as AssetScope, file: ref.file },
    ...(typeof held.text === "string" ? { text: held.text } : {}),
  }
}
