/**
 * Disk-backed workspace list: the folders a person has pointed the hub at, kept
 * in the hub home's state directory so the list travels with the hub instead of
 * with one browser profile. This module runs in the process that owns the disk,
 * which is where a folder's path becomes a path a person reads.
 */
import path from "node:path"

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
   * without a path — one added before the hub kept paths — takes the path, and
   * so does a row naming a folder beside it.
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
    /* A name a person gave the workspace reads in place of the folder's own. */
    name: folder.alias ?? folder.name,
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
      agent: state.agent,
    }
    await documents.write(WORKSPACE_DOCUMENT, next)
    return next
  }

  /**
   * Every folder a name could mean: one of that name beside a folder the hub
   * already knows. Workspaces are folders a person keeps side by side — this
   * hub's own, and every one already in the list — so that is where the name a
   * browser's dialog reports is looked for.
   */
  const foldersNamed = async (
    state: WorkspaceState,
    name: string
  ): Promise<string[]> => {
    const roots: string[] = []
    if (options.folder !== undefined) {
      roots.push(path.dirname(path.resolve(options.folder)))
    }
    for (const known of state.folders) {
      if (known.path === undefined) continue
      const parent = path.dirname(path.resolve(known.path))
      if (!roots.includes(parent)) roots.push(parent)
    }
    const found: string[] = []
    for (const root of roots) {
      const beside = path.join(root, name)
      if (!found.includes(beside) && (await isDirectory(beside))) found.push(beside)
    }
    return found
  }

  /**
   * The folder a pick names: a path used as given, or a name placed among the
   * folders the hub knows. A name that answers to nothing, or to more than one
   * folder, is refused rather than guessed — a workspace is a folder the hub
   * writes into, so the wrong guess would be somebody else's project.
   */
  const locate = async (target: string): Promise<string> => {
    if (path.isAbsolute(target)) {
      if (!(await isDirectory(target))) throw new Error(`not a folder: ${target}`)
      return target
    }
    if (target === "" || path.basename(target) !== target) {
      throw new Error(`not a folder: ${target}`)
    }
    const found = await foldersNamed(await read(), target)
    const [only] = found
    if (found.length === 1 && only !== undefined) return only
    if (found.length === 0) {
      throw new Error(
        `no folder named ${target} sits beside a folder this hub knows; a browser reports a folder's name alone, so that is where it can be found`
      )
    }
    throw new Error(
      `more than one folder is named ${target}, so the hub cannot tell which: ${found.join(", ")}`
    )
  }

  /**
   * Give every name-only row the folder it names, when exactly one folder
   * answers to that name. A name nothing answers for, or that two folders
   * share, stays as it was: a row is not made up into a path by guessing.
   */
  const adoptNamedRows = async (state: WorkspaceState): Promise<WorkspaceState> => {
    const taken = new Set(state.folders.map(folderId))
    const folders: WorkspaceFolder[] = []
    let current = state.current
    let changed = false
    for (const row of state.folders) {
      if (row.path !== undefined) {
        folders.push(row)
        continue
      }
      const found = await foldersNamed(state, row.name)
      const only = found[0]
      if (found.length !== 1 || only === undefined || taken.has(only)) {
        folders.push(row)
        continue
      }
      folders.push({ ...row, path: only })
      taken.add(only)
      if (current === folderId(row)) current = only
      changed = true
    }
    if (!changed) return state
    const next: WorkspaceState = { folders, current, agent: state.agent }
    await documents.write(WORKSPACE_DOCUMENT, next)
    return next
  }

  const read = async (): Promise<WorkspaceState> =>
    adoptNamedRows(
      await adoptHostFolder(readWorkspaceState(await documents.read(WORKSPACE_DOCUMENT)))
    )

  const page = async (): Promise<WorkspacePage> => {
    const state = await read()
    return { folders: state.folders.map(view), current: state.current, agent: state.agent }
  }

  return {
    page,

    async add(target) {
      const at = await locate(target)
      const folder: WorkspaceFolder = { name: workspaceName(at), path: at }
      const state = await read()
      const id = folderId(folder)
      const folders = state.folders.some((known) => folderId(known) === id)
        ? state.folders
        : [...state.folders, folder]
      await documents.write(WORKSPACE_DOCUMENT, { folders, current: id, agent: state.agent })
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

    async rename(id, name) {
      const state = await read()
      const folder = state.folders.find((known) => folderId(known) === id)
      if (folder === undefined) throw new Error(`not a known workspace: ${id}`)
      const alias = name.trim()
      /* Naming a workspace after its own folder stores nothing and drops any
         earlier name, so the row and the folder cannot disagree. */
      const folders = state.folders.map((known) => {
        if (folderId(known) !== id) return known
        if (alias === "" || alias === known.name) {
          const plain: WorkspaceFolder = { name: known.name }
          if (known.path !== undefined) plain.path = known.path
          return plain
        }
        return { ...known, alias }
      })
      await documents.write(WORKSPACE_DOCUMENT, { ...state, folders })
      return page()
    },

    async remove(id) {
      const state = await read()
      const folder = state.folders.find((known) => folderId(known) === id)
      if (folder === undefined) throw new Error(`not a known workspace: ${id}`)
      if (state.current === id) {
        throw new Error(
          "this workspace is in use; switch to another one before removing it"
        )
      }
      const folders = state.folders.filter((known) => folderId(known) !== id)
      await documents.write(WORKSPACE_DOCUMENT, { ...state, folders })
      return page()
    },

    async selectAgent(id) {
      const state = await read()
      if ((state.agent ?? null) !== id) {
        await documents.write(WORKSPACE_DOCUMENT, { ...state, agent: id })
      }
      return page()
    },
  }
}
