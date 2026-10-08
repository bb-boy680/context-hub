/**
 * `SkillStore` over whatever channel the current form provides. The browser
 * form speaks to the dev bridge or the host's own server; a desktop form swaps
 * this for one that calls its main process. Nothing else in the plugin knows
 * the difference.
 */
import { assetUrl, isLink } from "@workspace/core"

import type {
  ImportedSkill,
  PackageSkill,
  SkillAsset,
  SkillDetail,
  SkillDraft,
  SkillImport,
  SkillPage,
  SkillPatch,
  SkillQuery,
  SkillStore,
  SkillUpdateCheck,
  WorkspaceInstall,
  WorkspaceSkillDetail as WorkspaceSkillRecord,
  WorkspaceSkillsView as WorkspaceSkills,
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
    if (input.source !== undefined) params.set("source", input.source)
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

    addAssetSource(id: string, source: string): Promise<SkillAsset> {
      return call<SkillAsset>(
        base,
        `/hub/skills/${encodeURIComponent(id)}/source`,
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
        `/hub/skills/${encodeURIComponent(id)}/assets?ref=${encodeURIComponent(ref)}`,
        { method: "DELETE" }
      )
    },

    listPackage(source: string): Promise<PackageSkill[]> {
      return call<PackageSkill[]>(
        base,
        `/hub/skills?action=package&source=${encodeURIComponent(source)}`
      )
    },

    installPackage(source: string, skills: string[]): Promise<SkillImport> {
      return call<SkillImport>(base, "/hub/skills?action=install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, skills }),
      })
    },

    importFolder(skills: ImportedSkill[]): Promise<SkillImport> {
      return call<SkillImport>(base, "/hub/skills?action=import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skills }),
      })
    },

    assetUrl(ref: string): string {
      return isLink(ref) ? ref : assetUrl(ref, base)
    },

    workspaceSkills(): Promise<WorkspaceSkills | null> {
      return call<WorkspaceSkills | null>(base, "/hub/skills?action=workspace")
    },

    workspaceSkill(id: string): Promise<WorkspaceSkillRecord | null> {
      return call<WorkspaceSkillRecord | null>(
        base,
        `/hub/skills?action=workspace-skill&id=${encodeURIComponent(id)}`
      )
    },

    async installToWorkspace(id: string): Promise<WorkspaceInstall> {
      const body = await call<{ mode: WorkspaceInstall }>(
        base,
        "/hub/skills?action=install-workspace",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        }
      )
      return body.mode
    },

    async importFromWorkspace(id: string): Promise<WorkspaceInstall> {
      const body = await call<{ mode: WorkspaceInstall }>(
        base,
        "/hub/skills?action=import-workspace",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        }
      )
      return body.mode
    },

    async deleteWorkspaceSkill(id: string): Promise<void> {
      await call(base, "/hub/skills?action=delete-workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
    },

    async removeFromWorkspace(id: string): Promise<void> {
      await call(base, "/hub/skills?action=remove-workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
    },

    checkUpdate(id: string): Promise<SkillUpdateCheck> {
      return call<SkillUpdateCheck>(
        base,
        `/hub/skills/${encodeURIComponent(id)}/update`
      )
    },

    async updateFromUpstream(id: string): Promise<void> {
      await call(base, `/hub/skills/${encodeURIComponent(id)}/update`, {
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
