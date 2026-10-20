/**
 * Workspaces: the folders the hub is pointed at. A workspace is a folder, so it
 * has no name of its own — the name a person reads is the folder's last path
 * segment, and its identity is the folder's path when the form knows one.
 *
 * A form that cannot know a path hands over the name alone: a browser shows a
 * folder dialog but is told nothing else about the folder, so there the name IS
 * everything the hub learns. This module is shared by the page and the process
 * that owns the disk, so it stays free of platform imports.
 */

/** Route a form serves the workspace list and its actions on. */
export const WORKSPACE_ROUTE = "/hub/workspaces"

/** State document that holds the known folders and the current one. */
export const WORKSPACE_DOCUMENT = "workspaces"

/** The i18n key a system-provided workspace name points at. */
export const DEFAULT_WORKSPACE_NAME = "workspace.defaultName"

/**
 * A name the system gave: an i18n key the form translates, so the row reads in
 * the person's own language instead of a name baked into the document.
 */
export interface WorkspaceI18nAlias {
  i18n: string
}

/** The name a list row shows: one a person chose, or a system i18n key. */
export type WorkspaceAlias = string | WorkspaceI18nAlias

/**
 * One folder a form picked. The path is absent when the form cannot know one,
 * which is what a browser's own folder dialog leaves behind.
 */
export interface WorkspaceFolder {
  name: string
  path?: string
  /**
   * The name a person gave this workspace, shown instead of the folder's own
   * name, or a system name to translate. Renaming a workspace renames the row,
   * never the folder: the hub only reads and writes a folder it was pointed at.
   */
  alias?: WorkspaceAlias
  /**
   * The host's own folder. Written once by the store, kept at the front of the
   * list, and never removable; its absence is what marks every other row.
   */
  default?: boolean
}

/** One workspace, described the way a list row needs it. */
export interface WorkspaceView {
  /** What selection matches on: the path when this form knows one, else the name. */
  id: string
  /** A person's name, or the folder's own name when there is no alias. */
  name: string
  /** The folder itself, absolute, for the work that reads inside it. */
  path: string | null
  /** The path as a person reads it, e.g. `~/work/hub`; `null` when a form knows no path. */
  display: string | null
  /** Whether this is the host's own workspace: shown first and not removable. */
  default: boolean
  /** The i18n key of a system alias, for the form to translate; null otherwise. */
  nameKey: string | null
}

/** Every workspace a form knows, and which one is current. */
export interface WorkspacePage {
  folders: WorkspaceView[]
  current: string | null
  /**
   * The agents this hub delivers to, by the id of the integration that declared
   * each one. The agent list itself is a UI contribution, so these are opaque
   * ids here: an id nothing answers for simply chooses nothing.
   */
  agents: string[]
}

/** What the hub remembers between runs. */
export interface WorkspaceState {
  folders: WorkspaceFolder[]
  current: string | null
  agents: string[]
}

/** The state before any folder has been picked. */
export const NO_WORKSPACES: WorkspaceState = { folders: [], current: null, agents: [] }

/** The workspace list as the form offers it to whoever renders it. */
export interface WorkspaceStore {
  /** Every known folder and the current one. */
  page(): Promise<WorkspacePage>
  /**
   * Remember a folder the person picked, and make it current. The argument is
   * the folder's path, or — because a browser's own dialog reports nothing else
   * — its name, which the hub places among the folders it already knows; a
   * name no folder answers for is refused rather than guessed at.
   */
  add(folder: string): Promise<WorkspacePage>
  /** Make one known folder current; an unknown id is an error, not a silent no-op. */
  select(id: string): Promise<WorkspacePage>
  /**
   * Give one known workspace the name a person chose, shown instead of the
   * folder's own name; an empty name drops it and the row reads the folder's
   * name again — on the default workspace an empty name restores the system
   * name instead. The folder itself is never moved.
   */
  rename(id: string, name: string): Promise<WorkspacePage>
  /**
   * Drop one workspace from the list. The folder on disk is untouched, the
   * current workspace is refused, and so is the default workspace.
   */
  remove(id: string): Promise<WorkspacePage>
  /**
   * Remember whether this hub delivers to one agent, by its integration id.
   * Choosing several is how a person reads the machine-wide places they care
   * about; choosing none is an empty list, not a different state.
   */
  setAgent(id: string, on: boolean): Promise<WorkspacePage>
}

