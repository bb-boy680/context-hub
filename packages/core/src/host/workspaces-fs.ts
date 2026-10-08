/**
 * Disk-backed workspace list: the folders a person has pointed the hub at, kept
 * in the hub home's state directory so the list travels with the hub instead of
 * with one browser profile. This module runs in the process that owns the disk,
 * which is also the only process that can open a folder dialog.
 */
import { displayPath } from "./home.ts"
import { pickFolder } from "./folder-picker.ts"
import { createFsStateStore } from "./state-fs.ts"
import { readWorkspaceState, WORKSPACE_DOCUMENT, workspaceName } from "../workspace.ts"
import type {
  PickedWorkspace,
  WorkspacePage,
  WorkspaceStore,
  WorkspaceState,
  WorkspaceView,
} from "../workspace.ts"

/** Create the workspace store that reads and writes under one hub home. */
export function createFsWorkspaceStore(home: string): WorkspaceStore {
  const documents = createFsStateStore(home)

  const view = (path: string): WorkspaceView => ({
    path,
    name: workspaceName(path),
    display: displayPath(path),
  })

  const read = async (): Promise<WorkspaceState> =>
    readWorkspaceState(await documents.read(WORKSPACE_DOCUMENT))

  const page = async (): Promise<WorkspacePage> => {
    const state = await read()
    return { folders: state.folders.map(view), current: state.current }
  }

  return {
    page,

    async select(path) {
      const state = await read()
      if (!state.folders.includes(path)) throw new Error(`not a known workspace: ${path}`)
      if (state.current !== path) {
        await documents.write(WORKSPACE_DOCUMENT, { ...state, current: path })
      }
      return page()
    },

    async pick(prompt) {
      const chosen = await pickFolder(prompt)
      if (chosen === null) return { cancelled: true, page: await page() } satisfies PickedWorkspace
      const state = await read()
      const folders = state.folders.includes(chosen) ? state.folders : [...state.folders, chosen]
      await documents.write(WORKSPACE_DOCUMENT, { folders, current: chosen })
      return { cancelled: false, page: await page(), picked: view(chosen) } satisfies PickedWorkspace
    },
  }
}
