/**
 * `SkillStore` over whatever channel the current form provides. The browser
 * form speaks to the dev bridge or the host's own server; a desktop form swaps
 * this for one that calls its main process. Nothing else in the plugin knows
 * the difference.
 */
import type {
  SkillAsset,
  SkillDetail,
  SkillDraft,
  SkillPage,
  SkillPatch,
  SkillQuery,
  SkillStore,
} from "./store.ts"

/** One page of the catalog as the bridge returns it. */
type ErrorBody = { error?: string }

async function call<T>(
  base: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${base}${path}`, init)
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ErrorBody
    throw new Error(body.error ?? `${response.status} ${response.statusText}`)
  }
  return (await response.json()) as T
}

/** Build a store that reaches the library over the given base path. */
export function createRemoteSkillStore(base = ""): SkillStore {
  const query = (input: SkillQuery = {}) => {
    const params = new URLSearchParams()
    if (input.offset !== undefined) params.set("offset", String(input.offset))
    if (input.limit !== undefined) params.set("limit", String(input.limit))
    if (input.q !== undefined) params.set("q", input.q)
    if (input.tag !== undefined) params.set("tag", input.tag)
    if (input.enabled !== undefined) params.set("enabled", String(input.enabled))
    if (input.sort !== undefined) params.set("sort", input.sort)
    const search = params.toString()
    return search === "" ? "" : `?${search}`
  }

  return {
    root: "host",

    async refresh(): Promise<void> {
      await call(base, "/hub/skills?action=refresh", { method: "POST" })
    },

    tags(): Promise<string[]> {
      return call<string[]>(base, "/hub/skills?action=tags")
    },

    list(input?: SkillQuery): Promise<SkillPage> {
      return call<SkillPage>(base, `/hub/skills${query(input)}`)
    },

    get(id: string): Promise<SkillDetail> {
      return call<SkillDetail>(base, `/hub/skills/${encodeURIComponent(id)}`)
    },

    create(draft: SkillDraft): Promise<SkillDetail> {
      return call<SkillDetail>(base, "/hub/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      })
    },

    update(id: string, patch: SkillPatch): Promise<SkillDetail> {
      return call<SkillDetail>(base, `/hub/skills/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
    },

    async remove(id: string): Promise<void> {
      await call(base, `/hub/skills/${encodeURIComponent(id)}`, {
        method: "DELETE",
      })
    },

    async readFile(id: string, file: string): Promise<string> {
      const body = await call<{ text: string }>(
        base,
        `/hub/skills/${encodeURIComponent(id)}/files/${file}`
      )
      return body.text
    },

    async writeFile(id: string, file: string, text: string): Promise<void> {
      await call(base, `/hub/skills/${encodeURIComponent(id)}/files/${file}`, {
        method: "PUT",
        body: text,
      })
    },

    putAsset(id: string, file: File): Promise<SkillAsset> {
      /* Raw bytes: the file object is the body, so no multipart encoder is needed. */
      return call<SkillAsset>(
        base,
        `/hub/skills/${encodeURIComponent(id)}/assets?name=${encodeURIComponent(file.name)}`,
        {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        }
      )
    },

    async deleteAsset(id: string, file: string): Promise<void> {
      await call(
        base,
        `/hub/skills/${encodeURIComponent(id)}/assets/${encodeURIComponent(file)}`,
        { method: "DELETE" }
      )
    },

    assetUrl(id: string, file: string): string {
      return `${base}/hub/skills/${encodeURIComponent(id)}/assets/${encodeURIComponent(file)}`
    },

    subscribe(): () => void {
      /* The bridge reports no changes yet; callers refresh after their own writes. */
      return () => undefined
    },

    dispose(): void {
      /* The channel owns its lifetime; this store holds no resource. */
    },
  }
}
