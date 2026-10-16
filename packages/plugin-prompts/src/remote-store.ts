/**
 * `PromptStore` over whatever channel the current form provides. The browser
 * form speaks to the dev bridge or the host's own server; a desktop form swaps
 * this for one that calls its main process. Nothing else in the plugin knows
 * the difference.
 */
import type { PromptDraft, PromptPage, PromptStore, StoredPrompt } from "./store.ts"

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
function write(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }
}

/**
 * Build a store that reaches the library over the given base path.
 *
 * @param base — the route prefix the form serves the library on.
 */
export function createRemotePromptStore(base = "/hub/prompts"): PromptStore {
  return {
    list: () => call<PromptPage>(base, ""),

    create: (draft: PromptDraft) =>
      call<StoredPrompt>(
        base,
        "",
        write({ description: draft.description, prompt: draft.prompt, tags: draft.tags ?? [] })
      ),

    remove: (id: string) =>
      call<{ ok: true }>(base, `/${encodeURIComponent(id)}`, { method: "DELETE" }).then(
        () => undefined
      ),
  }
}
