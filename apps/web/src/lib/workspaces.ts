/**
 * The workspace the hub is pointed at, as this form sees it. The list lives in
 * the hub's own directory behind the dev server, so the page keeps no copy of
 * it; the folder dialog belongs to this form, so picking happens here and the
 * chosen folder is reported to the hub. A form the hub cannot answer fails
 * loud, and the menu stays usable apart from the action that needs the disk.
 */
import * as React from "react"

import { WORKSPACE_ROUTE } from "@workspace/core/workspace"
import type { WorkspacePage } from "@workspace/core/workspace"

import { pickFolderName } from "@/lib/folder-picker"

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
  select(id: string): void
  /** Ask this form for a folder, and hand it to the hub. */
  add(): void
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

  const select = React.useCallback((id: string) => {
    void call<WorkspacePage>(`${WORKSPACE_ROUTE}/select`, "POST", { id })
      .then((updated) => {
        setPage(updated)
        setFailure(null)
      })
      .catch((error: unknown) => setFailure(reasonOf(error)))
  }, [])

  const add = React.useCallback(() => {
    setPending(true)
    void (async () => {
      try {
        const name = await pickFolderName()
        /* A dismissed dialog is not a change, so nothing is written. */
        if (name !== null) setPage(await call<WorkspacePage>(`${WORKSPACE_ROUTE}/add`, "POST", { name }))
        setFailure(null)
      } catch (error) {
        setFailure(reasonOf(error))
      } finally {
        setPending(false)
      }
    })()
  }, [])

  return { page, failure, pending, select, add }
}
