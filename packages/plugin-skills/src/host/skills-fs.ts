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
import { tmpdir } from "node:os"
import path from "node:path"

import { assetKind, assetRef, readSource } from "@workspace/core"
import { createAssetStore } from "@workspace/core"
import { createFsAssetLibrary } from "@workspace/core/host"
import { TEMP_PREFIX, writeFileAtomic } from "@workspace/core/host/atomic"
import { displayPath, resolveHubHome, userHome } from "@workspace/core/host/home"
import { createFsWorkspaceStore } from "@workspace/core/host/workspaces"
import type { AssetStore } from "@workspace/core"
import type { AssetScope } from "@workspace/extensions"

import {
  parseSkillFile,
  starterSkillFile,
  writeSkillFile,
} from "../frontmatter.ts"
import { importFolder } from "./folder-import.ts"
import { walkSkillDir } from "./file-tree.ts"
import { downloadPackageSkills, fetchUpstreamRecords, listPackageSkills } from "./skills-cli.ts"
import { readLockedUpstream, skillFolderHash } from "./upstream.ts"
import {
  deleteSkillIn,
  installSkillInto,
  linkSkillIntoLibrary,
  readPlaceSkill,
  readPlaceSkillFile,
  readPlaceSkills,
  removeSkillFrom,
} from "./place-skills.ts"
import type {
  PlaceSkillDetail as PlaceSkillRecord,
  PlaceSkillsView as PlaceSkills,
  SkillInstall,
  SkillPlaceRef,
} from "../store.ts"
import type {
  ImportedSkill,
  PackageSkill,
  SkillAsset,
  SkillCounts,
  SkillCheck,
  SkillDetail,
  SkillDraft,
  SkillImport,
  SkillOrigin,
  SkillPage,
  SkillPatch,
  SkillQuery,
  SkillStore,
  SkillSummary,
  SkillUpdateCheck,
  SkillUpdateSummary,
  SkillUpstream,
} from "../store.ts"

const CATALOG_FILE = "index.json"
const MANIFEST = "SKILL.md"
const CATALOG_VERSION = 1
/** Sources asked in parallel by one batch check; each run clones a package. */
const CHECK_CONCURRENCY = 3

