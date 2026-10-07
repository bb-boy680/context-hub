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
 * Writes replace files atomically (a sibling temp file renamed into place, with
 * a bounded retry for Windows sharing errors), so a reader never observes a
 * partial manifest or catalog. This module runs in the process that owns the
 * disk; no service sits in front of it.
 */
import { randomUUID } from "node:crypto"
import { promises as fs, watch } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

import {
  parseSkillFile,
  starterSkillFile,
  writeSkillFile,
} from "../frontmatter.ts"
import { assetKind } from "../store.ts"
import type {
  SkillAsset,
  SkillDetail,
  SkillDraft,
  SkillFileEntry,
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
/** Prefix for in-flight replacements; watchers skip it. */
const TEMP_PREFIX = ".tmp-"
/** Upload limits, in bytes. */
const MAX_IMAGE = 5 * 1024 * 1024
const MAX_VIDEO = 25 * 1024 * 1024
const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
}

/** One skill as the catalog records it. */
interface CatalogEntry {
  name: string
  description: string
  tags: string[]
  enabled: boolean
  source: SkillOrigin
  /** Asset file names, in the order the UI shows them. */
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

/** Resolve the Context Hub home: explicit path, then `$CONTEXT_HUB_HOME`, then `~/.context-hub`. */
export function resolveHubHome(explicit?: string): string {
  if (explicit !== undefined && explicit.trim() !== "") return explicit
  const fromEnv = process.env.CONTEXT_HUB_HOME
  if (fromEnv !== undefined && fromEnv.trim() !== "") return fromEnv
  return path.join(homedir(), ".context-hub")
}

/** Where the skill library lives by default. */
export function defaultSkillsRoot(explicitHome?: string): string {
  return path.join(resolveHubHome(explicitHome), "skills")
}

/** How an absolute root is shown to a person, without leaking machine paths. */
export function displayPath(root: string): string {
  const home = homedir()
  return root.startsWith(home) ? `~${root.slice(home.length)}` : root
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

/** Characters no file name may carry: path separators plus the Windows reserved set. */
const RESERVED_IN_NAME = /[\\/:*?"<>|]/

/** Reject an asset name that would escape, hide, or fail to write. */
function assertSafeFileName(value: string): string {
  if (value === "" || value === "." || value === ".." || value.startsWith(".")) {
    throw new Error(`asset name is not allowed: ${value}`)
  }
  if (RESERVED_IN_NAME.test(value)) {
    throw new Error(`asset name is not allowed: ${value}`)
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

/** Windows reports transient sharing failures while another handle closes. */
const RETRYABLE = new Set(["EACCES", "EBUSY", "EPERM"])

/** Write a file by renaming a completed temporary file over it. */
async function writeAtomic(target: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true })
  const temporary = path.join(
    path.dirname(target),
    `${TEMP_PREFIX}${randomUUID()}`
  )
  await fs.writeFile(temporary, text, "utf8")
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fs.rename(temporary, target)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? ""
      if (!RETRYABLE.has(code) || attempt >= 4) {
        await fs.rm(temporary, { force: true })
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)))
    }
  }
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

