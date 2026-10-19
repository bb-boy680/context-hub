/**
 * The disk-backed skill library. Two files carry the state, with one owner each:
 *
 * - `<root>/skills.json` — the hub's record of one skill per row: what a list
 *   renders, plus the facts a manifest cannot carry (`enabled`, the media it
 *   references, where it was installed from, the last update answer). This file
 *   is the truth for `description` and `tags`; editing them here never writes
 *   the manifest back.
 * - `<root>/<name>/SKILL.md` — the skill itself. An agent reads it directly, so
 *   a newly created skill still receives frontmatter; after that the hub leaves
 *   the file alone. A directory arriving from outside — copied in, or installed
 *   by the skills CLI — seeds its row from this file the first time it is seen.
 *
 * A row is keyed by its name, which is also the directory it lives in.
 * `refresh()` is the only scan; it reconciles the record with the directories,
 * so an externally added or removed skill reaches the list and an externally
 * edited manifest does not overwrite what the record says.
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

import { assetKind, assetRef, imageRefsOf, isLink, readSource } from "@context-hub/core"
import type { AssetImageStats, AssetLocalizeSummary } from "@context-hub/core"
import { downloadRemoteImage } from "@context-hub/core/host/remote-image"
import type { InstallMode } from "@context-hub/extensions"
import { createAssetStore } from "@context-hub/core"
import { createFsAssetLibrary } from "@context-hub/core/host"
import { TEMP_PREFIX, writeFileAtomic } from "@context-hub/core/host/atomic"
import { displayPath, resolveHubHome, userHome } from "@context-hub/core/host/home"
import { createFsWorkspaceStore } from "@context-hub/core/host/workspaces"
import type { AssetStore } from "@context-hub/core"
import type { AssetScope } from "@context-hub/extensions"

import { parseSkillFile, starterSkillFile } from "../frontmatter.ts"
import type { Frontmatter } from "../frontmatter.ts"
import { importFolder } from "./folder-import.ts"
import { walkSkillDir } from "./file-tree.ts"
import { assertNewSkillName } from "./names.ts"
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

const CATALOG_FILE = "skills.json"
/** What older builds wrote, moved into `skills.json` on first use. */
const LEGACY_CATALOG_FILE = "index.json"
const MANIFEST = "SKILL.md"
/** Sources asked in parallel by one batch check; each run clones a package. */
const CHECK_CONCURRENCY = 3

/** One skill as the catalog records it. */
interface CatalogEntry {
  /** The row's identity, and the directory under the skills root it lives in. */
  name: string
  description: string
  tags: string[]
  enabled: boolean
  source: SkillOrigin
  /**
   * The directory this entry is a link to, absolute, when the hub linked a
   * skill in from somewhere else instead of holding the files itself. Absent
   * for a skill whose files live under the library root.
   *
   * The filesystem is the only thing that knows this, so it is read on every
   * scan and never written to `skills.json`.
   */
  link?: string
  /** What the skills CLI recorded it was installed from; absent when nothing did. */
  upstream?: SkillUpstream
  /** The last check's answer for this skill; carried by a scan like `upstream`. */
  checked?: SkillCheck
  /** Media references, in the order the UI shows them. */
  assets: string[]
  /** Manifest mtime when this row was last scanned. */
  mtimeMs: number
  /** ISO timestamp of the last recorded change; empty for a linked skill. */
  updatedAt: string
}

interface CatalogFile {
  skills: Record<string, CatalogEntry>
}

/**
 * One row as the file holds it. The key order is fixed so a diff shows the
 * value that changed, not the path that built the row; `link` is left out
 * because it is a fact about the filesystem, read again by every scan.
 */
function serializeEntry(entry: CatalogEntry): Record<string, unknown> {
  return {
    name: entry.name,
    description: entry.description,
    tags: entry.tags,
    enabled: entry.enabled,
    source: entry.source,
    assets: entry.assets,
    mtimeMs: entry.mtimeMs,
    updatedAt: entry.updatedAt,
    ...(entry.upstream === undefined ? {} : { upstream: entry.upstream }),
    ...(entry.checked === undefined ? {} : { checked: entry.checked }),
  }
}

