/**
 * Disk-backed workspace list: the folders a person has pointed the hub at, kept
 * in the hub home's state directory so the list travels with the hub instead of
 * with one browser profile. This module runs in the process that owns the disk,
 * which is where a folder's path becomes a path a person reads.
 */
import { displayPath } from "./home.ts"
import { createFsStateStore } from "./state-fs.ts"
import { folderId, readWorkspaceState, WORKSPACE_DOCUMENT } from "../workspace.ts"
import type {
  WorkspaceFolder,
  WorkspacePage,
  WorkspaceStore,
  WorkspaceState,
  WorkspaceView,
} from "../workspace.ts"

/** Create the workspace store that reads and writes under one hub home. */
export function createFsWorkspaceStore(home: string): WorkspaceStore {
  const documents = createFsStateStore(home)

  const view = (folder: WorkspaceFolder): WorkspaceView => ({
    id: folderId(folder),
    name: folder.name,
    display: folder.path === undefined ? null : displayPath(folder.path),
  })

  const read = async (): Promise<WorkspaceState> =>
    readWorkspaceState(await documents.read(WORKSPACE_DOCUMENT))

  const page = async (): Promise<WorkspacePage> => {
    const state = await read()
    return { folders: state.folders.map(view), current: state.current }
  }

  return {
    page,

    async add(folder) {
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
