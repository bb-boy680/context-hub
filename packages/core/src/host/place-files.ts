/**
 * The client configuration files a hub consumer reads and writes, resolved
 * against the two roots the kernel's {@link PlaceRef} allows: the workspace in
 * use, and the user's home directory.
 *
 * These files belong to the clients, so every call is a whole-file read or a
 * whole-file write — the caller reads first and hands back a text that differs
 * only where it meant to. Writes replace files atomically. This module runs in
 * the process that owns the disk.
 */
import { promises as fs } from "node:fs"
import path from "node:path"

import type { AssetScope, PlaceFiles, PlaceRef } from "../place-files.ts"
import { writeFileAtomic } from "./atomic.ts"
import { resolveHubHome, userHome } from "./home.ts"
import { createFsWorkspaceStore } from "./workspaces-fs.ts"

/** The scopes a place's file is resolved under. */
const SCOPES: readonly string[] = ["workspace", "global"]

/** What a disk-backed reader needs to know about where it writes. */
export interface PlaceFileOptions {
  /** Hub home; the workspace list that names the folder in use lives there. */
  home?: string
  /** The folder this host works in: a workspace without anyone picking it. */
  folder?: string
  /** The directory a global place reads under; the person's home by default. */
  userHome?: string
}

/**
 * Check one place, so no caller can reach a file outside its scope's root.
 *
 * @param ref — the place as it arrived, from a form or from a wire.
 * @returns the place, so a call can be written inline.
 * @throws when it is not a place, names an unknown scope, or names a file that
 * is absolute, empty, or climbs out of its root with `..`.
 */
export function assertPlaceFile(ref: unknown): PlaceRef {
  if (typeof ref !== "object" || ref === null) throw new Error("not a place")
  const place = ref as { scope?: unknown; file?: unknown }
  if (typeof place.scope !== "string" || !SCOPES.includes(place.scope)) {
    throw new Error(`unknown scope: ${String(place.scope)}`)
  }
  if (typeof place.file !== "string" || place.file === "") {
    throw new Error("a place needs a file")
  }
  if (path.isAbsolute(place.file) || /^[A-Za-z]:/.test(place.file)) {
    throw new Error(`a place's file is relative to its scope: ${place.file}`)
  }
  if (place.file.split("/").includes("..")) {
    throw new Error(`a place's file cannot climb out of its scope: ${place.file}`)
  }
  return { scope: place.scope as AssetScope, file: place.file }
}

/** Create the reader and writer for one host's roots. */
export function createFsPlaceFiles(options: PlaceFileOptions = {}): PlaceFiles {
  const home = resolveHubHome(options.home)
  const homeDir = options.userHome ?? userHome()
  const workspaces = createFsWorkspaceStore(home, { folder: options.folder })

  /** The root one scope resolves under, or null when a workspace place has none. */
  const baseOf = async (scope: AssetScope): Promise<string | null> => {
    if (scope === "global") return homeDir
    const page = await workspaces.page()
    return page.folders.find((item) => item.id === page.current)?.path ?? null
  }

  /** The file one place names, or null when a workspace place has no workspace. */
  const fileOf = async (ref: unknown): Promise<string | null> => {
    const place = assertPlaceFile(ref)
    const base = await baseOf(place.scope)
    return base === null ? null : path.join(base, ...place.file.split("/"))
  }

  /** The same, refused when there is nothing under it to write. */
  const requiredFile = async (ref: unknown): Promise<string> => {
    const file = await fileOf(ref)
    if (file === null) throw new Error("this hub has no workspace open")
    return file
  }

  return {
    async read(ref) {
      const file = await fileOf(ref)
      if (file === null) return null
      return fs.readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT" || error.code === "ENOTDIR") return null
        throw error
      })
    },

    async write(ref, text) {
      await writeFileAtomic(await requiredFile(ref), text)
    },

    async remove(ref) {
      await fs.rm(await requiredFile(ref), { force: true })
    },

    workspace() {
      return baseOf("workspace")
    },
  }
}
