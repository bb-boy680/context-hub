/**
 * Disk-backed workspace list: the folders a person has pointed the hub at, kept
 * in the hub home's state directory so the list travels with the hub instead of
 * with one browser profile. This module runs in the process that owns the disk,
 * which is where a folder's path becomes a path a person reads.
 */
import { displayPath } from "./home.ts"
import { isDirectory } from "./fs-browse.ts"
import { createFsStateStore } from "./state-fs.ts"
import {
  folderId,
  readWorkspaceState,
  WORKSPACE_DOCUMENT,
  workspaceName,
} from "../workspace.ts"
import type {
  WorkspaceFolder,
  WorkspacePage,
  WorkspaceStore,
  WorkspaceState,
  WorkspaceView,
} from "../workspace.ts"

/** What a form tells the store about the place it runs in. */
export interface WorkspaceStoreOptions {
  /**
   * The folder this host itself is working in. A host that knows it does not
   * ask a person to pick it: the folder is a workspace by default, so switching
   * to it reads whatever the person is working on. A row that names the folder
   * without a path — one added before the hub kept paths — takes the path.
   */
  folder?: string
}

/** Create the workspace store that reads and writes under one hub home. */
export function createFsWorkspaceStore(
  home: string,
  options: WorkspaceStoreOptions = {}
): WorkspaceStore {
  const documents = createFsStateStore(home)

  const view = (folder: WorkspaceFolder): WorkspaceView => ({
    id: folderId(folder),
    name: folder.name,
    path: folder.path ?? null,
    display: folder.path === undefined ? null : displayPath(folder.path),
  })

  /**
   * Fold the host's own folder into the list, once. It is a workspace whether
   * or not anyone picked it, and a name-only row that means it is replaced
   * rather than left unreadable; nothing else in the list is touched.
   */
  const adoptHostFolder = async (state: WorkspaceState): Promise<WorkspaceState> => {
    const folder = options.folder
    if (folder === undefined || !(await isDirectory(folder))) return state
    const host: WorkspaceFolder = { name: workspaceName(folder), path: folder }
    const id = folderId(host)
    if (state.folders.some((known) => folderId(known) === id)) return state
    const named = state.folders.find(
      (known) => known.path === undefined && known.name === host.name
    )
    const nameId = named === undefined ? null : folderId(named)
    const next: WorkspaceState = {
      /* The name-only row keeps its place in the list as it takes the folder. */
      folders:
        named === undefined
          ? [...state.folders, host]
          : state.folders.map((known) => (known === named ? host : known)),
      /* The row that pointed at nothing by name pointed at this folder. */
      current: state.current === null || state.current === nameId ? id : state.current,
    }
    await documents.write(WORKSPACE_DOCUMENT, next)
    return next
  }

  const read = async (): Promise<WorkspaceState> =>
    adoptHostFolder(readWorkspaceState(await documents.read(WORKSPACE_DOCUMENT)))

  const page = async (): Promise<WorkspacePage> => {
    const state = await read()
    return { folders: state.folders.map(view), current: state.current }
  }

  return {
    page,

    async add(target) {
      if (!(await isDirectory(target))) {
        throw new Error(`not a folder: ${target}`)
      }
      const folder: WorkspaceFolder = { name: workspaceName(target), path: target }
      const state = await read()
      const id = folderId(folder)
      const folders = state.folders.some((known) => folderId(known) === id)
        ? state.folders
        : [...state.folders, folder]
      await documents.write(WORKSPACE_DOCUMENT, { folders, current: id })
      return page()
    },

    async select(id) {
      const state = await read()
      if (!state.folders.some((folder) => folderId(folder) === id)) {
        throw new Error(`not a known workspace: ${id}`)
      }
      if (state.current !== id) {
        await documents.write(WORKSPACE_DOCUMENT, { ...state, current: id })
      }
      return page()
    },
  }
}
