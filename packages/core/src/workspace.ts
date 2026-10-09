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

/**
 * One folder a form picked. The path is absent when the form cannot know one,
 * which is what a browser's own folder dialog leaves behind.
 */
export interface WorkspaceFolder {
  name: string
  path?: string
}

/** One workspace, described the way a list row needs it. */
export interface WorkspaceView {
  /** What selection matches on: the path when this form knows one, else the name. */
  id: string
  name: string
  /** The folder itself, absolute, for the work that reads inside it. */
  path: string | null
  /** The path as a person reads it, e.g. `~/work/hub`; `null` when a form knows no path. */
  display: string | null
}

/** Every workspace a form knows, and which one is current. */
export interface WorkspacePage {
  folders: WorkspaceView[]
  current: string | null
  /**
   * The agent this hub delivers to, by the id of the integration that declared
   * it. The agent list itself is a UI contribution, so this is an opaque id
   * here: an id nothing answers for simply selects nothing.
   */
  agent: string | null
}

/** What the hub remembers between runs. */
export interface WorkspaceState {
  folders: WorkspaceFolder[]
  current: string | null
  agent: string | null
}

/** The state before any folder has been picked. */
export const NO_WORKSPACES: WorkspaceState = { folders: [], current: null, agent: null }

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
   * Remember which agent this hub delivers to, by its integration id; `null`
   * clears the choice.
   */
  selectAgent(id: string | null): Promise<WorkspacePage>
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
  /** Remember which agent this hub delivers to; `null` clears the choice. */
  selectAgent(id: string | null): Promise<boolean>
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
 *
 * @param value — the stored value, as the form read it.
 * @returns the folders, current workspace and agent it describes.
 */
export function readWorkspaceState(value: unknown): WorkspaceState {
  if (typeof value !== "object" || value === null) return NO_WORKSPACES
  const stored = value as { folders?: unknown; current?: unknown; agent?: unknown }
  const folders: WorkspaceFolder[] = []
  if (Array.isArray(stored.folders)) {
    for (const entry of stored.folders) {
      if (typeof entry !== "object" || entry === null) continue
      const { name, path } = entry as { name?: unknown; path?: unknown }
      if (typeof name !== "string" || name === "") continue
      if (path !== undefined && (typeof path !== "string" || path === "")) continue
      const folder: WorkspaceFolder = path === undefined ? { name } : { name, path }
      if (!folders.some((known) => folderId(known) === folderId(folder))) folders.push(folder)
    }
  }
  const known = folders.map(folderId)
  const current = typeof stored.current === "string" && known.includes(stored.current) ? stored.current : null
  const agent = typeof stored.agent === "string" && stored.agent !== "" ? stored.agent : null
  return { folders, current, agent }
}
