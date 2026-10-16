/**
 * `SkillStore` over whatever channel the current form provides. The browser
 * form speaks to the dev bridge or the host's own server; a desktop form swaps
 * this for one that calls its main process. Nothing else in the plugin knows
 * the difference.
 */
import { assetRef } from "@context-hub/core"

import {
  SKILL_ROUTE,
  type ImportedSkill,
  type PackageSkill,
  type SkillAsset,
  type SkillDetail,
  type SkillDraft,
  type SkillImport,
  type SkillPage,
  type SkillPatch,
  type SkillPlaceRef,
  type SkillQuery,
  type SkillStore,
  type SkillUpdateCheck,
  type SkillUpdateSummary,
  type PlaceSkillDetail as PlaceSkillRecord,
  type PlaceSkillsView as PlaceSkills,
  type SkillInstall,
} from "./store.ts"

/** One page of the catalog as the bridge returns it. */
type ErrorBody = { error?: string }

/** The place a read names, as a query fragment: both halves are always sent. */
function placeQuery(ref: SkillPlaceRef): string {
  return `&scope=${encodeURIComponent(ref.scope)}&dir=${encodeURIComponent(ref.dir)}`
}

/** The place a write names; the shape the bridge's body reader expects. */
function placeBody(ref: SkillPlaceRef): Pick<SkillPlaceRef, "scope" | "dir"> {
  return { scope: ref.scope, dir: ref.dir }
}

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
    if (input.source !== undefined) params.set("source", input.source)
    if (input.sort !== undefined) params.set("sort", input.sort)
    const search = params.toString()
    return search === "" ? "" : `?${search}`
  }

  return {
    root: "host",

    async refresh(): Promise<void> {
      await call(base, `${SKILL_ROUTE}?action=refresh`, { method: "POST" })
    },

    tags(): Promise<string[]> {
      return call<string[]>(base, `${SKILL_ROUTE}?action=tags`)
    },

    list(input?: SkillQuery): Promise<SkillPage> {
      return call<SkillPage>(base, `${SKILL_ROUTE}${query(input)}`)
    },

    get(id: string): Promise<SkillDetail> {
      return call<SkillDetail>(base, `${SKILL_ROUTE}/${encodeURIComponent(id)}`)
    },

    create(draft: SkillDraft): Promise<SkillDetail> {
      return call<SkillDetail>(base, `${SKILL_ROUTE}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      })
    },

    update(id: string, patch: SkillPatch): Promise<SkillDetail> {
      return call<SkillDetail>(base, `${SKILL_ROUTE}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
    },

    async remove(id: string): Promise<void> {
      await call(base, `${SKILL_ROUTE}/${encodeURIComponent(id)}`, {
        method: "DELETE",
      })
    },

    async readFile(id: string, file: string): Promise<string> {
      const body = await call<{ text: string }>(
        base,
        `${SKILL_ROUTE}/${encodeURIComponent(id)}/files/${file}`
      )
      return body.text
    },

    async writeFile(id: string, file: string, text: string): Promise<void> {
      await call(base, `${SKILL_ROUTE}/${encodeURIComponent(id)}/files/${file}`, {
        method: "PUT",
        body: text,
      })
    },

    putAsset(id: string, file: File): Promise<SkillAsset> {
      /* Raw bytes: the file object is the body, so no multipart encoder is needed. */
      return call<SkillAsset>(
        base,
        `${SKILL_ROUTE}/${encodeURIComponent(id)}/assets?name=${encodeURIComponent(file.name)}`,
        {
          method: "POST",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        }
      )
    },

    addAssetSource(id: string, source: string): Promise<SkillAsset> {
      return call<SkillAsset>(
        base,
        `${SKILL_ROUTE}/${encodeURIComponent(id)}/source`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source }),
        }
      )
    },

    async deleteAsset(id: string, ref: string): Promise<void> {
      await call(
        base,
        `${SKILL_ROUTE}/${encodeURIComponent(id)}/assets?ref=${encodeURIComponent(ref)}`,
        { method: "DELETE" }
      )
    },

    listPackage(source: string): Promise<PackageSkill[]> {
      return call<PackageSkill[]>(
        base,
        `${SKILL_ROUTE}?action=package&source=${encodeURIComponent(source)}`
      )
    },

    installPackage(source: string, skills: string[]): Promise<SkillImport> {
      return call<SkillImport>(base, `${SKILL_ROUTE}?action=install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, skills }),
      })
    },

    importFolder(skills: ImportedSkill[]): Promise<SkillImport> {
      return call<SkillImport>(base, `${SKILL_ROUTE}?action=import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skills }),
      })
    },

    assetUrl: (ref) => assetRef(ref, base),

    placeSkills(ref: SkillPlaceRef): Promise<PlaceSkills | null> {
      return call<PlaceSkills | null>(base, `${SKILL_ROUTE}?action=place${placeQuery(ref)}`)
    },

    placeSkill(id: string, ref: SkillPlaceRef): Promise<PlaceSkillRecord | null> {
      return call<PlaceSkillRecord | null>(
        base,
        `${SKILL_ROUTE}?action=place-skill&id=${encodeURIComponent(id)}${placeQuery(ref)}`
      )
    },

    async placeFile(id: string, file: string, ref: SkillPlaceRef): Promise<string> {
      const body = await call<{ text: string }>(
        base,
        `${SKILL_ROUTE}?action=place-file&id=${encodeURIComponent(id)}&path=${encodeURIComponent(file)}${placeQuery(ref)}`
      )
      return body.text
    },

    async installInto(id: string, ref: SkillPlaceRef): Promise<SkillInstall> {
      const body = await call<{ mode: SkillInstall }>(
        base,
        `${SKILL_ROUTE}?action=install-place`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...placeBody(ref) }),
        }
      )
      return body.mode
    },

    async adoptFrom(id: string, ref: SkillPlaceRef): Promise<SkillInstall> {
      const body = await call<{ mode: SkillInstall }>(
        base,
        `${SKILL_ROUTE}?action=adopt-place`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...placeBody(ref) }),
        }
      )
      return body.mode
    },

    async deleteInPlace(id: string, ref: SkillPlaceRef): Promise<void> {
      await call(base, `${SKILL_ROUTE}?action=delete-place`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...placeBody(ref) }),
      })
    },

    async removeFrom(id: string, ref: SkillPlaceRef): Promise<void> {
      await call(base, `${SKILL_ROUTE}?action=remove-place`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...placeBody(ref) }),
      })
    },

    checkUpdate(id: string): Promise<SkillUpdateCheck> {
      return call<SkillUpdateCheck>(
        base,
        `${SKILL_ROUTE}/${encodeURIComponent(id)}/update`
      )
    },

    checkUpdates(): Promise<SkillUpdateSummary> {
      return call<SkillUpdateSummary>(base, `${SKILL_ROUTE}?action=check-updates`, {
        method: "POST",
      })
    },

    async updateFromUpstream(id: string): Promise<void> {
      await call(base, `${SKILL_ROUTE}/${encodeURIComponent(id)}/update`, {
        method: "POST",
      })
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
