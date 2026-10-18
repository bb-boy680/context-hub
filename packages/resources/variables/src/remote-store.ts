/**
 * `VariableStore` over whatever channel the current form provides. The browser
 * form speaks to the hub's own server; a desktop form swaps this for one that
 * calls its main process. Nothing else in the plugin knows the difference.
 */
import {
  VARIABLE_ROUTE,
  type VariableDocument,
  type VariableDraft,
  type VariablePatch,
  type VariableStore,
} from "./store.ts"

/** What the bridge answers with when it refuses. */
type ErrorBody = { error?: string }

async function call<T>(base: string, init?: RequestInit): Promise<T> {
  const response = await fetch(base, init)
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ErrorBody
    throw new Error(body.error ?? `${response.status} ${response.statusText}`)
  }
  return (await response.json()) as T
}

/** What a write sends; the shape the bridge's body reader expects. */
function write(action: string, args: Record<string, unknown> = {}): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...args }),
  }
}

/**
 * Build a store that reaches the library over the given base path.
 *
 * @param base — the route prefix the form serves the library on.
 */
export function createRemoteVariableStore(base = VARIABLE_ROUTE): VariableStore {
  return {
    read: () => call<VariableDocument>(base),

    create: (drafts: readonly VariableDraft[]) =>
      call<VariableDocument>(base, write("create", { entries: drafts })),

    update: (name: string, patch: VariablePatch) =>
      call<VariableDocument>(base, write("update", { name, patch })),

    remove: (name: string) =>
      call<VariableDocument>(base, write("remove", { name })),

    createGroup: (group: string) =>
      call<VariableDocument>(base, write("create-group", { group })),
  }
}
