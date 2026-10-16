/**
 * Collecting one pack into the library: read the address, put its files
 * somewhere, and record where they came from.
 *
 * The order matters and is the same for every form: the files land in a staging
 * directory the library knows nothing about, the pack's own manifest is read
 * there, and only then is the directory moved in and the row written. A failure
 * at any step before the move leaves the library exactly as it was, which is what
 * makes "collect" safe to retry.
 *
 * Nothing here reads a marketplace. An address names one pack; a marketplace is
 * somebody else's index, and resolving a name through one is a different step
 * with a different owner.
 *
 * This module runs in the process that owns the disk.
 */
import { promises as fs } from "node:fs"
import path from "node:path"

import { folderHash } from "@context-hub/core/host/folder-hash"

import type { PluginOrigin } from "../contract.ts"
import {
  isAbsolutePath,
  originToSpec,
  parsePluginSource,
  sourceMatches,
  type PluginSourceSpec,
} from "../inspect.ts"
import type { PluginRecord } from "../revision.ts"
import { fetchPlugin, stagingDir } from "./fetch.ts"
import type { PluginLibrary } from "./library.ts"
import { readPackManifest } from "./library.ts"
import { assertPackRelative, assertSafeSegment } from "./names.ts"

/** One file a page read out of a folder a person chose. */
export interface PackUpload {
  /** Its path inside that folder, with `/` separators. */
  path: string
  /** Its bytes, base64 encoded, because the request body is JSON. */
  base64: string
}

/** The most a folder may hold; a pack is text, and this stands far above one. */
const UPLOAD_LIMIT = 16 * 1024 * 1024

/** Where one recorded source names itself, for a refusal to read back. */
function whereFrom(source: PluginOrigin): string {
  return source.kind === "local" ? source.path : source.url
}

/** The fallback name an address suggests when the pack names itself nothing usable. */
function fallbackName(spec: PluginSourceSpec): string {
  switch (spec.kind) {
    case "url":
      return spec.url.replace(/\.git$/, "").split("/").pop() || "plugin"
    /* One repository ships many packs, and the directory a pack sits in is the
       only name the address itself suggests. */
    case "git-subdir":
      return spec.path.split("/").filter((part) => part !== "").pop() || "plugin"
    case "archive":
      return spec.url.split("/").pop()?.replace(/\.(?:zip|tgz|tar\.gz)$/i, "") || "plugin"
    case "local":
      return path.basename(spec.path)
  }
}

/** What collecting an address produced. */
export interface PluginCollected {
  /** The record as the library holds it. */
  record: PluginRecord
  /** True when this address was already in the library, so nothing was fetched. */
  already: boolean
}

/** Collecting packs into one library. */
export interface PluginCollector {
  /**
   * Collect one pack.
   *
   * An address the library already holds is answered before anything is fetched:
   * the same address is the same pack, and cloning it again would only be to
   * throw it away. Which address a pack came from is recorded at collection, so
   * this is a read of the index rather than a question for the source.
   *
   * @param source — a repository address, an archive URL, or a directory on this machine.
   * @returns the record that is there now, and whether it was already there.
   * @throws {InvalidPluginSourceError} when the address names nothing this hub takes.
   * @throws {Error} when the address cannot be read, holds no plugin manifest, or names a pack whose name another address already took.
   */
  add(source: string): Promise<PluginCollected>
  /**
   * Collect one pack from a folder a page read.
   *
   * A page cannot name a directory on this machine — it is given the files and
   * nothing about where they were — so a folder a person chose arrives as its
   * bytes. They are written into a staging directory first, which keeps this the
   * same collect as every other address: nothing reaches the library until the
   * pack's own manifest has been read there, and a failure leaves the library
   * untouched.
   *
   * @param from — where the pack sits in the folder a person chose: that folder's own name when it is the pack, or its path inside that folder when the page found it among others. It is a label rather than a location, because nothing here can reach the folder again.
   * @param files — every file of that pack, with the paths it keeps inside it.
   * @returns the record that is there now, and whether it was already there.
   * @throws {Error} for an empty folder, a file path that would escape it, or a folder larger than this hub takes.
   */
  addFolder(from: string, files: readonly PackUpload[]): Promise<PluginCollected>
  /**
   * Fetch one pack again from the address its record carries.
   *
   * A record outlives the directory it names — the folder may be deleted by
   * hand, or lost to a half-finished write — and the address the record carries
   * is what makes the pack recoverable rather than merely remembered. One pack
   * per call, so a page can run several at once and report on each as it lands.
   *
   * @param name — the pack to fetch again.
   * @returns the record as it stands once the files are back.
   * @throws {Error} when no record names that pack, or when it came from a directory on this machine — that directory is the pack, so there is nothing to fetch away from it.
   */
  restore(name: string): Promise<PluginRecord>
}

