/**
 * `PromptStore` over whatever channel the current form provides. The browser
 * form speaks to the dev bridge or the host's own server; a desktop form swaps
 * this for one that calls its main process. Nothing else in the plugin knows
 * the difference.
 */
import { assetRef } from "@context-hub/core"

import {
  PROMPT_ROUTE,
  type PromptAsset,
  type PromptDraft,
  type PromptPatch,
  type PromptPage,
  type PromptStore,
  type StoredPrompt,
} from "./store.ts"

/** What the bridge answers with when it refuses. */
type ErrorBody = { error?: string }

async function call<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, init)
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
export function createRemotePromptStore(base = PROMPT_ROUTE): PromptStore {
  return {
    list: () => call<PromptPage>(base, ""),

    create: (draft: PromptDraft) =>
      call<StoredPrompt>(
        base,
        "",
        write("create", {
          name: draft.name,
          description: draft.description,
          prompt: draft.prompt,
          tags: draft.tags ?? [],
        })
      ),

    update: (id: string, patch: PromptPatch) =>
      call<StoredPrompt>(base, "", write("update", { id, ...patch })),

    remove: (id: string) => call<{ ok: true }>(base, "", write("remove", { id })).then(() => undefined),

    putAsset: (id: string, file: File) =>
      /* Raw bytes: the file object is the body, so the call names its own id and
         the file's name in the query instead. */
      call<PromptAsset>(
        base,
        `?action=put-asset&id=${encodeURIComponent(id)}&name=${encodeURIComponent(file.name)}`,
        {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        }
      ),

    addAssetSource: (id: string, source: string) =>
      call<PromptAsset>(base, "", write("add-asset-source", { id, source })),

    deleteAsset: (id: string, ref: string) =>
      call<{ ok: true }>(base, "", write("delete-asset", { id, ref })).then(() => undefined),

    /* `base` here is the library's own route prefix, and stored media is served
       from the hub's asset route on the same origin — so this one does not
       carry it. */
    assetUrl: (ref) => assetRef(ref),
  }
}
