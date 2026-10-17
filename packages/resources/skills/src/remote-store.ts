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

/** One read, named by its action in the query. */
function read<T>(base: string, query: string): Promise<T> {
  return call<T>(base, `${SKILL_ROUTE}${query === "" ? "" : `?${query}`}`)
}

/** One write, named by its action in the body. */
function write<T>(base: string, action: string, args: Record<string, unknown> = {}): Promise<T> {
  return call<T>(base, SKILL_ROUTE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...args }),
  })
}

/** One uploaded file, whose bytes are the body and whose action rides in the query. */
function upload<T>(base: string, action: string, args: Record<string, string>, body: BodyInit, type: string): Promise<T> {
  const params = new URLSearchParams({ action, ...args })
  return call<T>(base, `${SKILL_ROUTE}?${params.toString()}`, {
    method: "POST",
    headers: { "Content-Type": type },
    body,
  })
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
      await write(base, "refresh")
    },

    tags(): Promise<string[]> {
      return read<string[]>(base, "action=tags")
    },

    list(input?: SkillQuery): Promise<SkillPage> {
      const search = query(input)
      return read<SkillPage>(base, search.startsWith("?") ? search.slice(1) : search)
    },

    get(name: string): Promise<SkillDetail> {
      return call<SkillDetail>(base, `${SKILL_ROUTE}/${encodeURIComponent(name)}`)
    },

    create(draft: SkillDraft): Promise<SkillDetail> {
      return write<SkillDetail>(base, "create", { ...draft })
    },

    update(name: string, patch: SkillPatch): Promise<SkillDetail> {
      return write<SkillDetail>(base, "update", { name, ...patch })
    },

    async remove(name: string): Promise<void> {
      await write(base, "remove", { name })
    },

    async readFile(name: string, file: string): Promise<string> {
      const params = new URLSearchParams({ action: "file", name, path: file })
      const body = await read<{ text: string }>(base, params.toString())
      return body.text
    },

    async writeFile(name: string, file: string, text: string): Promise<void> {
      await write(base, "write-file", { name, path: file, text })
    },

    putAsset(name: string, file: File): Promise<SkillAsset> {
      /* Raw bytes: the file object is the body, so the skill's name and the
         name the file is stored under ride in the query instead. */
      return upload<SkillAsset>(
        base,
        "put-asset",
        { name, file: file.name },
        file,
        file.type || "application/octet-stream"
      )
    },

    addAssetSource(name: string, source: string): Promise<SkillAsset> {
      return write<SkillAsset>(base, "add-asset-source", { name, source })
    },

    async deleteAsset(name: string, ref: string): Promise<void> {
      await write(base, "delete-asset", { name, ref })
    },

    listPackage(source: string): Promise<PackageSkill[]> {
      return read<PackageSkill[]>(base, `action=package&source=${encodeURIComponent(source)}`)
    },

    installPackage(source: string, skills: string[]): Promise<SkillImport> {
      return write<SkillImport>(base, "install", { source, skills })
    },

    importFolder(skills: ImportedSkill[]): Promise<SkillImport> {
      return write<SkillImport>(base, "import", { skills })
    },

    assetUrl: (ref) => assetRef(ref, base),

    placeSkills(ref: SkillPlaceRef): Promise<PlaceSkills | null> {
      return read<PlaceSkills | null>(base, `action=place${placeQuery(ref)}`)
    },

    placeSkill(name: string, ref: SkillPlaceRef): Promise<PlaceSkillRecord | null> {
      return read<PlaceSkillRecord | null>(
        base,
        `action=place-skill&name=${encodeURIComponent(name)}${placeQuery(ref)}`
      )
    },

    async placeFile(name: string, file: string, ref: SkillPlaceRef): Promise<string> {
      const body = await read<{ text: string }>(
        base,
        `action=place-file&name=${encodeURIComponent(name)}&path=${encodeURIComponent(file)}${placeQuery(ref)}`
      )
      return body.text
    },

    async installInto(name: string, ref: SkillPlaceRef): Promise<SkillInstall> {
      const body = await write<{ mode: SkillInstall }>(base, "install-place", {
        name,
        ...placeBody(ref),
      })
      return body.mode
    },

    async adoptFrom(name: string, ref: SkillPlaceRef): Promise<SkillInstall> {
      const body = await write<{ mode: SkillInstall }>(base, "adopt-place", {
        name,
        ...placeBody(ref),
      })
      return body.mode
    },

    async deleteInPlace(name: string, ref: SkillPlaceRef): Promise<void> {
      await write(base, "delete-place", { name, ...placeBody(ref) })
    },

    async removeFrom(name: string, ref: SkillPlaceRef): Promise<void> {
      await write(base, "remove-place", { name, ...placeBody(ref) })
    },

    /* A write, not a read: the answer is recorded on the row. */
    checkUpdate(name: string): Promise<SkillUpdateCheck> {
      return write<SkillUpdateCheck>(base, "check-update", { name })
    },

    checkUpdates(): Promise<SkillUpdateSummary> {
      return write<SkillUpdateSummary>(base, "check-updates")
    },

    async updateFromUpstream(name: string): Promise<void> {
      await write(base, "update-from-upstream", { name })
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
