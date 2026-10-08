/**
 * The disk-backed skill library. Two files carry the state, with one owner each:
 *
 * - `<root>/<id>/SKILL.md` — the portable truth for one skill. YAML frontmatter
 *   plus body; an agent reads it directly, and a copied directory keeps its
 *   name, description, and tags.
 * - `<root>/index.json` — the catalog the list renders. One read serves a page,
 *   so browsing never walks directories; `refresh()` is the only scan, and it
 *   reconciles the catalog with the manifests after external edits.
 *
 * A skill's media is a reference, not a file in its directory: a remote URL the
 * hub leaves alone, or a path into the hub's asset library, which this store
 * deletes together with the reference. Uploaded bytes never enter the skill
 * directory, so copying a skill around carries the links and nothing else.
 *
 * Writes replace files atomically (a sibling temp file renamed into place, with
 * a bounded retry for Windows sharing errors), so a reader never observes a
 * partial manifest or catalog. This module runs in the process that owns the
 * disk; no service sits in front of it.
 */
import { promises as fs, watch } from "node:fs"
import path from "node:path"

import { assetKind, assetUrl, isLink, readSource } from "@workspace/core"
import { createFsAssetLibrary } from "@workspace/core/host"
import { TEMP_PREFIX, writeFileAtomic } from "@workspace/core/host/atomic"
import { displayPath, resolveHubHome } from "@workspace/core/host/home"
import { createFsWorkspaceStore } from "@workspace/core/host/workspaces"
import type { AssetLibrary } from "@workspace/core"

import {
  parseSkillFile,
  starterSkillFile,
  writeSkillFile,
} from "../frontmatter.ts"
import { importFolder } from "./folder-import.ts"
import { walkSkillDir } from "./file-tree.ts"
import { downloadPackageSkills, listPackageSkills } from "./skills-cli.ts"
import {
  installSkillIntoWorkspace,
  readWorkspaceSkill,
  readWorkspaceSkills,
  removeSkillFromWorkspace,
} from "./workspace-skills.ts"
import type {
  WorkspaceInstall,
  WorkspaceSkillDetail as WorkspaceSkillRecord,
  WorkspaceSkillsView as WorkspaceSkills,
} from "../store.ts"
import type {
  ImportedSkill,
  PackageSkill,
  SkillAsset,
  SkillCounts,
  SkillDetail,
  SkillDraft,
  SkillImport,
  SkillOrigin,
  SkillPage,
  SkillPatch,
  SkillQuery,
  SkillStore,
  SkillSummary,
} from "../store.ts"

const CATALOG_FILE = "index.json"
const MANIFEST = "SKILL.md"
const CATALOG_VERSION = 1

/** One skill as the catalog records it. */
interface CatalogEntry {
  name: string
  description: string
  tags: string[]
  enabled: boolean
  source: SkillOrigin
  /** Media references, in the order the UI shows them. */
  assets: string[]
  /** Manifest mtime when this row was last read; drives refreshes. */
  mtimeMs: number
  updatedAt: string
}

interface CatalogFile {
  version: number
  revision: number
  skills: Record<string, CatalogEntry>
}

/** Where the skill library lives under one hub home. */
export function skillsRoot(home: string): string {
  return path.join(home, "skills")
}

/** Reject anything that could escape the skill directory. */
function assertSafeSegment(value: string, what: string): string {
  if (
    value === "" ||
    value.includes("/") ||
    value.includes("\\") ||
    value.includes("..")
  ) {
    throw new Error(`${what} may not contain a path separator`)
  }
  return value
}

/** Reject a relative path that climbs out of the skill directory. */
function assertSafePath(base: string, relative: string): string {
  const resolved = path.resolve(base, relative)
  const prefix = base.endsWith(path.sep) ? base : base + path.sep
  if (!resolved.startsWith(prefix))
    throw new Error(`path escapes the skill directory: ${relative}`)
  return resolved
}