/** One skill as the catalog records it. */
interface CatalogEntry {
  name: string
  description: string
  tags: string[]
  enabled: boolean
  source: SkillOrigin
  /**
   * The directory this entry is a link to, absolute, when the hub linked a
   * skill in from somewhere else instead of holding the files itself. Absent
   * for a skill whose files live under the library root.
   */
  link?: string
  /** What the skills CLI recorded it was installed from; absent when nothing did. */
  upstream?: SkillUpstream
  /** The last check's answer for this skill; carried by a scan like `upstream`. */
  checked?: SkillCheck
  /** Media references, in the order the UI shows them. */
  assets: string[]
  /** Manifest mtime when this row was last read; drives refreshes. */
  mtimeMs: number
  /** ISO timestamp of the last recorded change; empty for a linked skill. */
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

/**
 * One uploaded file, named so its owner keeps it apart from every other
 * owner's: the skill's id prefixes the name, so two skills that upload a
 * picture of the same name never end up sharing one file — which is what lets
 * either of them drop its own without taking the other's with it.
 *
 * The bytes are not copied: a file is itself valid file data.
 */
function owned(id: string, file: File): File {
  return new File([file], `${id}-${file.name}`, { type: file.type })
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
  /**
   * The directory a global place reads under, which is the person's home by
   * default. A deployment that puts the hub somewhere of its own says so here
   * rather than inheriting whichever account the process runs as.
   */
  userHome?: string
  /**
   * An already-built asset store, for a form that keeps assets its own way —
   * with a sink that uploads them somewhere, say. The hub's own store over
   * `<home>/assets` when absent.
   */
  assets?: AssetStore
}

/** Create the disk-backed store for one hub home. */
export async function createFsSkillStore(
  options: SkillStoreOptions = {}
): Promise<SkillStore> {
  const home = resolveHubHome(options.home)
  const root = skillsRoot(home)
  const homeDir = options.userHome ?? userHome()
  const assets = options.assets ?? createAssetStore(createFsAssetLibrary(home))
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

  /**
   * The directory a place's `dir` is relative to, or `null` when a workspace
   * place has no workspace to read. A global place is always readable: the home
   * directory is the same one whatever workspace is in use.
   */
  const placeBase = async (scope: AssetScope): Promise<string | null> =>
    scope === "global" ? homeDir : currentWorkspace()

  /** The same base, refused when there is nothing under it to read. */
  const requiredBase = async (scope: AssetScope): Promise<string> => {
    const base = await placeBase(scope)
    if (base === null) throw new Error("no workspace is selected")
    return base
  }

  const skillDir = (id: string) =>
    path.join(root, assertSafeSegment(id, "skill id"))

  /** Read one manifest into a catalog row. */
  const readEntry = async (
    id: string,
    previous: CatalogEntry | undefined,
    link: string | undefined
  ): Promise<CatalogEntry | null> => {
    const manifest = path.join(skillDir(id), MANIFEST)
    const stat = await statOrNull(manifest)
    if (stat === null) return null
    /* An untouched manifest keeps its recorded row without re-parsing; a link
       keeps its row only once it carries no date, so a row recorded with one
       is read again and dropped. */
    if (previous !== undefined && previous.mtimeMs === stat.mtimeMs && previous.link === link) {
      if (link === undefined || previous.updatedAt === "") return previous
    }
    const { frontmatter } = parseSkillFile(await fs.readFile(manifest, "utf8"))
    return {
      name: frontmatter.name ?? id,
      description: frontmatter.description ?? "",
      tags: frontmatter.tags ?? [],
      enabled: previous?.enabled ?? true,
      source: previous?.source ?? "local",
      ...(link === undefined ? {} : { link }),
      /* Where the files came from is not in the manifest, so a scan carries
         the recorded answer forward; only an install writes a new one. */
      ...(previous?.upstream === undefined ? {} : { upstream: previous.upstream }),
      /* The last check's answer is the same kind of record: the manifest does
         not carry it, and a scan must not throw it away. */
      ...(previous?.checked === undefined ? {} : { checked: previous.checked }),
      /* A skill's manifest carries no media; the references it had stay as they are. */
      assets: previous?.assets ?? [],
      mtimeMs: stat.mtimeMs,
      /*
       * A linked skill's files are somebody else's: the hub has recorded no
       * change to them, and linking one in changes nothing about its contents.
       * Its manifest time would make a date appear and jump on the adoption
       * alone, so a link carries none.
       */
      updatedAt: link === undefined ? stat.mtime.toISOString() : "",
    }
  }

  /**
   * Walk the skills root and rebuild the catalog. External edits (a copied-in
   * directory, a hand-edited manifest, a deleted folder) reach the list here;
   * recorded fields the manifest does not carry — enablement and asset order —
   * survive.
   *
   * A skill the hub linked in from elsewhere is a directory entry too, reached
   * through the link; it is listed as a skill and remembered as a link, because
   * who owns those files is a different answer.
   */
  const rebuild = async (): Promise<CatalogFile> => {
    const previous =
      catalog ?? (await readJson<CatalogFile | null>(catalogPath, null))
    const entries = await readdirOrEmpty(root)
    const skills: Record<string, CatalogEntry> = {}
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue
      const dir = path.join(root, entry.name)
      let link: string | undefined
      if (entry.isSymbolicLink()) {
        const raw = await fs.readlink(dir).catch(() => null)
        if (raw === null) continue
        const target = path.resolve(root, raw)
        if ((await statOrNull(target))?.isDirectory() !== true) continue
        link = target
      } else if (!entry.isDirectory()) {
        continue
      }
      const row = await readEntry(entry.name, previous?.skills[entry.name], link)
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

  /**
   * Ask each source what it holds now, one CLI run per group: a package that
   * holds several skills is cloned once, and the run reports the hash the CLI
   * itself would record for an install now, so nothing compares by a second
   * implementation. A source that fails is reported, not thrown: the others
   * still answer.
   */
  const askSources = async (
    groups: Map<string, string[]>
  ): Promise<{ latest: Map<string, string>; failed: { name: string; reason: string }[] }> => {
    const latest = new Map<string, string>()
    const failed: { name: string; reason: string }[] = []
    const queue = [...groups]
    let next = 0
    const worker = async (): Promise<void> => {
      while (next < queue.length) {
        const [source, ids] = queue[next++]
        try {
          const answer = await fetchUpstreamRecords(source, ids)
          for (const [name, record] of answer.records) latest.set(name, record.hash)
          for (const [name, reason] of answer.failed) failed.push({ name, reason })
        } catch (failure) {
          const reason = failure instanceof Error ? failure.message : String(failure)
          for (const id of ids) failed.push({ name: id, reason })
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CHECK_CONCURRENCY, queue.length) }, worker)
    )
    return { latest, failed }
  }

  /**
   * Write one check's answers onto their rows, together with the local hash
   * read at the same moment, so a badge and the detail dialog read a whole
   * answer back without asking the network again.
   *
   * @returns the local hashes that were recorded, by skill id.
   */
  const recordChecks = async (
    latest: Map<string, string>
  ): Promise<Map<string, string>> => {
    const hashes = new Map<string, string>()
    for (const id of latest.keys()) {
      /* The files are read where they are, link or not: the question is what
         this copy holds, not which directory holds it. The CLI never hashes
         what is on disk, so this is the one number it cannot supply. */
      const hash = await skillFolderHash(skillDir(id)).catch(() => null)
      if (hash !== null) hashes.set(id, hash)
    }
    if (hashes.size === 0) return hashes
    const at = new Date().toISOString()
    await mutate((skills) => {
      for (const [id, currentHash] of hashes) {
        const row = skills[id]
        const found = latest.get(id)
        if (row === undefined || found === undefined) continue
        skills[id] = { ...row, checked: { at, latest: found, currentHash } }
      }
    })
    return hashes
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

  /** Drop the assets a row held, from wherever each one is kept. */
  const dropStored = async (refs: string[]): Promise<void> => {
    for (const ref of refs) {
      await assets.remove(ref)
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
          !row.description.toLowerCase().includes(needle) &&
          !row.tags.some((tag) => tag.toLowerCase().includes(needle))
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
          ...(row.link === undefined ? {} : { link: row.link }),
          ...(row.upstream === undefined ? {} : { upstream: row.upstream }),
          ...(row.checked === undefined ? {} : { checked: row.checked }),
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
      /*
       * The catalog first, the files second: if the write fails, the files are
       * still there and the next rebuild lists them again, while the other
       * order can leave a row whose directory is already gone — and nothing
       * would ever bring the two back in step.
       */
      await mutate((skills) => {
        delete skills[id]
      })
      await dropStored(row.assets)
      const dir = skillDir(id)
      if ((await fs.lstat(dir).catch(() => null))?.isSymbolicLink() === true) {
        /* A linked skill is somebody else's directory; the hub takes back its
           own link and leaves those files where they are. */
        await fs.rm(dir, { force: true })
      } else {
        await fs.rm(dir, { recursive: true, force: true })
      }
    },

    listPackage(source: string): Promise<PackageSkill[]> {
      return listPackageSkills(source)
    },

    async installPackage(source: string, ids: string[]): Promise<SkillImport> {
      const result = await downloadPackageSkills(source, ids, root)
      await refreshCatalog()
      /* A row says where it came from and which revision, so a download
         records both: they are what a later update check compares against. */
      const arrived = new Set(result.installed)
      if (arrived.size > 0) {
        await mutate((skills) => {
          for (const id of arrived) {
            const row = skills[id]
            if (row === undefined) continue
            const record = result.records?.[id]
            skills[id] = {
              ...row,
              source: "registry",
              ...(record === undefined ? {} : { upstream: record }),
            }
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
      return recordAsset(id, await assets.put(owned(id, file)))
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
      return recordAsset(id, await assets.put(owned(id, parsed.file)))
    },

    async deleteAsset(id: string, ref: string): Promise<void> {
      const current = await loadCatalog()
      const row = current.skills[id]
      if (row === undefined) throw new Error(`unknown skill: ${id}`)
      await assets.remove(ref)
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

    assetUrl: (ref) => assetRef(ref),

    async placeSkills(ref: SkillPlaceRef): Promise<PlaceSkills | null> {
      const base = await placeBase(ref.scope)
      return base === null ? null : readPlaceSkills(base, root, ref.dir)
    },

    async placeSkill(id: string, ref: SkillPlaceRef): Promise<PlaceSkillRecord | null> {
      const base = await placeBase(ref.scope)
      return base === null ? null : readPlaceSkill(base, id, ref.dir)
    },

    async placeFile(id: string, file: string, ref: SkillPlaceRef): Promise<string> {
      const base = await requiredBase(ref.scope)
      const text = await readPlaceSkillFile(base, id, file, ref.dir)
      if (text === null) {
        throw new Error(`the place holds no such file: ${id}/${file}`)
      }
      return text
    },

    async installInto(id: string, ref: SkillPlaceRef): Promise<SkillInstall> {
      const base = await requiredBase(ref.scope)
      return installSkillInto(base, root, id, ref.dir)
    },

    async adoptFrom(id: string, ref: SkillPlaceRef): Promise<SkillInstall> {
      const base = await requiredBase(ref.scope)
      const landed = await linkSkillIntoLibrary(base, root, id, ref.dir)
      /* What the skills CLI installed this from, if it did: the lock beside
         the place's skills is the record, and its hash is what an update
         check compares against. Without it the skill is still listed, but
         nothing can tell whether the upstream moved. */
      const upstream = await readLockedUpstream(base, id)
      await refreshCatalog()
      if (upstream !== null) {
        await mutate((skills) => {
          const row = skills[id]
          if (row !== undefined) skills[id] = { ...row, upstream }
        })
      }
      return landed
    },

    async checkUpdate(id: string): Promise<SkillUpdateCheck> {
      const current = await loadCatalog()
      const row = current.skills[id]
      if (row === undefined) throw new Error(`unknown skill: ${id}`)
      const upstream = row.upstream
      if (upstream === undefined) {
        throw new Error(`no recorded source for this skill, so nothing can be compared: ${id}`)
      }
      const { latest, failed } = await askSources(new Map([[upstream.source, [id]]]))
      const found = latest.get(id)
      if (found === undefined) {
        /* The CLI's own reason is worth more to a person than a generic one. */
        const reason = failed.find((entry) => entry.name === id)?.reason
        throw new Error(reason ?? `the source answered nothing about this skill: ${id}`)
      }
      const recorded = await recordChecks(latest)
      const currentHash = recorded.get(id) ?? found
      return {
        recordedHash: upstream.hash,
        currentHash,
        latestHash: found,
        outdated: found !== upstream.hash,
        modified: currentHash !== upstream.hash,
      }
    },

    async checkUpdates(): Promise<SkillUpdateSummary> {
      const current = await loadCatalog()
      /* One group per source: the CLI answers a whole package in one run. */
      const groups = new Map<string, string[]>()
      for (const [id, row] of Object.entries(current.skills)) {
        const source = row.upstream?.source
        if (source === undefined) continue
        const ids = groups.get(source)
        if (ids === undefined) groups.set(source, [id])
        else ids.push(id)
      }
      const { latest, failed } = await askSources(groups)
      const recorded = await recordChecks(latest)
      let outdated = 0
      let modified = 0
      for (const [id, currentHash] of recorded) {
        const installed = current.skills[id]?.upstream?.hash
        if (installed !== latest.get(id)) outdated += 1
        /* A source that has not moved on does not make a changed copy any less
           changed, so the two are counted apart. */
        if (currentHash !== installed) modified += 1
      }
      return { checked: recorded.size, outdated, modified, failed }
    },

    async updateFromUpstream(id: string): Promise<void> {
      const current = await loadCatalog()
      const row = current.skills[id]
      if (row === undefined) throw new Error(`unknown skill: ${id}`)
      const upstream = row.upstream
      if (upstream === undefined) {
        throw new Error(`no recorded source for this skill, so there is nothing to install from: ${id}`)
      }
      const work = await fs.mkdtemp(path.join(tmpdir(), "context-hub-skill-update-"))
      try {
        const result = await downloadPackageSkills(upstream.source, [id], work)
        const landed = result.installed[0]
        if (landed === undefined) {
          const reason = result.failed.find((entry) => entry.name === id)?.reason
          throw new Error(reason ?? `the skills CLI installed nothing for ${id}`)
        }
        /* The files live in the library's own directory, or in the workspace's
           when the library reaches the skill through a link; that copy is the
           one an update replaces, and the link keeps pointing at it. */
        const held = skillDir(id)
        const isLink = (await fs.lstat(held).catch(() => null))?.isSymbolicLink() === true
        const target = isLink ? await fs.readlink(held) : held
        await replaceDirectory(path.join(work, landed), target)
        /* The hash to record is the one the CLI computed for what it just
           installed, not a second reading of the same bytes. */
        const fresh = result.records?.[landed]?.hash ?? (await skillFolderHash(target))
        await mutate((skills) => {
          const next = skills[id]
          if (next !== undefined) {
            skills[id] = {
              ...next,
              upstream: { ...upstream, hash: fresh },
              /* What the CLI just installed is, by construction, both the
                 source's revision and what the files hold now. */
              checked: {
                at: new Date().toISOString(),
                latest: fresh,
                currentHash: fresh,
              },
            }
          }
        })
      } finally {
        await fs.rm(work, { recursive: true, force: true })
      }
      await refreshCatalog()
    },

    async deleteInPlace(id: string, ref: SkillPlaceRef): Promise<void> {
      const base = await requiredBase(ref.scope)
      await deleteSkillIn(base, id, ref.dir)
    },

    async removeFrom(id: string, ref: SkillPlaceRef): Promise<void> {
      const base = await requiredBase(ref.scope)
      await removeSkillFrom(base, root, id, ref.dir)
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

/**
 * Replace one directory's contents with a fresh copy, keeping the path so a
 * link pointing at it stays valid. The new revision lands beside the target
 * first and the old one is moved aside rather than dropped, so a failure
 * part-way restores what was there instead of leaving an empty skill. Both
 * temporary names start with a dot, which every scan of a skills directory
 * skips, so neither can be mistaken for a skill.
 */
async function replaceDirectory(fresh: string, target: string): Promise<void> {
  const parent = path.dirname(target)
  const name = path.basename(target)
  const staging = path.join(parent, `.${name}.updating`)
  const previous = path.join(parent, `.${name}.previous`)
  await fs.rm(staging, { recursive: true, force: true })
  await fs.rm(previous, { recursive: true, force: true })
  await fs.cp(fresh, staging, { recursive: true, dereference: true })
  const present = (await fs.lstat(target).catch(() => null)) !== null
  if (present) await fs.rename(target, previous)
  try {
    await fs.rename(staging, target)
  } catch (failure) {
    if (present) await fs.rename(previous, target).catch(() => undefined)
    throw failure
  }
  await fs.rm(previous, { recursive: true, force: true }).catch(() => undefined)
}
