/**
 * The plugin library on disk: `<home>/plugins/plugins.json` and one directory
 * per collected pack beside it.
 *
 * The hub holds the files rather than pointing at wherever they came from,
 * because that is what makes the library deliverable: the same directory can be
 * added as a marketplace by a coding agent, committed to a repository, or
 * handed to another machine. A pack keeps every layout it ships — Claude Code's
 * `.claude-plugin/`, Codex's `.codex-plugin/`, Cursor's rules — so one copy
 * serves every agent.
 *
 * Two rules come from the skills library because they were learned there: writes
 * go through one queue, because every one of them is a read-modify-write of the
 * same index; and the index is written before the files are removed, so a
 * failure leaves a row pointing at something that is still there rather than a
 * directory nothing knows about.
 *
 * This module runs in the process that owns the disk.
 */
import { promises as fs } from "node:fs"
import path from "node:path"

import { isLink } from "@workspace/core"
import { createFsAssetLibrary } from "@workspace/core/host"
import { writeFileAtomic } from "@workspace/core/host/atomic"
import { folderHash } from "@workspace/core/host/folder-hash"
import { resolveHubHome } from "@workspace/core/host/home"

import { PLUGIN_INDEX_FILE, PLUGIN_LIBRARY_DIR } from "../contract.ts"
import { emptyIndex, readIndex, serializeIndex } from "../records.ts"
import { assertSafeSegment } from "./names.ts"
import { findLogo, assetPresent, clearPictures, ownsPicture, storePicture } from "./logo.ts"
import type { PluginCheck, PluginOrigin } from "../contract.ts"
import type { PluginRecord } from "../revision.ts"

/** One file inside a pack, as the files panel reads it. */
export interface PackFileEntry {
  /** Path inside the pack, `/`-separated. */
  path: string
  directory: boolean
  bytes: number
}

/** What a pack's own manifest says about it. */
export interface PackManifest {
  name: string
  version: string
  description: string
}

/** The library, as the host half and the bridge use it. */
export interface PluginLibrary {
  /** The directory the packs live in, for display. */
  readonly root: string
  /** Every record, in the order the file holds them. */
  list(): Promise<PluginRecord[]>
  /** Read one text file inside a pack. */
  read(name: string, file: string): Promise<string>
  /** One pack's files, in path order. */
  files(name: string): Promise<PackFileEntry[]>
  /** The hash of one pack's files as they are now. */
  hash(name: string): Promise<string>
  /** Where one pack's directory is. */
  packDir(name: string): string
  /**
   * Whether one pack's files are actually there.
   *
   * The index is a file a person may edit, so a record can outlive the directory
   * it names; asking the disk is what separates a pack from a memory of one.
   */
  has(name: string): Promise<boolean>
  /**
   * The records whose files are gone, by name.
   *
   * A record is what says a pack was here and where it came from, so what it
   * names is worth fetching again rather than dropping; this is what tells a
   * caller there is something to fetch.
   */
  missing(): Promise<string[]>
  /**
   * Take a staged directory as one pack: move it in, read its manifest, hash it,
   * and record it.
   *
   * The index is durable JSON a person may edit, and a directory is a fact
   * whether or not the index knows about it — so this reconciles the two rather
   * than trusting either alone. A pack the index lost is recorded again from the
   * files that are there; a directory holding something else under a lost name is
   * replaced by what the address held; and a name that belongs to a record which
   * still has its files is not this hub's to overwrite.
   *
   * @throws {Error} when the name belongs to a record that still has its files.
   */
  add(name: string, staged: string, source: PluginOrigin, hash: string): Promise<PluginRecord>
  /** Replace one pack's files with a staged directory, keeping its record's own fields. */
  replace(name: string, staged: string, source: PluginOrigin, hash: string): Promise<PluginRecord>
  /** Drop one pack, its record, and the assets the hub holds for it. */
  remove(name: string): Promise<void>
  /** Keep one check's answer. */
  setCheck(name: string, check: PluginCheck): Promise<void>
  /** Keep several answers at once. */
  setChecks(checks: ReadonlyMap<string, PluginCheck>): Promise<void>
  /** Keep one pack's categories. */
  setTags(name: string, tags: readonly string[]): Promise<void>
}

/**
 * Layouts a pack may name itself in, most specific first. Claude Code reads the
 * first, a pack from before that convention reads the second, and a pack built
 * for Codex reads the third — a pack that carries several is still one plugin,
 * so the first one that names it wins.
 */
const MANIFESTS = [".claude-plugin/plugin.json", "plugin.json", ".codex-plugin/plugin.json"]

/**
 * Whether a directory really holds a pack: it is there, and its manifest can be
 * read. A directory is not a pack — one that lost its manifest, or never got
 * one, holds nothing this hub could describe.
 *
 * @param dir — the directory to look in.
 * @param fallbackName — the name to read the manifest under when it gives none.
 * @returns whether a pack is there.
 */
async function holdsPack(dir: string, fallbackName: string): Promise<boolean> {
  if ((await fs.stat(dir).catch(() => null)) === null) return false
  return await readPackManifest(dir, fallbackName).then(
    () => true,
    () => false
  )
}

