/**
 * Disk-backed asset library. Files live under `<home>/assets` — one directory,
 * flat — so a recorded path like `assets/cover-3f9a2b1c.png` resolves the same
 * way in every form: `<home>` plus the path.
 *
 * A file is named after the hint its caller gave and a digest of its bytes. A
 * pack read on every page load therefore writes nothing after the first time,
 * and two callers that happen to use one hint still never overwrite each other.
 * The hint is sanitized rather than refused: its words come from other people's
 * files, and a picture whose name carries a character Windows forbids is still
 * a picture worth keeping.
 *
 * Writes replace files atomically (see `atomic.ts`), so a reader never sees a
 * partial file. This module runs in the process that owns the disk.
 */
import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"

import { ASSET_DIR, assetKind, assetLimit, extensionFor, limitMessage } from "../assets.ts"
import type { AssetLibrary } from "../assets.ts"
import { writeFileAtomic } from "./atomic.ts"

/** How much of the digest names a file, in hex characters. */
const DIGEST_LENGTH = 8

/** How long the words taken from a hint may be. */
const STEM_LIMIT = 48

/** Characters no file name may carry; each becomes a separator instead. */
const RESERVED_IN_NAME = /[\\/:*?"<>|]+/g

/**
 * A caller's hint as the words of a file name.
 *
 * A path in the hint contributes its words rather than being cut at the last
 * separator: what a caller put in front of one — the pack or skill the asset
 * belongs to — is exactly what keeps two owners' files apart, and a name that
 * cannot carry a separator cannot escape the directory either.
 */
function stemOf(hint: string): string {
  const stem = hint
    .replace(RESERVED_IN_NAME, "-")
    .replace(/\.[^.]*$/, "")
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_.-]+/gu, "-")
    .replace(/\.{2,}/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, STEM_LIMIT)
  return stem === "" ? "asset" : stem
}

/** The extension a file keeps, from the hint first and its media type second. */
function extensionOf(hint: string, contentType: string | undefined): string {
  const named = /\.[A-Za-z0-9]{1,5}$/.exec(hint)
  if (named !== null) return named[0].toLowerCase()
  const byType = extensionFor(contentType ?? "")
  return byType === undefined ? "" : `.${byType}`
}

/**
 * Resolve one recorded path against the hub home.
 *
 * @param home — the hub home directory.
 * @param relative — a path recorded by the library.
 * @returns the absolute file path.
 */
export function resolveStoredFile(home: string, relative: string): string {
  const resolved = path.resolve(home, relative)
  const prefix = home.endsWith(path.sep) ? home : home + path.sep
  if (!resolved.startsWith(prefix)) {
    throw new Error(`path escapes the hub home: ${relative}`)
  }
  return resolved
}

async function statOrNull(target: string) {
  try {
    return await fs.stat(target)
  } catch {
    return null
  }
}

/** Create the asset library that writes under one hub home. */
export function createFsAssetLibrary(home: string): AssetLibrary {
  const dir = path.join(home, ASSET_DIR)

  return {
    root: dir,

    async put(file) {
      await fs.mkdir(dir, { recursive: true })
      const bytes = new Uint8Array(await file.arrayBuffer())
      const kind = assetKind(file.name, file.type)
      const limit = assetLimit(kind)
      if (bytes.byteLength > limit) throw new Error(limitMessage(kind))
      const digest = createHash("sha256")
        .update(bytes)
        .digest("hex")
        .slice(0, DIGEST_LENGTH)
      const name = `${stemOf(file.name)}-${digest}${extensionOf(file.name, file.type)}`
      const target = path.join(dir, name)
      /* The name carries the digest, so a file already there holds these very
         bytes and rewriting it would only move its timestamp. */
      if ((await statOrNull(target)) === null) await writeFileAtomic(target, bytes)
      return `${ASSET_DIR}/${name}`
    },

    async remove(relative) {
      await fs.rm(resolveStoredFile(home, relative), { force: true })
    },
  }
}
