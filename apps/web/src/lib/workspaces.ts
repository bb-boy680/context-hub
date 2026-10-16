/**
 * The workspace list as this form keeps it. The list lives in the hub's own
 * directory behind the dev server, so the form holds the page it last read and
 * tells everyone who asks when it changes: the sidebar menu and the pages that
 * read the current folder share one service, so they cannot disagree about
 * which workspace is in use.
 */
import * as React from "react"

import { WORKSPACE_ROUTE } from "@context-hub/core/workspace"
import type { WorkspacePage, WorkspaceService } from "@context-hub/core/workspace"
import { useHub } from "@context-hub/extensions/react"

/** A failure explained for the menu. */
function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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

/** Create the service the browser form provides on the kernel. */
export function createRemoteWorkspaceService(): WorkspaceService {
  let page: WorkspacePage | null = null
  let failure: string | null = null
  const listeners = new Set<() => void>()

  const announce = () => {
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

    async refresh() {
      try {
        page = await call<WorkspacePage>(WORKSPACE_ROUTE, "GET")
        failure = null
      } catch (error) {
        failure = reasonOf(error)
      }
      announce()
    },

    async select(id) {
      try {
        return settle(await call<WorkspacePage>(`${WORKSPACE_ROUTE}/select`, "POST", { id }))
      } catch (error) {
        return refuse(error)
      }
    },

    async add(path) {
      try {
        return settle(await call<WorkspacePage>(`${WORKSPACE_ROUTE}/add`, "POST", { path }))
      } catch (error) {
        return refuse(error)
      }
    },

    async setAgent(id, on) {
      try {
        return settle(await call<WorkspacePage>(`${WORKSPACE_ROUTE}/agent`, "POST", { id, on }))
      } catch (error) {
        return refuse(error)
      }
    },

    async rename(id, name) {
      try {
        return settle(await call<WorkspacePage>(`${WORKSPACE_ROUTE}/rename`, "POST", { id, name }))
      } catch (error) {
        return refuse(error)
      }
    },

    async remove(id) {
      try {
        return settle(await call<WorkspacePage>(`${WORKSPACE_ROUTE}/remove`, "POST", { id }))
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
