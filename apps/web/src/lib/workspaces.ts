/**
 * The workspace the hub is pointed at, as this form sees it. The list lives in
 * the hub's own directory behind the dev server, so the page keeps no copy of
 * it; picking a folder opens a dialog on the machine that owns the disk, which
 * is why that one request stays open until somebody chooses a folder or
 * cancels. A form that cannot answer for the list reports why, and the menu
 * stays usable apart from the action that needs the disk.
 */
import * as React from "react"

import { WORKSPACE_ROUTE } from "@workspace/core/workspace"
import type { PickedWorkspace, WorkspacePage } from "@workspace/core/workspace"

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

/** The workspace list and the two things a menu can do with it. */
export interface Workspaces {
  /** Every known folder; `null` until the hub answers. */
  page: WorkspacePage | null
  /** Why the last call failed, ready to show. */
  failure: string | null
  /** True while the folder dialog is up. */
  pending: boolean
  /** Make one known folder current. */
  select(path: string): void
  /** Ask for a folder, remember it, and make it current. */
  pick(prompt: string): void
}

/** Read and change the workspace list, re-rendering the caller on every change. */
export function useWorkspaces(): Workspaces {
  const [page, setPage] = React.useState<WorkspacePage | null>(null)
  const [failure, setFailure] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  React.useEffect(() => {
    let live = true
    void call<WorkspacePage>(WORKSPACE_ROUTE, "GET")
      .then((loaded) => {
        if (live) setPage(loaded)
      })
      .catch((error: unknown) => {
        if (live) setFailure(reasonOf(error))
      })
    return () => {
      live = false
    }
  }, [])

  const select = React.useCallback((path: string) => {
    void call<WorkspacePage>(`${WORKSPACE_ROUTE}/select`, "POST", { path })
      .then((updated) => {
        setPage(updated)
        setFailure(null)
      })
      .catch((error: unknown) => setFailure(reasonOf(error)))
  }, [])

  const pick = React.useCallback((prompt: string) => {
    setPending(true)
    void call<PickedWorkspace>(`${WORKSPACE_ROUTE}/pick`, "POST", { prompt })
      .then((result) => {
        setPage(result.page)
        setFailure(null)
      })
      .catch((error: unknown) => setFailure(reasonOf(error)))
      .finally(() => setPending(false))
  }, [])

  return { page, failure, pending, select, pick }
}
