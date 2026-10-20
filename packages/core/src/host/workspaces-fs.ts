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
  DEFAULT_WORKSPACE_NAME,
  folderId,
  readWorkspaceState,
  WORKSPACE_DOCUMENT,
  workspaceName,
} from "../workspace.ts"
import type {
  WorkspaceAlias,
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
  /**
   * The folder the default workspace points at, when that is not where this
   * host happens to run. A desktop host runs in the person's home, but the dev
   * server and CLI run in a project folder and share the same document: the
   * default must not follow that cwd. Defaults to `folder`.
   */
  defaultFolder?: string
}

/** Create the workspace store that reads and writes under one hub home. */
export function createFsWorkspaceStore(
  home: string,
  options: WorkspaceStoreOptions = {}
): WorkspaceStore {
  const documents = createFsStateStore(home)

  const view = (folder: WorkspaceFolder): WorkspaceView => {
    const alias = folder.alias
    return {
      id: folderId(folder),
      /* A name a person gave the workspace reads in place of the folder's own. */
      name: typeof alias === "string" ? alias : folder.name,
      path: folder.path ?? null,
      display: folder.path === undefined ? null : displayPath(folder.path),
      default: folder.default === true,
      nameKey: typeof alias === "object" && alias !== null ? alias.i18n : null,
    }
  }

  const systemAlias = (): WorkspaceAlias => ({ i18n: DEFAULT_WORKSPACE_NAME })

  /**
   * The same row without its default mark. The system name goes with the mark;
   * a name a person chose stays with the row.
   */
  const plain = (folder: WorkspaceFolder): WorkspaceFolder => {
    const next: WorkspaceFolder = { name: folder.name }
    if (folder.path !== undefined) next.path = folder.path
    if (typeof folder.alias === "string") next.alias = folder.alias
    return next
  }

  /** Write only when the scan actually changed something. */
  const persist = async (
    before: WorkspaceState,
    after: WorkspaceState
  ): Promise<WorkspaceState> => {
    if (JSON.stringify(before) === JSON.stringify(after)) return before
    await documents.write(WORKSPACE_DOCUMENT, after)
    return after
  }

  /**
   * Keep the default workspace in the list. Its folder is the explicit default
   * folder when the host has one — the person's home — else the host's own
   * folder. The row is created once, named by the system until a person renames
   * it, kept at the front, and marked so the store can refuse to remove it. A
   * default row that points elsewhere is stale when an explicit default folder
   * is given, so it loses the mark and the wanted row takes its place.
   */
  const ensureHostWorkspace = async (state: WorkspaceState): Promise<WorkspaceState> => {
    const wanted = options.defaultFolder
    const folder = wanted ?? options.folder

    const found = state.folders.findIndex(
      (known) => known.default === true && (wanted === undefined || known.path === wanted)
    )
    if (found !== -1) {
      const kept = state.folders[found]
      if (kept === undefined) return state
      const rest = state.folders
        .filter((_, at) => at !== found)
        .map((known) => (known.default === true ? plain(known) : known))
      return persist(state, {
        folders: [kept.alias === undefined ? { ...kept, alias: systemAlias() } : kept, ...rest],
        current: state.current ?? folderId(kept),
        agents: state.agents,
      })
    }

    /* A folder that is not there cannot be the default workspace. */
    if (folder === undefined || !(await isDirectory(folder))) return state

    /* An explicit default folder makes every other default mark stale: the
       person's home is the default no matter which form starts first. */
    const base =
      wanted === undefined
        ? state.folders
        : state.folders.map((known) => (known.default === true ? plain(known) : known))

    const existing = base.findIndex((known) => known.path === folder)
    if (existing !== -1) {
      const row = base[existing]
      if (row === undefined) return state
      const upgraded: WorkspaceFolder = {
        ...row,
        alias: row.alias ?? systemAlias(),
        default: true,
      }
      return persist(state, {
        folders: [upgraded, ...base.filter((_, at) => at !== existing)],
        current: state.current ?? folderId(upgraded),
        agents: state.agents,
      })
    }

    const name = workspaceName(folder)
    const named = base.findIndex(
      (known) => known.path === undefined && known.name === name
    )
    if (named !== -1) {
      const row = base[named]
      if (row === undefined) return state
      const upgraded: WorkspaceFolder = {
        ...row,
        path: folder,
        alias: row.alias ?? systemAlias(),
        default: true,
      }
      return persist(state, {
        folders: [upgraded, ...base.filter((_, at) => at !== named)],
        current:
          state.current === null || state.current === folderId(row)
            ? folderId(upgraded)
            : state.current,
        agents: state.agents,
      })
    }

    const host: WorkspaceFolder = {
      name,
      path: folder,
      alias: systemAlias(),
      default: true,
    }
    return persist(state, {
      folders: [host, ...base],
      current: state.current ?? folderId(host),
      agents: state.agents,
    })
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
    const next: WorkspaceState = { folders, current, agents: state.agents }
    await documents.write(WORKSPACE_DOCUMENT, next)
    return next
  }

  const read = async (): Promise<WorkspaceState> =>
    adoptNamedRows(
      await ensureHostWorkspace(readWorkspaceState(await documents.read(WORKSPACE_DOCUMENT)))
    )

  const page = async (): Promise<WorkspacePage> => {
    const state = await read()
    return { folders: state.folders.map(view), current: state.current, agents: state.agents }
  }

  /**
   * Run one change after the previous one finished. Every change is a
   * read-modify-write of one document, so two of them interleaving would let the
   * later write undo the earlier one — and a person choosing two agents in quick
   * succession is exactly that.
   */
  let tail: Promise<unknown> = Promise.resolve()
  const run = <T>(change: () => Promise<T>): Promise<T> => {
    const next = tail.then(change, change)
    tail = next.catch(() => undefined)
    return next
  }

  return {
    page,

    add: (target) =>
      run(async () => {
        const at = await locate(target)
        const folder: WorkspaceFolder = { name: workspaceName(at), path: at }
        const state = await read()
        const id = folderId(folder)
        const folders = state.folders.some((known) => folderId(known) === id)
          ? state.folders
          : [...state.folders, folder]
        await documents.write(WORKSPACE_DOCUMENT, { folders, current: id, agents: state.agents })
        return page()
      }),

    select: (id) =>
      run(async () => {
        const state = await read()
        if (!state.folders.some((folder) => folderId(folder) === id)) {
          throw new Error(`not a known workspace: ${id}`)
        }
        if (state.current !== id) {
          await documents.write(WORKSPACE_DOCUMENT, { ...state, current: id })
        }
        return page()
      }),

    rename: (id, name) =>
      run(async () => {
        const state = await read()
        const folder = state.folders.find((known) => folderId(known) === id)
        if (folder === undefined) throw new Error(`not a known workspace: ${id}`)
        const alias = name.trim()
        const folders = state.folders.map((known) => {
          if (folderId(known) !== id) return known
          /* The default workspace always reads as something: an empty name
             restores the system name instead of falling back to the folder's. */
          if (known.default === true) {
            return { ...known, alias: alias === "" ? systemAlias() : alias }
          }
          /* Naming a workspace after its own folder stores nothing and drops any
             earlier name, so the row and the folder cannot disagree. */
          if (alias === "" || alias === known.name) {
            const next: WorkspaceFolder = { name: known.name }
            if (known.path !== undefined) next.path = known.path
            return next
          }
          return { ...known, alias }
        })
        await documents.write(WORKSPACE_DOCUMENT, { ...state, folders })
        return page()
      }),

    remove: (id) =>
      run(async () => {
        const state = await read()
        const folder = state.folders.find((known) => folderId(known) === id)
        if (folder === undefined) throw new Error(`not a known workspace: ${id}`)
        if (folder.default === true) {
          throw new Error("the default workspace cannot be removed")
        }
        if (state.current === id) {
          throw new Error(
            "this workspace is in use; switch to another one before removing it"
          )
        }
        const folders = state.folders.filter((known) => folderId(known) !== id)
        await documents.write(WORKSPACE_DOCUMENT, { ...state, folders })
        return page()
      }),

    setAgent: (id, on) =>
      run(async () => {
        const state = await read()
        const chosen = state.agents.includes(id)
        if (chosen === on) return page()
        const agents = on
          ? [...state.agents, id]
          : state.agents.filter((known) => known !== id)
        await documents.write(WORKSPACE_DOCUMENT, { ...state, agents })
        return page()
      }),
  }
}