/** The whole record: rows in name order, two-space JSON, one closing newline. */
function serializeCatalog(skills: Record<string, CatalogEntry>): string {
  const rows = Object.values(skills)
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(serializeEntry)
  return `${JSON.stringify(rows, null, 2)}\n`
}

/** One recorded row, read defensively: a hand-edited file must not crash a scan. */
function entryOf(record: Record<string, unknown>, name: string): CatalogEntry {
  return {
    name,
    description: typeof record.description === "string" ? record.description : "",
    tags: Array.isArray(record.tags)
      ? record.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    enabled: record.enabled !== false,
    source:
      record.source === "builtin" || record.source === "registry"
        ? record.source
        : "local",
    assets: Array.isArray(record.assets)
      ? record.assets.filter((item): item is string => typeof item === "string")
      : [],
    mtimeMs: typeof record.mtimeMs === "number" ? record.mtimeMs : 0,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
    ...(record.upstream === undefined
      ? {}
      : { upstream: record.upstream as SkillUpstream }),
    ...(record.checked === undefined ? {} : { checked: record.checked as SkillCheck }),
  }
}

/**
 * Read the record. A row is only a row when it carries a non-empty name, which
 * is both its identity and its directory; anything else is skipped rather than
 * guessed at. A file that will not parse reads as no rows, and the scan then
 * seeds every directory from its manifest.
 */
async function readCatalogFile(file: string): Promise<Record<string, CatalogEntry>> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await fs.readFile(file, "utf8"))
  } catch {
    return {}
  }
  if (!Array.isArray(parsed)) return {}
  const skills: Record<string, CatalogEntry> = {}
  for (const row of parsed) {
    if (typeof row !== "object" || row === null) continue
    const record = row as Record<string, unknown>
    if (typeof record.name !== "string" || record.name === "") continue
    skills[record.name] = entryOf(record, record.name)
  }
  return skills
}

/** The hub-owned fields of one manifest, or `null` when it cannot be read. */
async function readManifestFrontmatter(file: string): Promise<Frontmatter | null> {
  const text = await fs.readFile(file, "utf8").catch(() => null)
  return text === null ? null : parseSkillFile(text).frontmatter
}

/**
 * Read the old `{ version, revision, skills: { <id>: row } }` shape, keyed by
 * directory. `null` means the file is there but is not that shape, which is a
 * reason to leave it alone rather than replace it.
 */
async function readLegacyCatalog(
  file: string
): Promise<Record<string, CatalogEntry> | null> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await fs.readFile(file, "utf8"))
  } catch {
    return null
  }
  if (typeof parsed !== "object" || parsed === null) return null
  const skills = (parsed as { skills?: unknown }).skills
  if (typeof skills !== "object" || skills === null || Array.isArray(skills)) {
    return null
  }
  const rows: Record<string, CatalogEntry> = {}
  for (const [id, value] of Object.entries(skills as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null) continue
    rows[id] = entryOf(value as Record<string, unknown>, id)
  }
  return rows
}

/**
 * Move the record an older build left behind into `skills.json`.
 *
 * The old file is not a cache: `enabled`, `source`, `assets`, `upstream` and
 * `checked` are recorded there and nowhere else, so rebuilding from manifests
 * would lose them. Every row keeps those as they are; `description` and `tags`
 * are read again from the manifest, because the old reader could not parse a
 * block scalar and wrote the indicator in their place.
 *
 * A `skills.json` already present wins by name — a person may have written one
 * by hand. The new file is written before the old one is removed, so a failure
 * leaves everything readable and the next start tries again.
 */