/**
 * The workspace list as a running form keeps it: the last read, its listeners,
 * and the actions a form offers. A form provides this on the kernel so the
 * sidebar menu and the pages that read the current folder cannot disagree about
 * which one it is.
 */
export interface WorkspaceService {
  /** The list as of the last read; `null` until one answers. */
  current(): WorkspacePage | null
  /** Why the last action failed, ready to show; cleared by the next one that works. */
  failure(): string | null
  /** Follow either of the above; returns the unsubscribe. */
  subscribe(listener: () => void): () => void
  /** Read the list again. */
  refresh(): Promise<void>
  /** Make one known folder current; `false` when the hub refused it. */
  select(id: string): Promise<boolean>
  /** Add a folder and make it current; `false` when the hub refused it. The
      argument is a path or the name a browser's own dialog reports. */
  add(folder: string): Promise<boolean>
  /** Give one workspace a name of its own; `false` when the hub refused it. */
  rename(id: string, name: string): Promise<boolean>
  /** Drop one workspace from the list; `false` when the hub refused it. */
  remove(id: string): Promise<boolean>
  /** Remember whether one agent is delivered to; `false` when the hub refused it. */
  setAgent(id: string, on: boolean): Promise<boolean>
}

/**
 * A folder's identity: its path when the form knows one, else its name.
 *
 * @param folder — the folder as the form reported it.
 * @returns the id selection and the stored current workspace use.
 */
export function folderId(folder: WorkspaceFolder): string {
  return folder.path ?? folder.name
}

/**
 * The folder's last path segment, on either separator.
 *
 * @param path — an absolute folder path.
 * @returns the name a list row shows.
 */
export function workspaceName(path: string): string {
  const segments = path.split(/[\\/]/).filter((segment) => segment !== "")
  return segments[segments.length - 1] ?? path
}

/**
 * Read a stored workspace document. Entries the hub did not write are dropped:
 * the file is durable JSON, so a hand-edited value is bad input, not a folder.
 * A document written before agents could be chosen more than one at a time
 * carries a single `agent`, which reads as the one-element list it meant.
 *
 * @param value — the stored value, as the form read it.
 * @returns the folders, current workspace and agents it describes.
 */
export function readWorkspaceState(value: unknown): WorkspaceState {
  if (typeof value !== "object" || value === null) return NO_WORKSPACES
  const stored = value as {
    folders?: unknown
    current?: unknown
    agents?: unknown
    agent?: unknown
  }
  const folders: WorkspaceFolder[] = []
  if (Array.isArray(stored.folders)) {
    for (const entry of stored.folders) {
      if (typeof entry !== "object" || entry === null) continue
      const { name, path, alias, default: isDefault } = entry as {
        name?: unknown
        path?: unknown
        alias?: unknown
        default?: unknown
      }
      if (typeof name !== "string" || name === "") continue
      if (path !== undefined && (typeof path !== "string" || path === "")) continue
      const folder: WorkspaceFolder = path === undefined ? { name } : { name, path }
      if (typeof alias === "string" && alias !== "") folder.alias = alias
      else if (typeof alias === "object" && alias !== null) {
        const { i18n } = alias as { i18n?: unknown }
        if (typeof i18n === "string" && i18n !== "") folder.alias = { i18n }
      }
      if (isDefault === true) folder.default = true
      if (!folders.some((known) => folderId(known) === folderId(folder))) folders.push(folder)
    }
  }
  const known = folders.map(folderId)
  const current = typeof stored.current === "string" && known.includes(stored.current) ? stored.current : null
  const agents: string[] = []
  const chosen = Array.isArray(stored.agents) ? stored.agents : [stored.agent]
  for (const entry of chosen) {
    if (typeof entry !== "string" || entry === "" || agents.includes(entry)) continue
    agents.push(entry)
  }
  return { folders, current, agents }
}