/** Create the disk-backed store for one skills root. */
export async function createFsSkillStore(
  root = defaultSkillsRoot()
): Promise<SkillStore> {
  await fs.mkdir(root, { recursive: true })
  const catalogPath = path.join(root, CATALOG_FILE)
  const listeners = new Set<() => void>()
  /** In-memory copy of the catalog; a page render never re-reads the file. */
  let catalog: CatalogFile | null = null

  const skillDir = (id: string) =>
    path.join(root, assertSafeSegment(id, "skill id"))

  const listAssets = async (id: string): Promise<string[]> => {
    const entries = await readdirOrEmpty(path.join(skillDir(id), "assets"))
    return entries
      .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .sort()
  }

  /** Assets in recorded order first, then anything dropped in by hand. */
  const orderedAssets = (recorded: string[], present: string[]): string[] => {
    const kept = recorded.filter((file) => present.includes(file))
    return [...kept, ...present.filter((file) => !kept.includes(file))]
  }

  /** Read one manifest into a catalog row. */
  const readEntry = async (
    id: string,
    previous: CatalogEntry | undefined
  ): Promise<CatalogEntry | null> => {
    const manifest = path.join(skillDir(id), MANIFEST)
    const stat = await statOrNull(manifest)
    if (stat === null) return null
    const assets = orderedAssets(previous?.assets ?? [], await listAssets(id))
    /* An untouched manifest keeps its recorded row without re-parsing. */
    if (previous !== undefined && previous.mtimeMs === stat.mtimeMs) {
      return { ...previous, assets }
    }
    const { frontmatter } = parseSkillFile(await fs.readFile(manifest, "utf8"))
    return {
      name: frontmatter.name ?? id,
      description: frontmatter.description ?? "",
      tags: frontmatter.tags ?? [],
      enabled: previous?.enabled ?? true,
      source: previous?.source ?? "local",
      assets,
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
    await writeAtomic(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`)
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

  const detailOf = async (id: string): Promise<SkillDetail> => {
    const current = await loadCatalog()
    const row = current.skills[id]
    if (row === undefined) throw new Error(`unknown skill: ${id}`)
    const dir = skillDir(id)
    const manifest = await fs
      .readFile(path.join(dir, MANIFEST), "utf8")
      .catch(() => null)
    if (manifest === null) throw new Error(`skill has no ${MANIFEST}: ${id}`)
    const files = await walk(dir, dir, 0)
    const assetDetails: SkillAsset[] = []
    for (const file of row.assets) {
      const stat = await statOrNull(path.join(dir, "assets", file))
      assetDetails.push({
        file,
        kind: assetKind(
          file,
          MIME_TYPES[path.extname(file).slice(1).toLowerCase()]
        ),
        bytes: stat?.size ?? 0,
      })
    }
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
      const rows: SkillSummary[] = []
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
        rows.push({
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
      await writeAtomic(manifest, starterSkillFile(draft))
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
        await writeAtomic(
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
      await fs.rm(skillDir(id), { recursive: true, force: true })
      await mutate((skills) => {
        delete skills[id]
      })
    },

    async readFile(id: string, file: string): Promise<string> {
      return fs.readFile(assertSafePath(skillDir(id), file), "utf8")
    },

    async writeFile(id: string, file: string, text: string): Promise<void> {
      await writeAtomic(assertSafePath(skillDir(id), file), text)
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
      const assets = path.join(skillDir(id), "assets")
      await fs.mkdir(assets, { recursive: true })
      const original = assertSafeFileName(path.basename(file.name))
      const extension = path.extname(original).slice(1).toLowerCase()
      const contentType = file.type || MIME_TYPES[extension] || ""
      const kind = assetKind(original, contentType)
      const limit = kind === "video" ? MAX_VIDEO : MAX_IMAGE
      if (file.size > limit) {
        throw new Error(
          `${kind} exceeds the ${Math.round(limit / 1024 / 1024)} MB limit`
        )
      }
      let name = original
      let suffix = 1
      while ((await statOrNull(path.join(assets, name))) !== null) {
        name = `${path.basename(original, path.extname(original))}-${suffix++}${path.extname(original)}`
      }
      /* Write beside the target and rename, so a failed upload leaves no half file. */
      const temporary = path.join(assets, `${TEMP_PREFIX}${randomUUID()}`)
      await fs.writeFile(temporary, Buffer.from(await file.arrayBuffer()))
      await fs.rename(temporary, path.join(assets, name))
      await mutate((skills) => {
        const row = skills[id]
        if (row === undefined) return
        skills[id] = {
          ...row,
          assets: [...row.assets.filter((item) => item !== name), name],
          updatedAt: new Date().toISOString(),
        }
      })
      return { file: name, kind, bytes: file.size }
    },

    async deleteAsset(id: string, file: string): Promise<void> {
      await fs.rm(
        path.join(
          skillDir(id),
          "assets",
          assertSafeFileName(file)
        ),
        {
          force: true,
        }
      )
      await mutate((skills) => {
        const row = skills[id]
        if (row === undefined) return
        skills[id] = {
          ...row,
          assets: row.assets.filter((item) => item !== file),
          updatedAt: new Date().toISOString(),
        }
      })
    },

    assetUrl(id: string, file: string): string {
      return `/hub/skills/${encodeURIComponent(id)}/assets/${encodeURIComponent(file)}`
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

/** Walk a skill directory into flat file entries. */
async function walk(
  dir: string,
  base: string,
  depth: number
): Promise<SkillFileEntry[]> {
  const entries = await readdirOrEmpty(dir)
  const rows: SkillFileEntry[] = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".")) continue
    const absolute = path.join(dir, entry.name)
    const relative = path.relative(base, absolute).split(path.sep).join("/")
    if (entry.isDirectory()) {
      rows.push({ path: relative, depth, directory: true, bytes: 0 })
      rows.push(...(await walk(absolute, base, depth + 1)))
    } else {
      const stat = await statOrNull(absolute)
      rows.push({
        path: relative,
        depth,
        directory: false,
        bytes: stat?.size ?? 0,
      })
    }
  }
  return rows
}