async function readJson(file: string): Promise<Record<string, unknown> | null> {
  const raw = await fs.readFile(file, "utf8").catch(() => null)
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    /* A manifest this build cannot read is not one it can use. */
    return null
  }
}

/**
 * Read what a pack says about itself.
 *
 * @param dir — the pack directory.
 * @param fallbackName — the name to take when the manifest does not give one.
 * @returns the pack's own name, version, and description.
 * @throws {Error} when the directory carries no manifest at all, because this hub records a pack by the name its manifest gives it and has nothing else to record it under.
 */
export async function readPackManifest(dir: string, fallbackName: string): Promise<PackManifest> {
  for (const relative of MANIFESTS) {
    const manifest = await readJson(path.join(dir, relative))
    if (manifest === null) continue
    const name =
      typeof manifest.name === "string" && manifest.name !== "" ? manifest.name : undefined
    const version = typeof manifest.version === "string" ? manifest.version : ""
    if (name === undefined && version === "") continue
    return {
      name: name ?? fallbackName,
      version,
      description: typeof manifest.description === "string" ? manifest.description : "",
    }
  }
  throw new Error("this directory carries no plugin manifest (.claude-plugin/plugin.json)")
}

/** Walk one pack's directory, skipping the bookkeeping nothing reads. */
async function walk(dir: string, at = dir): Promise<PackFileEntry[]> {
  const entries = await fs.readdir(at, { withFileTypes: true }).catch(() => [])
  const found: PackFileEntry[] = []
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") continue
    const full = path.join(at, entry.name)
    const relative = path.relative(dir, full).split(path.sep).join("/")
    if (entry.isDirectory()) {
      found.push({ path: relative, directory: true, bytes: 0 })
      found.push(...(await walk(dir, full)))
      continue
    }
    if (!entry.isFile()) continue
    const stat = await fs.stat(full).catch(() => null)
    found.push({ path: relative, directory: false, bytes: stat?.size ?? 0 })
  }
  return found
}

/** Move a directory into place, falling back to a copy across a device boundary. */
async function moveInto(from: string, to: string): Promise<void> {
  await fs.mkdir(path.dirname(to), { recursive: true })
  await fs.rename(from, to).catch(async (error: unknown) => {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error
    await fs.cp(from, to, { recursive: true })
    await fs.rm(from, { recursive: true, force: true })
  })
}

