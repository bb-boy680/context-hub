/**
 * Workspaces: the folders the hub is pointed at. A workspace is a folder, so it
 * has no name of its own — the name a person reads is the folder's last path
 * segment, and the path is the folder's own. The hub remembers the folders it
 * has been given plus which one is current; only a form that owns a disk can
 * list them, so this module carries the shared contracts and the form answers
 * for the rest.
 */

/** Route a form serves the workspace list and its two actions on. */
export const WORKSPACE_ROUTE = "/hub/workspaces"

/** State document that holds the known folders and the current one. */
export const WORKSPACE_DOCUMENT = "workspaces"

/** One workspace, described the way a list row needs it. */
export interface WorkspaceView {
  /** The folder's absolute path, and what a form stores. */
  path: string
  /** The folder's last path segment. */
  name: string
  /** The path as a person reads it, e.g. `~/work/hub`. */
  display: string
}

/** Every workspace a form knows, and which one is current. */
export interface WorkspacePage {
  folders: WorkspaceView[]
  current: string | null
}

/** What the hub remembers between runs. */
export interface WorkspaceState {
  folders: string[]
  current: string | null
}

/** The state before any folder has been picked. */
export const NO_WORKSPACES: WorkspaceState = { folders: [], current: null }

/** The current workspace folder plus the list it came from, or nothing when the picker was cancelled. */
export type PickedWorkspace =
  | { cancelled: true; page: WorkspacePage }
  | { cancelled: false; page: WorkspacePage; picked: WorkspaceView }

/** The workspace list as the form offers it to whoever renders it. */
export interface WorkspaceStore {
  /** Every known folder and the current one. */
  page(): Promise<WorkspacePage>
  /** Make one known folder current; an unknown path is an error, not a silent no-op. */
  select(path: string): Promise<WorkspacePage>
  /**
   * Ask the person for a folder, remember it, and make it current.
   *
   * @param prompt — the text the folder dialog shows.
   * @returns the new list, and the folder when one was picked.
   */
  pick(prompt: string): Promise<PickedWorkspace>
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
 * Read a stored workspace document. Values that are not paths are dropped: the
 * file is durable JSON, so a hand-edited entry is bad input, not a new folder.
 *
 * @param value — the stored value, as the form read it.
 * @returns the folders and current workspace it describes.
 */
export function readWorkspaceState(value: unknown): WorkspaceState {
  if (typeof value !== "object" || value === null) return NO_WORKSPACES
  const stored = value as { folders?: unknown; current?: unknown }
  const folders = Array.isArray(stored.folders)
    ? stored.folders.filter((folder): folder is string => typeof folder === "string" && folder !== "")
    : []
  const current = typeof stored.current === "string" && folders.includes(stored.current) ? stored.current : null
  return { folders, current }
}
