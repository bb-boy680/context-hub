/**
 * Bringing one pack up to what its source holds now.
 *
 * The download is not what makes it an update: a check that says "the source
 * moved" is one cheap question, and the pack that lands may still be byte for
 * byte what is already here — a revert, a commit that touched a README, or a
 * subdirectory that did not really change. So the staged files are hashed, and a
 * hash equal to what the record already holds ends the update without touching
 * anything.
 *
 * When the files did change, the new directory replaces the old one in a single
 * step and the record is written after it lands. A failure anywhere before that
 * leaves both the library and the record as they were.
 *
 * This module runs in the process that owns the disk.
 */
import { promises as fs } from "node:fs"
import path from "node:path"

import { folderHash } from "@workspace/core/host/folder-hash"

import type { PluginOrigin } from "../contract.ts"
import type { PluginRecord } from "../revision.ts"
import { fetchPlugin, stagingDir } from "./fetch.ts"
import type { PluginLibrary } from "./library.ts"
import type { PluginSourceSpec } from "../inspect.ts"

/** What one update did, as the person is told it. */
export interface PluginUpdateOutcome {
  name: string
  /** False when the download turned out to be what was already here. */
  changed: boolean
  /** The revision before, and the revision now. */
  from: string | null
  to: string | null
  /** The files here had been edited, and the update replaced them. */
  overwroteEdits: boolean
}

/** The address one recorded source is fetched by again. */
export function specOf(source: PluginOrigin): PluginSourceSpec {
  switch (source.kind) {
    case "git":
      return {
        kind: "git",
        url: source.url,
        ...(source.ref === undefined ? {} : { ref: source.ref }),
      }
    case "archive":
      return { kind: "archive", url: source.url }
    case "path":
      return { kind: "path", path: source.path }
  }
}

/** Bringing the library's packs up to date. */
export interface PluginUpdater {
  /**
   * Fetch one pack again and take it if the files differ.
   *
   * @param name — the pack to update.
   * @returns what happened, including the case where nothing needed to change.
   * @throws {Error} when the pack is not in the library, or has no source to fetch again.
   */
  update(name: string): Promise<PluginUpdateOutcome>
}

/** Create the updater over one library. */
export function createPluginUpdater(library: PluginLibrary): PluginUpdater {
  return {
    async update(name) {
      const records = await library.list()
      const record = records.find((one) => one.name === name)
      if (record === undefined) throw new Error(`${name} is not in this library`)
      if (record.source.kind === "path") {
        throw new Error(`${name} came from a directory on this machine; there is nothing to fetch again`)
      }
      const spec = specOf(record.source)

      const work = await stagingDir()
      const stage = path.join(work, "pack")
      await fs.mkdir(stage, { recursive: true })
      try {
        const source = await fetchPlugin(spec, stage, work)

        /* What landed may be exactly what is here: a revert, or a commit that
           did not touch this plugin's files at all. */
        const landed = await folderHash(stage)
        if (landed === record.hash) {
          await library.setCheck(name, {
            at: new Date().toISOString(),
            latest: revisionLabel(source),
            currentHash: landed,
          })
          return {
            name,
            changed: false,
            from: revisionLabel(record.source),
            to: revisionLabel(source),
            overwroteEdits: false,
          }
        }

        const edited = (await library.hash(name).catch(() => null)) !== record.hash
        const updated = await library.replace(name, stage, source, landed)
        /* The check that said "there is an update" is answered by this update,
           so it is replaced rather than left to be re-read as still true. */
        await library.setCheck(name, {
          at: new Date().toISOString(),
          latest: revisionLabel(source),
          currentHash: updated.hash,
        })
        return {
          name,
          changed: true,
          from: revisionLabel(record.source),
          to: revisionLabel(source),
          overwroteEdits: edited,
        }
      } finally {
        await fs.rm(work, { recursive: true, force: true })
      }
    },
  }
}

/** The revision a person recognizes, as the record stores it. */
function revisionLabel(source: PluginOrigin): string {
  switch (source.kind) {
    case "git":
      return source.revision
    case "archive":
      return source.etag ?? ""
    case "path":
      return source.path
  }
}

/** One pack's record, for a caller that needs the row rather than the update. */
export type { PluginRecord }