async function migrateLegacyCatalog(root: string): Promise<void> {
  const legacyPath = path.join(root, LEGACY_CATALOG_FILE)
  if ((await statOrNull(legacyPath)) === null) return
  const legacy = await readLegacyCatalog(legacyPath)
  if (legacy === null) return
  const catalogPath = path.join(root, CATALOG_FILE)
  const current = await readCatalogFile(catalogPath)
  const merged: Record<string, CatalogEntry> = { ...legacy, ...current }
  for (const [name, row] of Object.entries(legacy)) {
    if (current[name] !== undefined) continue
    const frontmatter = await readManifestFrontmatter(
      path.join(root, name, MANIFEST)
    )
    if (frontmatter === null) continue
    merged[name] = {
      ...row,
      description: frontmatter.description ?? "",
      tags: frontmatter.tags ?? [],
    }
  }
  await writeFileAtomic(catalogPath, serializeCatalog(merged))
  await fs.rm(legacyPath, { force: true })
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
 * owner's: the skill's name prefixes the file name, so two skills that upload a
 * picture of the same name never end up sharing one file — which is what lets
 * either of them drop its own without taking the other's with it.
 *
 * The bytes are not copied: a file is itself valid file data.
 */
function owned(name: string, file: File): File {
  return new File([file], `${name}-${file.name}`, { type: file.type })
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
  /* Before anything reads: the old record carries fields no manifest has. */
  await migrateLegacyCatalog(root)
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

  const skillDir = (name: string) =>
    path.join(root, assertSafeSegment(name, "skill name"))

  /** Read one directory's manifest into a row, for a skill the record does not know. */
  const readEntry = async (
    name: string,
    link: string | undefined
  ): Promise<CatalogEntry | null> => {
    const manifest = path.join(skillDir(name), MANIFEST)
    const stat = await statOrNull(manifest)
    if (stat === null) return null
    const { frontmatter } = parseSkillFile(await fs.readFile(manifest, "utf8"))
    return {
      name,
      description: frontmatter.description ?? "",
      tags: frontmatter.tags ?? [],
      enabled: true,
      source: "local",
      ...(link === undefined ? {} : { link }),
      assets: [],
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
   * A row the record already holds, with the facts only the disk can answer
   * refreshed. Everything else stays: `skills.json` is the record, so a
   * manifest edited by hand must not overwrite its description or tags.
   */
  const carried = async (
    known: CatalogEntry,
    name: string,
    link: string | undefined
  ): Promise<CatalogEntry | null> => {
    const stat = await statOrNull(path.join(skillDir(name), MANIFEST))
    if (stat === null) return null
    const next: CatalogEntry = { ...known, name, mtimeMs: stat.mtimeMs }
    delete next.link
    if (link !== undefined) next.link = link
    /* A linked skill has no date of its own; a manifest touched from outside
       moves the date the row reports, which is what it reports today. */
    if (link !== undefined) next.updatedAt = ""
    else if (stat.mtimeMs !== known.mtimeMs) next.updatedAt = stat.mtime.toISOString()
    return next
  }

  /**
   * Walk the skills root and rebuild the record. A directory the record does
   * not know is read from its manifest; one it knows keeps what the record
   * says. A directory whose manifest is gone is dropped, and one added or
   * removed outside the hub reaches the list here.
   *
   * A skill the hub linked in from elsewhere is a directory entry too, reached
   * through the link; it is listed as a skill and remembered as a link, because
   * who owns those files is a different answer.
   */
  const rebuild = async (): Promise<CatalogFile> => {
    const previous = catalog ?? { skills: await readCatalogFile(catalogPath) }
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
      const known = previous.skills[entry.name]
      const row =
        known === undefined
          ? await readEntry(entry.name, link)
          : await carried(known, entry.name, link)
      if (row !== null) skills[entry.name] = row
    }
    return { skills }
  }

  /** Publish the record atomically; the next scan merges against it. */
  const saveCatalog = async (next: CatalogFile): Promise<CatalogFile> => {
    catalog = next
    await writeFileAtomic(catalogPath, serializeCatalog(next.skills))
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
   * @returns the local hashes that were recorded, by skill name.
   */
  const recordChecks = async (
    latest: Map<string, string>
  ): Promise<Map<string, string>> => {
    const hashes = new Map<string, string>()
    for (const name of latest.keys()) {
      /* The files are read where they are, link or not: the question is what
         this copy holds, not which directory holds it. The CLI never hashes
         what is on disk, so this is the one number it cannot supply. */
      const hash = await skillFolderHash(skillDir(name)).catch(() => null)
      if (hash !== null) hashes.set(name, hash)
    }
    if (hashes.size === 0) return hashes
    const at = new Date().toISOString()
    await mutate((skills) => {
      for (const [name, currentHash] of hashes) {
        const row = skills[name]
        const found = latest.get(name)
        if (row === undefined || found === undefined) continue
        skills[name] = { ...row, checked: { at, latest: found, currentHash } }
      }
    })
    return hashes
  }

  /** Record one reference last in the display order. */
  const recordAsset = async (name: string, ref: string): Promise<SkillAsset> => {
    const kind = assetKind(ref)
    await mutate((skills) => {
      const row = skills[name]
      if (row === undefined) return
      skills[name] = {
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

  const detailOf = async (name: string): Promise<SkillDetail> => {
    const current = await loadCatalog()
    const row = current.skills[name]
    if (row === undefined) throw new Error(`unknown skill: ${name}`)
    const dir = skillDir(name)
    const manifest = await fs
      .readFile(path.join(dir, MANIFEST), "utf8")
      .catch(() => null)
    if (manifest === null) throw new Error(`skill has no ${MANIFEST}: ${name}`)
    const files = await walkSkillDir(dir)
    const assetDetails: SkillAsset[] = row.assets.map((ref) => ({
      ref,
      kind: assetKind(ref),
    }))
    return {
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
      for (const row of Object.values(current.skills)) {
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
        /* Newest first, name as the tiebreaker so paging never drifts. */
        return (
          b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name)
        )
      })
      const offset = Math.max(0, query.offset ?? 0)
      const limit = query.limit ?? rows.length
      return {
        items: rows.slice(offset, offset + limit),
        total: rows.length,
        counts,
        root: displayPath(root),
      }
    },

    get: detailOf,

    async create(draft: SkillDraft): Promise<SkillDetail> {
      const name = assertNewSkillName(draft.name)
      const current = await loadCatalog()
      /* The name is the directory, so a second skill cannot take it quietly. */
      if (
        current.skills[name] !== undefined ||
        (await statOrNull(skillDir(name))) !== null
      ) {
        throw new Error(`a skill with this name is already in the library: ${name}`)
      }
      const dir = skillDir(name)
      await fs.mkdir(path.join(dir, "assets"), { recursive: true })
      await fs.mkdir(path.join(dir, "references"), { recursive: true })
      await fs.mkdir(path.join(dir, "scripts"), { recursive: true })
      const manifest = path.join(dir, MANIFEST)
      await writeFileAtomic(manifest, starterSkillFile(draft))
      const stat = await statOrNull(manifest)
      await mutate((skills) => {
        skills[name] = {
          name,
          description: draft.description,
          tags: draft.tags ?? [],
          enabled: true,
          source: "local",
          assets: [],
          mtimeMs: stat?.mtimeMs ?? Date.now(),
          updatedAt: new Date().toISOString(),
        }
      })
      return detailOf(name)
    },

    async update(name: string, patch: SkillPatch): Promise<SkillDetail> {
      const current = await loadCatalog()
      const row = current.skills[name]
      if (row === undefined) throw new Error(`unknown skill: ${name}`)
      /*
       * The record only. `skills.json` is the truth for these two fields, so an
       * edit here must not reach the manifest: the file is what an agent reads
       * in place, and the hub has no business rewriting a description it was
       * told to keep its own copy of.
       */
      await mutate((skills) => {
        skills[name] = {
          ...row,
          description: patch.description ?? row.description,
          tags: patch.tags ?? row.tags,
          enabled: patch.enabled ?? row.enabled,
          updatedAt: new Date().toISOString(),
        }
      })
      return detailOf(name)
    },

    async remove(name: string): Promise<void> {
      const current = await loadCatalog()
      const row = current.skills[name]
      if (row === undefined) throw new Error(`unknown skill: ${name}`)
      /* Files first: a failure leaves the row intact rather than orphaning them. */
      /*
       * The catalog first, the files second: if the write fails, the files are
       * still there and the next rebuild lists them again, while the other
       * order can leave a row whose directory is already gone — and nothing
       * would ever bring the two back in step.
       */
      await mutate((skills) => {
        delete skills[name]
      })
      await dropStored(row.assets)
      const dir = skillDir(name)
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

    async installPackage(source: string, names: string[]): Promise<SkillImport> {
      const result = await downloadPackageSkills(source, names, root)
      await refreshCatalog()
      /* A row says where it came from and which revision, so a download
         records both: they are what a later update check compares against. */
      const arrived = new Set(result.installed)
      if (arrived.size > 0) {
        await mutate((skills) => {
          for (const name of arrived) {
            const row = skills[name]
            if (row === undefined) continue
            const record = result.records?.[name]
            skills[name] = {
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

    async readFile(name: string, file: string): Promise<string> {
      return fs.readFile(assertSafePath(skillDir(name), file), "utf8")
    },

    async writeFile(name: string, file: string, text: string): Promise<void> {
      await writeFileAtomic(assertSafePath(skillDir(name), file), text)
      await mutate((skills) => {
        const row = skills[name]
        if (row !== undefined)
          skills[name] = { ...row, updatedAt: new Date().toISOString() }
      })
    },

    async putAsset(name: string, file: File): Promise<SkillAsset> {
      const current = await loadCatalog()
      if (current.skills[name] === undefined)
        throw new Error(`unknown skill: ${name}`)
      return recordAsset(name, await assets.put(owned(name, file)))
    },

    async addAssetSource(
      name: string,
      source: string,
      download = false
    ): Promise<SkillAsset> {
      const current = await loadCatalog()
      const row = current.skills[name]
      if (row === undefined) throw new Error(`unknown skill: ${name}`)
      const parsed = readSource(source)
      if (parsed.kind === "link") {
        /* Re-adding a link keeps one entry; the hub does not own it. */
        if (row.assets.includes(parsed.ref)) {
          return { ref: parsed.ref, kind: assetKind(parsed.ref) }
        }
        if (download) {
          const kept = await downloadRemoteImage(parsed.ref).then(
            (file) => assets.put(owned(name, file)),
            (error: unknown) => {
              /* A dead or oversized picture must not stop the skill being
                 edited; the address stays recorded instead. */
              console.warn(`context hub: could not download ${parsed.ref}`, error)
              return null
            }
          )
          if (kept !== null) return recordAsset(name, kept)
        }
        return recordAsset(name, parsed.ref)
      }
      return recordAsset(name, await assets.put(owned(name, parsed.file)))
    },

    async assetStats(): Promise<AssetImageStats> {
      const current = await loadCatalog()
      const refs = Object.values(current.skills).flatMap((row) => row.assets)
      const { remote, localized } = imageRefsOf(refs)
      return { remote: remote.length, localized: localized.length }
    },

    async localizeAssets(): Promise<AssetLocalizeSummary> {
      const current = await loadCatalog()
      const replacements = new Map<string, string>()
      const failed: { ref: string; reason: string }[] = []
      let downloaded = 0
      for (const [name, row] of Object.entries(current.skills)) {
        for (const ref of row.assets) {
          if (!isLink(ref) || assetKind(ref) !== "image") continue
          try {
            const file = await downloadRemoteImage(ref)
            replacements.set(`${name}\u0000${ref}`, await assets.put(owned(name, file)))
            downloaded += 1
          } catch (error) {
            failed.push({
              ref,
              reason: error instanceof Error ? error.message : String(error),
            })
          }
        }
      }
      if (replacements.size > 0) {
        /* One write for the whole pass: a row keeps every reference the pass
           could not replace, and nothing is recorded twice. */
        await mutate((skills) => {
          for (const [name, row] of Object.entries(skills)) {
            const next = row.assets.map(
              (ref) => replacements.get(`${name}\u0000${ref}`) ?? ref
            )
            if (next.some((ref, at) => ref !== row.assets[at])) {
              skills[name] = { ...row, assets: next, updatedAt: new Date().toISOString() }
            }
          }
        })
      }
      return { downloaded, failed }
    },

    async deleteAsset(name: string, ref: string): Promise<void> {
      const current = await loadCatalog()
      const row = current.skills[name]
      if (row === undefined) throw new Error(`unknown skill: ${name}`)
      await assets.remove(ref)
      await mutate((skills) => {
        const next = skills[name]
        if (next === undefined) return
        skills[name] = {
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

    async placeSkill(name: string, ref: SkillPlaceRef): Promise<PlaceSkillRecord | null> {
      const base = await placeBase(ref.scope)
      return base === null ? null : readPlaceSkill(base, name, ref.dir)
    },

    async placeFile(name: string, file: string, ref: SkillPlaceRef): Promise<string> {
      const base = await requiredBase(ref.scope)
      const text = await readPlaceSkillFile(base, name, file, ref.dir)
      if (text === null) {
        throw new Error(`the place holds no such file: ${name}/${file}`)
      }
      return text
    },

    async installInto(
      name: string,
      ref: SkillPlaceRef,
      mode: InstallMode = "auto"
    ): Promise<SkillInstall> {
      const base = await requiredBase(ref.scope)
      return installSkillInto(base, root, name, ref.dir, mode)
    },

    async adoptFrom(
      name: string,
      ref: SkillPlaceRef,
      mode: InstallMode = "auto"
    ): Promise<SkillInstall> {
      const base = await requiredBase(ref.scope)
      const landed = await linkSkillIntoLibrary(base, root, name, ref.dir, mode)
      /* What the skills CLI installed this from, if it did: the lock beside
         the place's skills is the record, and its hash is what an update
         check compares against. Without it the skill is still listed, but
         nothing can tell whether the upstream moved. */
      const upstream = await readLockedUpstream(base, name)
      await refreshCatalog()
      if (upstream !== null) {
        await mutate((skills) => {
          const row = skills[name]
          if (row !== undefined) skills[name] = { ...row, upstream }
        })
      }
      return landed
    },

    async checkUpdate(name: string): Promise<SkillUpdateCheck> {
      const current = await loadCatalog()
      const row = current.skills[name]
      if (row === undefined) throw new Error(`unknown skill: ${name}`)
      const upstream = row.upstream
      if (upstream === undefined) {
        throw new Error(`no recorded source for this skill, so nothing can be compared: ${name}`)
      }
      const { latest, failed } = await askSources(new Map([[upstream.source, [name]]]))
      const found = latest.get(name)
      if (found === undefined) {
        /* The CLI's own reason is worth more to a person than a generic one. */
        const reason = failed.find((entry) => entry.name === name)?.reason
        throw new Error(reason ?? `the source answered nothing about this skill: ${name}`)
      }
      const recorded = await recordChecks(latest)
      const currentHash = recorded.get(name) ?? found
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
      for (const [name, row] of Object.entries(current.skills)) {
        const source = row.upstream?.source
        if (source === undefined) continue
        const names = groups.get(source)
        if (names === undefined) groups.set(source, [name])
        else names.push(name)
      }
      const { latest, failed } = await askSources(groups)
      const recorded = await recordChecks(latest)
      let outdated = 0
      let modified = 0
      for (const [name, currentHash] of recorded) {
        const installed = current.skills[name]?.upstream?.hash
        if (installed !== latest.get(name)) outdated += 1
        /* A source that has not moved on does not make a changed copy any less
           changed, so the two are counted apart. */
        if (currentHash !== installed) modified += 1
      }
      return { checked: recorded.size, outdated, modified, failed }
    },

    async updateFromUpstream(name: string): Promise<void> {
      const current = await loadCatalog()
      const row = current.skills[name]
      if (row === undefined) throw new Error(`unknown skill: ${name}`)
      const upstream = row.upstream
      if (upstream === undefined) {
        throw new Error(`no recorded source for this skill, so there is nothing to install from: ${name}`)
      }
      const work = await fs.mkdtemp(path.join(tmpdir(), "context-hub-skill-update-"))
      try {
        const result = await downloadPackageSkills(upstream.source, [name], work)
        const landed = result.installed[0]
        if (landed === undefined) {
          const reason = result.failed.find((entry) => entry.name === name)?.reason
          throw new Error(reason ?? `the skills CLI installed nothing for ${name}`)
        }
        /* The files live in the library's own directory, or in the workspace's
           when the library reaches the skill through a link; that copy is the
           one an update replaces, and the link keeps pointing at it. */
        const held = skillDir(name)
        const isLink = (await fs.lstat(held).catch(() => null))?.isSymbolicLink() === true
        const target = isLink ? await fs.readlink(held) : held
        await replaceDirectory(path.join(work, landed), target)
        /* The hash to record is the one the CLI computed for what it just
           installed, not a second reading of the same bytes. */
        const fresh = result.records?.[landed]?.hash ?? (await skillFolderHash(target))
        await mutate((skills) => {
          const next = skills[name]
          if (next !== undefined) {
            skills[name] = {
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

    async deleteInPlace(name: string, ref: SkillPlaceRef): Promise<void> {
      const base = await requiredBase(ref.scope)
      await deleteSkillIn(base, name, ref.dir)
    },

    async removeFrom(name: string, ref: SkillPlaceRef): Promise<void> {
      const base = await requiredBase(ref.scope)
      await removeSkillFrom(base, root, name, ref.dir)
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