/** Create the library that reads and writes under one hub home. */
export function createFsPluginLibrary(home?: string): PluginLibrary {
  const resolved = resolveHubHome(home)
  const root = path.join(resolved, PLUGIN_LIBRARY_DIR)
  const indexPath = path.join(root, PLUGIN_INDEX_FILE)

  /** Serialises every write: each one is a read-modify-write of the same index. */
  let queue: Promise<unknown> = Promise.resolve()
  const run = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work)
    queue = next.catch(() => undefined)
    return next
  }

  const readDocument = async (): Promise<PluginRecord[]> => {
    const raw = await fs.readFile(indexPath, "utf8").catch(() => null)
    if (raw === null) return emptyIndex()
    try {
      return readIndex(JSON.parse(raw) as unknown)
    } catch {
      /* A file this build cannot parse as JSON is dropped, never repaired. */
      return emptyIndex()
    }
  }

  const save = async (records: readonly PluginRecord[]): Promise<void> => {
    await writeFileAtomic(indexPath, serializeIndex(records))
  }

  const packDir = (name: string) => path.join(root, assertSafeSegment(name, "plugin name"))

  /** The hub's own files, which a pack's logo is copied into. */
  const assets = createFsAssetLibrary(resolved)

  /** Drop the files a record used to point at and no longer does. */
  const pruneAssets = async (previous: readonly string[], next: readonly string[]): Promise<void> => {
    for (const ref of previous) {
      if (next.includes(ref) || isLink(ref)) continue
      await assets.remove(ref).catch(() => undefined)
    }
  }

  /**
   * Read what a directory holds into a record, given where it came from.
   *
   * A pack's own picture is stored afresh: the copy that was here is dropped
   * first, so a pack collected again — because its files were lost, or replaced
   * by what its address holds now — never leaves a second copy or a reference to
   * one. What a person added is kept, as long as it is still readable.
   */
  const recordOf = async (
    name: string,
    source: PluginOrigin,
    hash: string,
    previous?: PluginRecord
  ): Promise<PluginRecord> => {
    const dir = packDir(name)
    const manifest = await readPackManifest(dir, name)
    await clearPictures(assets, name)
    const logo = await findLogo(dir)
    const picture = logo === undefined ? undefined : await storePicture(assets, dir, name, logo)
    const kept: string[] = []
    for (const ref of previous?.assets ?? []) {
      if (ownsPicture(name, ref) || !(await assetPresent(resolved, ref))) continue
      kept.push(ref)
    }
    const now = new Date().toISOString()
    return {
      name,
      version: manifest.version,
      description: manifest.description,
      tags: previous?.tags ?? [],
      source,
      hash,
      assets: picture === undefined ? kept : [picture, ...kept],
      installedAt: previous?.installedAt ?? now,
      updatedAt: now,
    }
  }

  /** Drop every file the hub holds for one pack.
   *
   * The pack's own picture lives in a directory of its own, so this is one
   * removal rather than a search. A recovery path reaches it with no record to
   * read names from. */
  const forgetAssets = async (name: string): Promise<void> => {
    await clearPictures(assets, name)
  }

  return {
    root,
    packDir,

    list: () => run(readDocument),

    /**
     * Whether a pack is really here: its directory, and its manifest inside it.
     *
     * A record can outlive what it names, and a directory can outlive its
     * manifest; both are a memory of a pack rather than the pack. The manifest
     * is what says a pack is here, so its absence is what makes the address
     * worth fetching again.
     */
    has: (name) => run(() => holdsPack(packDir(name), name)),

    missing: () =>
      run(async () => {
        const gone: string[] = []
        for (const one of await readDocument()) {
          if (!(await holdsPack(packDir(one.name), one.name))) gone.push(one.name)
        }
        return gone
      }),

    async read(name, file) {
      const target = path.join(packDir(name), file)
      const relative = path.relative(packDir(name), target)
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error(`"${file}" escapes the plugin directory`)
      }
      return fs.readFile(target, "utf8")
    },

    files: (name) => run(() => walk(packDir(name))),

    hash: (name) => folderHash(packDir(name)),

    add(name, staged, source, hash) {
      return run(async () => {
        const records = await readDocument()
        const known = records.find((one) => one.name === name)
        const target = packDir(name)
        const here = await holdsPack(target, name)

        if (known !== undefined && here) {
          /* Two collections of one address can be in flight at once, and the
             answer to "is it here?" changes while the second one downloads. The
             files that are here decide: what this one fetched is already in
             place, or a different pack is wearing a name that is taken. */
          if ((await folderHash(target)) === hash) {
            await fs.rm(staged, { recursive: true, force: true })
            return known
          }
          throw new Error(`${name} is already in this library`)
        }
        if (!here) {
          /* A directory that holds no pack holds nothing to keep — including the
             one that lost its manifest, which is a pack no more than a record
             whose folder is gone. What was asked for is the address, so its
             files are what belongs here. */
          await fs.rm(target, { recursive: true, force: true })
          await moveInto(staged, target)
        } else if ((await folderHash(target)) === hash) {
          /* The same files under a name the index has no record of: the pack is
             already here, and the record is what went missing. */
          await fs.rm(staged, { recursive: true, force: true })
        } else {
          /* A different pack wearing the name. */
          await fs.rm(target, { recursive: true, force: true })
          await moveInto(staged, target)
        }

        const record = await recordOf(name, source, hash, known)
        await save(
          known === undefined
            ? [...records, record]
            : records.map((one) => (one.name === name ? record : one))
        )
        return record
      })
    },

    replace(name, staged, source, hash) {
      return run(async () => {
        const records = await readDocument()
        const previous = records.find((one) => one.name === name)
        if (previous === undefined) throw new Error(`${name} is not in this library`)
        const target = packDir(name)
        /* The old directory is moved aside rather than deleted, so a record
           written after this point still points at files that exist. */
        const aside = `${target}.previous`
        await fs.rm(aside, { recursive: true, force: true })
        await moveInto(target, aside)
        await moveInto(staged, target)
        const record = await recordOf(name, source, hash, previous)
        try {
          await save(records.map((one) => (one.name === name ? record : one)))
        } catch (error) {
          await fs.rm(target, { recursive: true, force: true })
          await moveInto(aside, target)
          throw error
        }
        await fs.rm(aside, { recursive: true, force: true })
        await pruneAssets(previous.assets, record.assets)
        return record
      })
    },

    remove(name) {
      return run(async () => {
        const records = await readDocument()
        const record = records.find((one) => one.name === name)
        /* The index is written first, so a failure to delete cannot leave a
           directory nothing points at. */
        await save(records.filter((one) => one.name !== name))
        await fs.rm(packDir(name), { recursive: true, force: true })
        /* What the pack brought: its own picture, and anything a person added
           while it was here. The first is removed wholesale, because a record is
           not the only thing that may have put a file in that directory. */
        await pruneAssets(record?.assets ?? [], [])
        await forgetAssets(name)
      })
    },

    setCheck(name, check) {
      return run(async () => {
        const records = await readDocument()
        if (!records.some((one) => one.name === name)) return
        await save(records.map((one) => (one.name === name ? { ...one, checked: check } : one)))
      })
    },

    setChecks(checks) {
      return run(async () => {
        const records = await readDocument()
        await save(
          records.map((one) => {
            const check = checks.get(one.name)
            return check === undefined ? one : { ...one, checked: check }
          })
        )
      })
    },

    setTags(name, tags) {
      return run(async () => {
        const records = await readDocument()
        if (!records.some((one) => one.name === name)) {
          throw new Error(`${name} is not in this library`)
        }
        await save(records.map((one) => (one.name === name ? { ...one, tags: [...tags] } : one)))
      })
    },
  }
}