/** Create the collector over one library. */
export function createPluginCollector(library: PluginLibrary): PluginCollector {
  /**
   * Whether an address names the pack a record already holds.
   *
   * The name is the identity, so the same name from somewhere else is a different
   * pack wearing it — but "somewhere else" is a question only an address can
   * answer, and a folder a page dropped carries a label rather than an address: a
   * browser is told nothing about where a folder sits, so what it can say is the
   * name the folder was chosen by, which no typed path can ever equal. A label
   * therefore cannot rule the pack out, and the hash goes on to decide whether
   * anything about it changed. Two paths a person typed *are* comparable, and
   * differing ones are still two packs.
   */
  const samePack = (spec: PluginSourceSpec, source: PluginOrigin): boolean => {
    if (sourceMatches(spec, source)) return true
    if (spec.kind !== "local" || source.kind !== "local") return false
    return !isAbsolutePath(spec.path) || !isAbsolutePath(source.path)
  }

  /** Read a staged pack's manifest and record it under the name that manifest gives. */
  const take = async (
    stage: string,
    spec: PluginSourceSpec,
    source: PluginOrigin,
    hash: string
  ): Promise<PluginCollected> => {
    const manifest = await readPackManifest(stage, fallbackName(spec))
    const name = assertSafeSegment(manifest.name, "plugin name")
    const held = (await library.list()).find((one) => one.name === name)
    if (held !== undefined && !samePack(spec, held.source)) {
      throw new Error(`${name} is already in this library, from ${whereFrom(held.source)}`)
    }
    if (held === undefined) {
      return { record: await library.add(name, stage, source, hash), already: false }
    }
    /* The same pack, handed over again. Nothing changed when the files hash the
       same, and saying so is the answer rather than a rewrite: a record that
       moved its `updatedAt` for a folder nobody edited would read as a change
       that did not happen. */
    if ((await library.has(name)) && held.hash === hash) return { record: held, already: true }
    return {
      record: (await library.has(name))
        ? await library.replace(name, stage, source, hash)
        : await library.add(name, stage, source, hash),
      already: false,
    }
  }

  /** Fetch one address into a staging directory and record what landed. */
  const collect = async (spec: PluginSourceSpec): Promise<PluginCollected> => {
    for (const one of await library.list()) {
      if (!sourceMatches(spec, one.source)) continue
      /* A record whose files are gone is a memory of a pack rather than the pack,
         so it is collected again rather than answered with. */
      if (await library.has(one.name)) return { record: one, already: true }
      break
    }

    const work = await stagingDir()
    const stage = path.join(work, "pack")
    try {
      await fs.mkdir(stage, { recursive: true })
      const source = await fetchPlugin(spec, stage, work)
      return await take(stage, spec, source, await folderHash(stage))
    } finally {
      await fs.rm(work, { recursive: true, force: true })
    }
  }

  /** Write an uploaded pack into a staging directory and collect it there. */
  const collectUpload = async (
    from: string,
    files: readonly PackUpload[]
  ): Promise<PluginCollected> => {
    if (files.length === 0) throw new Error("that folder holds no file")
    const work = await stagingDir()
    const stage = path.join(work, "pack")
    try {
      await fs.mkdir(stage, { recursive: true })
      let written = 0
      for (const file of files) {
        const bytes = Buffer.from(file.base64, "base64")
        written += bytes.byteLength
        if (written > UPLOAD_LIMIT) throw new Error("that folder is larger than this hub takes")
        const target = path.join(stage, assertPackRelative(file.path))
        await fs.mkdir(path.dirname(target), { recursive: true })
        await fs.writeFile(target, bytes)
      }
      /* A folder on this machine is the one source that leaves no address behind,
         because nothing here can reach it again — which the record says by
         carrying a path source, the kind no check ever asks about. What is
         recorded is where the pack sat in what was chosen, so two packs taken
         from one folder are told apart by the same field. */
      return await take(
        stage,
        { kind: "local", path: from },
        { kind: "local", path: from },
        await folderHash(stage)
      )
    } finally {
      await fs.rm(work, { recursive: true, force: true })
    }
  }

  /**
   * Put one pack back from the address its record carries.
   *
   * The record is read first so the address is the one that pack actually came
   * from; the download itself is the same collect every other address goes
   * through, which is what keeps a restored pack indistinguishable from a
   * collected one.
   */
  const restore = async (name: string): Promise<PluginRecord> => {
    const record = (await library.list()).find((one) => one.name === name)
    if (record === undefined) throw new Error(`${name} is not in this library`)
    /* A directory on this machine *is* the pack: nothing was copied away from it,
       so there is nothing to fetch it back from. */
    if (record.source.kind === "local") {
      throw new Error(`${name} came from a folder on this machine, so there is nothing to fetch it from`)
    }
    return (await collect(originToSpec(record.source))).record
  }

  return {
    add: (source) => collect(parsePluginSource(source)),
    addFolder: (from, files) => collectUpload(assertPackRelative(from.trim()), files),
    restore,
  }
}
