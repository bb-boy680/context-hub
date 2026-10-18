/**
 * What the variables page reads: the shared library, wired to React.
 *
 * The read itself is not made here. It is the library's own shared read, so a
 * form can start it before this page is ever opened and the names are already
 * there when it is; what lives here is the wiring between that read and the
 * screen — and a fallback start, for a page opened in a form that never asked.
 */
import * as React from "react"

import { createCatalog, type Catalog } from "@context-hub/extensions"
import { useCatalog, useHub } from "@context-hub/extensions/react"

import {
  NOTHING_READ,
  type VariableLibrary,
  type VariableLibraryValue,
} from "./library-store.ts"
import type {
  VariableDocument,
  VariableDraft,
  VariablePatch,
  VariableStore,
} from "./store.ts"

/**
 * What a page watches when this module is not loaded: always empty, never
 * reading. It exists so that watching a library is one code path rather than a
 * hook called inside a condition.
 */
const NOTHING: Catalog<VariableLibraryValue> = createCatalog({
  initial: NOTHING_READ,
  read: async () => NOTHING_READ,
})

/** What the page draws and can do. */
export interface VariablesLibrary {
  /** The form's store, or `null` when this form cannot reach one. */
  store: VariableStore | null
  /** The whole library, or `null` before an answer. */
  document: VariableDocument | null
  /** A read is under way and there is no answer yet. */
  loading: boolean
  /** Why the last read failed, or `null`. */
  failure: string | null
  reload(): Promise<void>
  create(drafts: readonly VariableDraft[]): Promise<void>
  edit(name: string, patch: VariablePatch): Promise<void>
  remove(name: string): Promise<void>
  createGroup(group: string): Promise<void>
  renameGroup(from: string, to: string): Promise<void>
  removeGroup(group: string): Promise<void>
}

/** Read and change the variable library. */
export function useVariableLibrary(): VariablesLibrary {
  const ctx = useHub()
  const shared = React.useMemo(() => ctx.get("catalog.variables") ?? null, [ctx])
  const catalog = shared ?? NOTHING

  React.useEffect(() => {
    /* Somebody has to be the first to ask. A form's startup does this before
       anything is drawn; until it does, the page is what asks. */
    void shared?.load()
  }, [shared])

  const value = useCatalog(catalog, (snapshot) => snapshot.value ?? NOTHING_READ)
  const failure = useCatalog(catalog, (snapshot) => snapshot.failure)
  const status = useCatalog(catalog, (snapshot) => snapshot.status)

  const store = shared?.store() ?? null

  const requireService = React.useCallback((): VariableLibrary => {
    if (shared === null) throw new Error("this form has no variable library")
    return shared
  }, [shared])

  const reload = React.useCallback(async () => {
    await shared?.reload()
  }, [shared])

  const create = React.useCallback(
    async (drafts: readonly VariableDraft[]) => {
      await requireService().create(drafts)
    },
    [requireService]
  )

  const edit = React.useCallback(
    async (name: string, patch: VariablePatch) => {
      await requireService().edit(name, patch)
    },
    [requireService]
  )

  const remove = React.useCallback(
    async (name: string) => {
      await requireService().remove(name)
    },
    [requireService]
  )

  const createGroup = React.useCallback(
    async (group: string) => {
      await requireService().createGroup(group)
    },
    [requireService]
  )

  const renameGroup = React.useCallback(
    async (from: string, to: string) => {
      await requireService().renameGroup(from, to)
    },
    [requireService]
  )

  const removeGroup = React.useCallback(
    async (group: string) => {
      await requireService().removeGroup(group)
    },
    [requireService]
  )

  return {
    store,
    document: value.document,
    loading: store !== null && (status === "idle" || status === "loading"),
    failure,
    reload,
    create,
    edit,
    remove,
    createGroup,
    renameGroup,
    removeGroup,
  }
}
