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

export interface PlaceRoot {
  home: string
  homeEnv?: string
  /** 仅允许枚举声明的根内目录。 */
  list?: readonly string[]
}

/** 客户端根内可动态绑定模板变量的相对路径；其他路径保持拒绝。 */
export interface PlacePathTemplate {
  /** 仅限 list 白名单内的目录，以 ``${name}`` 代表其下一层名称。 */
  file: string
  name: string
}

export interface PlaceSnapshot {
  text: string | null
  root: string
}

/** One file under one of those roots. */
export interface PlaceRef {
  /** The root `file` is resolved under. */
  scope: AssetScope
  /** The file inside that root, `/`-separated, e.g. ".claude.json". */
  file: string
  /** 可选的全局客户端根及其用户目录下的回退路径。 */
  root?: PlaceRoot
  /** 已解析根的身份；提供时，根发生变化即拒绝操作。 */
  rootIdentity?: string
  /** 已由宿主枚举的单层目录名，仅可用于声明的同名模板占位。 */
  pathTemplate?: PlacePathTemplate
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
  /** 枚举已声明客户端根内的直接子目录。 */
  list?(place: PlaceRef): Promise<string[]>
  /** 返回解析后的展示路径，不单独暴露环境变量。 */
  display?(place: PlaceRef): Promise<string>
  /** 捕获根身份和当前文本，以便进行受保护的替换。 */
  snapshot?(place: PlaceRef): Promise<PlaceSnapshot>
  /** 仅在根和文件文本仍与快照一致时替换。 */
  commit?(place: PlaceRef, before: PlaceSnapshot, text: string): Promise<void>
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
  action: "read" | "write" | "remove" | "workspace" | "list" | "display" | "snapshot" | "commit"
  /** The file to work on, relative to its scope's root; the file actions need it. */
  ref?: PlaceRef
  /** The file's new contents; a write without it is refused. */
  text?: string
  before?: PlaceSnapshot
}

const ACTIONS: readonly string[] = ["read", "write", "remove", "workspace", "list", "display", "snapshot", "commit"]

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
  const held = body as { action?: unknown; ref?: unknown; text?: unknown; before?: unknown }
  if (typeof held.action !== "string" || !ACTIONS.includes(held.action)) {
    throw new Error(`unknown action: ${String(held.action)}`)
  }
  const action = held.action as PlaceCall["action"]
  /* The workspace is a property of the hub, not of a file, so it names none. */
  if (action === "workspace") return { action }
  if (typeof held.ref !== "object" || held.ref === null) throw new Error("a call needs a place")
  const ref = held.ref as { scope?: unknown; file?: unknown; root?: unknown; rootIdentity?: unknown; pathTemplate?: unknown }
  if (typeof ref.scope !== "string") throw new Error("a place needs a scope")
  if (typeof ref.file !== "string") throw new Error("a place needs a file")
  if ((action === "write" || action === "commit") && typeof held.text !== "string") {
    throw new Error("a write needs the file's text")
  }
  let root: PlaceRoot | undefined
  if (ref.root !== undefined) {
    if (typeof ref.root !== "object" || ref.root === null) throw new Error("invalid place root")
    const value = ref.root as { home?: unknown; homeEnv?: unknown; list?: unknown }
    if (typeof value.home !== "string" || (value.homeEnv !== undefined && typeof value.homeEnv !== "string") ||
      (value.list !== undefined && (!Array.isArray(value.list) || !value.list.every((item) => typeof item === "string")))) {
      throw new Error("invalid place root")
    }
    root = { home: value.home, ...(value.homeEnv === undefined ? {} : { homeEnv: value.homeEnv }),
      ...(value.list === undefined ? {} : { list: value.list as string[] }) }
  }
  if (ref.rootIdentity !== undefined && typeof ref.rootIdentity !== "string") throw new Error("invalid root identity")
  let pathTemplate: PlacePathTemplate | undefined
  if (ref.pathTemplate !== undefined) {
    const template = ref.pathTemplate as { file?: unknown; name?: unknown }
    if (typeof template.file !== "string" || typeof template.name !== "string" ||
      (template.file.match(/\$\{name\}/g) ?? []).length !== 1 || template.name === "") {
      throw new Error("invalid client path template")
    }
    pathTemplate = { file: template.file, name: template.name }
  }
  let before: PlaceSnapshot | undefined
  if (action === "commit") {
    if (typeof held.before !== "object" || held.before === null) throw new Error("commit needs a snapshot")
    const value = held.before as { text?: unknown; root?: unknown }
    if ((value.text !== null && typeof value.text !== "string") || typeof value.root !== "string") {
      throw new Error("invalid snapshot")
    }
    before = { text: value.text, root: value.root }
  }
  return {
    action,
    ref: { scope: ref.scope as AssetScope, file: ref.file, ...(root === undefined ? {} : { root }),
      ...(typeof ref.rootIdentity === "string" ? { rootIdentity: ref.rootIdentity } : {}),
      ...(pathTemplate === undefined ? {} : { pathTemplate }) },
    ...(typeof held.text === "string" ? { text: held.text } : {}),
    ...(before === undefined ? {} : { before }),
  }
}