/** Make a display name safe to use as a directory name. */
function toId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T
  } catch {
    /* Absent, unreadable, or malformed state falls back to a rebuilt catalog. */
    return fallback
  }
}

async function statOrNull(target: string) {
  try {
    return await fs.stat(target)
  } catch {
    return null
  }
}

/** List the entries of a directory, or nothing when it does not exist. */
async function readdirOrEmpty(dir: string) {
  try {
    return await fs.readdir(dir, { withFileTypes: true })
  } catch {
    /* An absent directory is an empty one. */
    return []
  }
}

/** What a disk-backed store needs to know about where it writes. */
export interface SkillStoreOptions {
  /** Hub home; skills live in `<home>/skills` and their files in `<home>/assets`. */
  home?: string
  /**
   * The folder this host works in: it is a workspace without anyone picking it,
   * and its `.agents/skills` is what the workspace half of the page reads.
   */
  folder?: string
  /** An already-built library, for a form that shares one across features. */
  library?: AssetLibrary
}

/** Create the disk-backed store for one hub home. */
export async function createFsSkillStore(
  options: SkillStoreOptions = {}
): Promise<SkillStore> {
  const home = resolveHubHome(options.home)
  const root = skillsRoot(home)
  const library = options.library ?? createFsAssetLibrary(home)
  await fs.mkdir(root, { recursive: true })
  const catalogPath = path.join(root, CATALOG_FILE)
  const listeners = new Set<() => void>()
  /** In-memory copy of the catalog; a page render never re-reads the file. */
  let catalog: CatalogFile | null = null
  /** The workspace list holds the folder a skill installs into. */
  const workspaces = createFsWorkspaceStore(home, { folder: options.folder })

  /** The current workspace folder, or `null` when none is picked or it has no path. */
  const currentWorkspace = async (): Promise<string | null> => {
    const page = await workspaces.page()
    const folder = page.folders.find((item) => item.id === page.current)
    return folder?.path ?? null
  }

  /** The current workspace, refused when there is no folder to install into. */
  const requiredWorkspace = async (): Promise<string> => {
    const workspace = await currentWorkspace()
    if (workspace === null) throw new Error("no workspace is selected")
    return workspace
  }

  const skillDir = (id: string) =>
    path.join(root, assertSafeSegment(id, "skill id"))

  /** Read one manifest into a catalog row. */
  const readEntry = async (
    id: string,
    previous: CatalogEntry | undefined
  ): Promise<CatalogEntry | null> => {
    const manifest = path.join(skillDir(id), MANIFEST)
    const stat = await statOrNull(manifest)
    if (stat === null) return null
    /* An untouched manifest keeps its recorded row without re-parsing. */
    if (previous !== undefined && previous.mtimeMs === stat.mtimeMs) {
      return previous
    }
    const { frontmatter } = parseSkillFile(await fs.readFile(manifest, "utf8"))
    return {
      name: frontmatter.name ?? id,
      description: frontmatter.description ?? "",
      tags: frontmatter.tags ?? [],
      enabled: previous?.enabled ?? true,
      source: previous?.source ?? "local",
      /* A skill's manifest carries no media; the references it had stay as they are. */
      assets: previous?.assets ?? [],
      mtimeMs: stat.mtimeMs,
      updatedAt: stat.mtime.toISOString(),
    }
  }

  /**
   * Walk the skills root and rebuild the catalog. External edits (a copied-in
   * directory, a hand-edited manifest, a deleted folder) reach the list here;
   * recorded fields the manifest does not carry — enablement and asset order —
   * survive.
   */
  const rebuild = async (): Promise<CatalogFile> => {
    const previous =
      catalog ?? (await readJson<CatalogFile | null>(catalogPath, null))
    const entries = await readdirOrEmpty(root)
    const skills: Record<string, CatalogEntry> = {}
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue
      const row = await readEntry(entry.name, previous?.skills[entry.name])
      if (row !== null) skills[entry.name] = row
    }
    return {
      version: CATALOG_VERSION,
      revision: previous?.revision ?? 0,
      skills,
    }
  }

  /** Publish the catalog atomically; the revision lets callers skip unchanged pages. */
  const saveCatalog = async (next: CatalogFile): Promise<CatalogFile> => {
    catalog = { ...next, revision: next.revision + 1 }
    await writeFileAtomic(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`)
    return catalog
  }

  /** Index the root and publish the result; the only directory scan. */
  const refreshCatalog = async (): Promise<CatalogFile> => saveCatalog(await rebuild())

  const loadCatalog = async (): Promise<CatalogFile> => {
    if (catalog !== null) return catalog
    /*
     * First use indexes the root once, so edits made while the app was closed
     * are seen; every read after that serves the catalog file without a scan.
     */
    return refreshCatalog()
  }

  const mutate = async (
    change: (skills: Record<string, CatalogEntry>) => void
  ): Promise<void> => {
    const current = await loadCatalog()
    const skills = { ...current.skills }
    change(skills)
    await saveCatalog({ ...current, skills })
  }

  /** Record one reference last in the display order. */
  const recordAsset = async (id: string, ref: string): Promise<SkillAsset> => {
    const kind = assetKind(ref)
    await mutate((skills) => {
      const row = skills[id]
      if (row === undefined) return
      skills[id] = {
        ...row,
        assets: [...row.assets.filter((item) => item !== ref), ref],
        updatedAt: new Date().toISOString(),
      }
    })
    return { ref, kind }
  }

  /** Drop references the hub does not own from a row that is going away. */
  const dropStored = async (refs: string[]): Promise<void> => {
    for (const ref of refs) {
      if (!isLink(ref)) await library.remove(ref)
    }
  }

  const detailOf = async (id: string): Promise<SkillDetail> => {
    const current = await loadCatalog()
    const row = current.skills[id]
    if (row === undefined) throw new Error(`unknown skill: ${id}`)
    const dir = skillDir(id)
    const manifest = await fs
      .readFile(path.join(dir, MANIFEST), "utf8")
      .catch(() => null)
    if (manifest === null) throw new Error(`skill has no ${MANIFEST}: ${id}`)
    const files = await walkSkillDir(dir)
    const assetDetails: SkillAsset[] = row.assets.map((ref) => ({
      ref,
      kind: assetKind(ref),
    }))
    return {
      id,
      name: row.name,
      description: row.description,
      tags: row.tags,
      source: row.source,
      enabled: row.enabled,
      assets: row.assets,
      updatedAt: row.updatedAt,
      body: parseSkillFile(manifest).body,
      files,
      assetDetails,
    }
  }

  const store: SkillStore = {
    root,

    async refresh(): Promise<void> {
      await refreshCatalog()
    },

    async tags(): Promise<string[]> {
      const current = await loadCatalog()
      const found = new Set<string>()
      for (const row of Object.values(current.skills)) {
        for (const tag of row.tags) found.add(tag)
      }
      return [...found].sort((a, b) => a.localeCompare(b))
    },

    async list(query: SkillQuery = {}): Promise<SkillPage> {
      const current = await loadCatalog()
      const needle = query.q?.trim().toLowerCase()
      const matching: SkillSummary[] = []
      for (const [id, row] of Object.entries(current.skills)) {
        if (query.tag !== undefined && !row.tags.includes(query.tag)) continue
        if (query.enabled !== undefined && row.enabled !== query.enabled) continue
        if (
          needle !== undefined &&
          needle !== "" &&
          !row.name.toLowerCase().includes(needle) &&
          !row.description.toLowerCase().includes(needle)
        ) {
          continue
        }
        matching.push({
          id,
          name: row.name,
          description: row.description,
          tags: row.tags,
          source: row.source,
          enabled: row.enabled,
          assets: row.assets,
          updatedAt: row.updatedAt,
        })
      }
      /* Counted before the origin filter, so every tab keeps its size while chosen. */
      const counts: SkillCounts = {
        all: matching.length,
        builtin: 0,
        local: 0,
        registry: 0,
      }
      for (const row of matching) counts[row.source] += 1
      const rows =
        query.source === undefined
          ? matching
          : matching.filter((row) => row.source === query.source)
      rows.sort((a, b) => {
        if (query.sort === "name") return a.name.localeCompare(b.name)
        /* Newest first, id as the tiebreaker so paging never drifts. */
        return (
          b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)
        )
      })
      const offset = Math.max(0, query.offset ?? 0)
      const limit = query.limit ?? rows.length
      return {
        items: rows.slice(offset, offset + limit),
        total: rows.length,
        counts,
        revision: current.revision,
        root: displayPath(root),
      }
    },

    get: detailOf,

    async create(draft: SkillDraft): Promise<SkillDetail> {
      const base = toId(draft.name)
      if (base === "")
        throw new Error("name must contain at least one letter or digit")
      const current = await loadCatalog()
      let id = base
      let suffix = 1
      while (
        current.skills[id] !== undefined ||
        (await statOrNull(skillDir(id))) !== null
      ) {
        id = `${base}-${suffix++}`
      }
      const dir = skillDir(id)
      await fs.mkdir(path.join(dir, "assets"), { recursive: true })
      await fs.mkdir(path.join(dir, "references"), { recursive: true })
      await fs.mkdir(path.join(dir, "scripts"), { recursive: true })
      const manifest = path.join(dir, MANIFEST)
      await writeFileAtomic(manifest, starterSkillFile(draft))
      const stat = await statOrNull(manifest)
      await mutate((skills) => {
        skills[id] = {
          name: draft.name,
          description: draft.description,
          tags: draft.tags ?? [],
          enabled: true,
          source: "local",
          assets: [],
          mtimeMs: stat?.mtimeMs ?? Date.now(),
          updatedAt: new Date().toISOString(),
        }
      })
      return detailOf(id)
    },

    async update(id: string, patch: SkillPatch): Promise<SkillDetail> {
      const current = await loadCatalog()
      const row = current.skills[id]
      if (row === undefined) throw new Error(`unknown skill: ${id}`)
      const manifest = path.join(skillDir(id), MANIFEST)
      let mtimeMs = row.mtimeMs
      if (patch.description !== undefined || patch.tags !== undefined) {
        const text = await fs.readFile(manifest, "utf8")
        await writeFileAtomic(
          manifest,
          writeSkillFile(text, {
            description: patch.description,
            tags: patch.tags,
          })
        )
        mtimeMs = (await statOrNull(manifest))?.mtimeMs ?? mtimeMs
      }
      await mutate((skills) => {
        skills[id] = {
          ...row,
          description: patch.description ?? row.description,
          tags: patch.tags ?? row.tags,
          enabled: patch.enabled ?? row.enabled,
          mtimeMs,
          updatedAt: new Date().toISOString(),
        }
      })
      return detailOf(id)
    },

    async remove(id: string): Promise<void> {
      const current = await loadCatalog()
      const row = current.skills[id]
      if (row === undefined) throw new Error(`unknown skill: ${id}`)
      /* Files first: a failure leaves the row intact rather than orphaning them. */
      await dropStored(row.assets)
      await fs.rm(skillDir(id), { recursive: true, force: true })
      await mutate((skills) => {
        delete skills[id]
      })
    },

    listPackage(source: string): Promise<PackageSkill[]> {
      return listPackageSkills(source)
    },

    async installPackage(source: string, ids: string[]): Promise<SkillImport> {
      const result = await downloadPackageSkills(source, ids, root)
      await refreshCatalog()
      /* A row says where it came from, so a download records its source. */
      const arrived = new Set(result.installed)
      if (arrived.size > 0) {
        await mutate((skills) => {
          for (const id of arrived) {
            const row = skills[id]
            if (row !== undefined) skills[id] = { ...row, source: "registry" }
          }
        })
      }
      return result
    },

    async importFolder(skills: ImportedSkill[]): Promise<SkillImport> {
      const result = await importFolder(skills, root)
      await refreshCatalog()
      return result
    },

    async readFile(id: string, file: string): Promise<string> {
      return fs.readFile(assertSafePath(skillDir(id), file), "utf8")
    },

    async writeFile(id: string, file: string, text: string): Promise<void> {
      await writeFileAtomic(assertSafePath(skillDir(id), file), text)
      await mutate((skills) => {
        const row = skills[id]
        if (row !== undefined)
          skills[id] = { ...row, updatedAt: new Date().toISOString() }
      })
    },

    async putAsset(id: string, file: File): Promise<SkillAsset> {
      const current = await loadCatalog()
      if (current.skills[id] === undefined)
        throw new Error(`unknown skill: ${id}`)
      const ref = await library.put(
        file.name,
        new Uint8Array(await file.arrayBuffer()),
        file.type
      )
      return recordAsset(id, ref)
    },

    async addAssetSource(id: string, source: string): Promise<SkillAsset> {
      const current = await loadCatalog()
      const row = current.skills[id]
      if (row === undefined) throw new Error(`unknown skill: ${id}`)
      const parsed = readSource(source)
      if (parsed.kind === "link") {
        /* Re-adding a link keeps one entry; the hub does not own it. */
        if (row.assets.includes(parsed.ref)) {
          return { ref: parsed.ref, kind: assetKind(parsed.ref) }
        }
        return recordAsset(id, parsed.ref)
      }
      const ref = await library.put(
        parsed.name,
        parsed.bytes,
        parsed.contentType
      )
      return recordAsset(id, ref)
    },

    async deleteAsset(id: string, ref: string): Promise<void> {
      const current = await loadCatalog()
      const row = current.skills[id]
      if (row === undefined) throw new Error(`unknown skill: ${id}`)
      if (!isLink(ref)) await library.remove(ref)
      await mutate((skills) => {
        const next = skills[id]
        if (next === undefined) return
        skills[id] = {
          ...next,
          assets: next.assets.filter((item) => item !== ref),
          updatedAt: new Date().toISOString(),
        }
      })
    },

    assetUrl(ref: string): string {
      return isLink(ref) ? ref : assetUrl(ref)
    },

    async workspaceSkills(): Promise<WorkspaceSkills | null> {
      const workspace = await currentWorkspace()
      return workspace === null ? null : readWorkspaceSkills(workspace, root)
    },

    async workspaceSkill(id: string): Promise<WorkspaceSkillRecord | null> {
      const workspace = await currentWorkspace()
      return workspace === null ? null : readWorkspaceSkill(workspace, id)
    },

    async installToWorkspace(id: string): Promise<WorkspaceInstall> {
      const workspace = await requiredWorkspace()
      return installSkillIntoWorkspace(workspace, root, id)
    },

    async removeFromWorkspace(id: string): Promise<void> {
      const workspace = await requiredWorkspace()
      await removeSkillFromWorkspace(workspace, root, id)
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    dispose(): void {
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
      watcher?.close()
      listeners.clear()
    },
  }

  /* Directory watching: external edits rebuild the catalog, then notify once. */
  let timer: NodeJS.Timeout | undefined
  const notify = (filename: string | null) => {
    /* Our own catalog and temp files are not external edits. */
    if (
      filename === CATALOG_FILE ||
      (filename?.startsWith(TEMP_PREFIX) ?? false)
    )
      return
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      void refreshCatalog()
        .then(() => {
          for (const listener of listeners) listener()
        })
        .catch(() => {
          /* A failed rebuild keeps the previous catalog; the next event retries. */
        })
    }, 300)
  }
  let watcher: ReturnType<typeof watch> | undefined
  try {
    watcher = watch(root, { recursive: true }, (_event, filename) => notify(filename))
  } catch {
    /* Recursive watching is unavailable here; callers can ask for a refresh. */
  }

  return store
}
