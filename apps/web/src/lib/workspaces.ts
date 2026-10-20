/**
 * The workspace list as this form keeps it. The list lives in the hub's own
 * directory behind the dev server, so the form holds the page it last read and
 * tells everyone who asks when it changes: the sidebar menu and the pages that
 * read the current folder share one service, so they cannot disagree about
 * which workspace is in use.
 */
import * as React from "react"

import { DEFAULT_WORKSPACE_NAME, WORKSPACE_ROUTE } from "@context-hub/core/workspace"
import type {
  WorkspacePage,
  WorkspaceService,
  WorkspaceView,
} from "@context-hub/core/workspace"
import { useHub } from "@context-hub/extensions/react"

/** A failure explained for the menu. */
function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Whether two answers describe the same list, as a watcher would read it. */
function samePage(left: WorkspacePage | null, right: WorkspacePage | null): boolean {
  if (left === null || right === null) return left === right
  if (left.current !== right.current) return false
  if (left.folders.length !== right.folders.length) return false
  if (left.agents.length !== right.agents.length) return false
  if (left.agents.some((agent, at) => agent !== right.agents[at])) return false
  return left.folders.every((folder, at) => {
    const other = right.folders[at]
    return (
      other !== undefined &&
      folder.id === other.id &&
      folder.name === other.name &&
      folder.path === other.path &&
      folder.display === other.display &&
      folder.default === other.default &&
      folder.nameKey === other.nameKey
    )
  })
}

/** The text a sidebar row shows: a system name translated, else the row's own. */
export function workspaceLabel(
  folder: WorkspaceView,
  t: (key: string) => string
): string {
  return folder.nameKey === null ? folder.name : t(folder.nameKey)
}

/**
 * What the rename field submits. The default workspace submits an empty name,
 * which restores its system name; every other row submits what was typed.
 */
export function renameSubmission(
  defaultWorkspace: boolean,
  next: string,
  t: (key: string) => string
): string {
  if (!defaultWorkspace) return next
  const trimmed = next.trim()
  return trimmed === "" || trimmed === t(DEFAULT_WORKSPACE_NAME) ? "" : next
}

async function call<T>(url: string, method: "GET" | "POST", body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const reported = (payload as { error?: unknown } | null)?.error
    throw new Error(typeof reported === "string" ? reported : `${response.status} ${response.statusText}`)
  }
  if (payload === null) throw new Error("the hub did not answer for its workspaces")
  return payload as T
}

/**
 * Create the service the browser form provides on the kernel.
 *
 * @param base — origin the route is served on; empty for the current one.
 */
export function createRemoteWorkspaceService(base = ""): WorkspaceService {
  let page: WorkspacePage | null = null
  let failure: string | null = null
  const listeners = new Set<() => void>()
  /* The read in flight, if there is one. Startup asks for this and so does every
     library that needs to know which folder it is reading in, and those are the
     same question: one request answers all of them. */
  let refreshing: Promise<void> | null = null
  /* What watchers were last told. A read that answered the same thing it did
     last time tells nobody — which is not politeness: the libraries that ask for
     this list are the ones watching it, so announcing an unchanged answer is
     what turned "read again after this changed" into a loop. */
  let told = { page: null as WorkspacePage | null, failure: null as string | null }

  const announce = () => {
    if (told.failure === failure && samePage(told.page, page)) return
    told = { page, failure }
    for (const listener of [...listeners]) listener()
  }

  const settle = (next: WorkspacePage): true => {
    page = next
    failure = null
    announce()
    return true
  }

  const refuse = (error: unknown): false => {
    failure = reasonOf(error)
    announce()
    return false
  }

  return {
    current: () => page,
    failure: () => failure,

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    refresh() {
      refreshing ??= (async () => {
        try {
          page = await call<WorkspacePage>(`${base}${WORKSPACE_ROUTE}`, "GET")
          failure = null
        } catch (error) {
          failure = reasonOf(error)
        } finally {
          refreshing = null
        }
        announce()
      })()
      return refreshing
    },

    async select(id) {
      try {
        return settle(await call<WorkspacePage>(`${base}${WORKSPACE_ROUTE}`, "POST", { action: "select", id }))
      } catch (error) {
        return refuse(error)
      }
    },

    async add(path) {
      try {
        return settle(await call<WorkspacePage>(`${base}${WORKSPACE_ROUTE}`, "POST", { action: "add", path }))
      } catch (error) {
        return refuse(error)
      }
    },

    async setAgent(id, on) {
      try {
        return settle(
          await call<WorkspacePage>(`${base}${WORKSPACE_ROUTE}`, "POST", { action: "agent", id, on })
        )
      } catch (error) {
        return refuse(error)
      }
    },

    async rename(id, name) {
      try {
        return settle(
          await call<WorkspacePage>(`${base}${WORKSPACE_ROUTE}`, "POST", { action: "rename", id, name })
        )
      } catch (error) {
        return refuse(error)
      }
    },

    async remove(id) {
      try {
        return settle(await call<WorkspacePage>(`${base}${WORKSPACE_ROUTE}`, "POST", { action: "remove", id }))
      } catch (error) {
        return refuse(error)
      }
    },
  }
}

/** Nothing to follow when this form provides no workspace list. */
const NO_LISTENERS: (listener: () => void) => () => void = () => () => undefined

/** Read the form's workspace list, re-rendering on every change to it. */
export function useWorkspaces(): {
  page: WorkspacePage | null
  failure: string | null
  select(id: string): void
  /** Choose or give up one agent this hub delivers to. */
  setAgent(id: string, on: boolean): void
  /** Add a folder and make it current; answers why the hub refused it, or `null`. */
  add(path: string): Promise<string | null>
  /** Give one workspace a name of its own; answers why the hub refused it, or `null`. */
  rename(id: string, name: string): Promise<string | null>
  /** Drop one workspace from the list; answers why the hub refused it, or `null`. */
  remove(id: string): Promise<string | null>
} {
  const ctx = useHub()
  const service = React.useMemo(() => ctx.get("hub.workspaces") ?? null, [ctx])

  const subscribe = React.useCallback(
    (listener: () => void) => service?.subscribe(listener) ?? NO_LISTENERS(listener),
    [service]
  )
  const readPage = React.useCallback(() => service?.current() ?? null, [service])
  const readFailure = React.useCallback(() => service?.failure() ?? null, [service])
  const page = React.useSyncExternalStore(subscribe, readPage)
  const failure = React.useSyncExternalStore(subscribe, readFailure)

  const select = React.useCallback(
    (id: string) => {
      void service?.select(id)
    },
    [service]
  )
  const setAgent = React.useCallback(
    (id: string, on: boolean) => {
      void service?.setAgent(id, on)
    },
    [service]
  )
  const add = React.useCallback(
    async (path: string) => {
      if (service === null) return "this form has no workspace list"
      return (await service.add(path)) ? null : (service.failure() ?? "the hub refused it")
    },
    [service]
  )
  const rename = React.useCallback(
    async (id: string, name: string) => {
      if (service === null) return "this form has no workspace list"
      return (await service.rename(id, name)) ? null : (service.failure() ?? "the hub refused it")
    },
    [service]
  )
  const remove = React.useCallback(
    async (id: string) => {
      if (service === null) return "this form has no workspace list"
      return (await service.remove(id)) ? null : (service.failure() ?? "the hub refused it")
    },
    [service]
  )

  return { page, failure, select, setAgent, add, rename, remove }
}
