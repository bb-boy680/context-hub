/**
 * The library index, `<home>/plugins/plugins.json`: one object per collected
 * pack, in one top-level array — the same shape `<home>/mcp/mcp.json` has, so a
 * person who has read one of the hub's files has read them both. A record's
 * `name` is its identity: it is the directory the pack sits in and the entry
 * every agent's own marketplace lists it under, so there is nothing else to key
 * on.
 *
 * A record keeps two kinds of picture, and they are not interchangeable: `icon`
 * is the pack's own mark, the one file its directory ships to represent it, and
 * `assets` are the pictures a person adds to show it off. Older records kept the
 * mark among the assets, so reading one that does — recognisable because the
 * reference sits under the pack's own directory — puts it where it belongs.
 *
 * The file is durable JSON a person may edit, so a reader validates what it
 * finds and drops a record it cannot use rather than refusing the whole file.
 * This module imports no Node built-in, so the page and the host share it.
 */
import { ASSET_DIR } from "@workspace/core"

import type { PluginCheck, PluginOrigin } from "./contract.ts"
import type { PluginRecord } from "./revision.ts"

/** A home that has never collected anything. */
export function emptyIndex(): PluginRecord[] {
  return []
}

/**
 * The directory under the hub's asset root that holds one pack's own files.
 *
 * @param name — the pack's name.
 */
export function ownPicturePrefix(name: string): string {
  return `${ASSET_DIR}/${name}/`
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/** One origin read back, or null when the stored value is not one this build can use. */
function originOf(value: unknown): PluginOrigin | null {
  if (!isObject(value)) return null
  switch (value.kind) {
    case "git": {
      if (typeof value.url !== "string" || typeof value.revision !== "string") return null
      return {
        kind: "git",
        url: value.url,
        revision: value.revision,
        ...(typeof value.ref === "string" ? { ref: value.ref } : {}),
      }
    }
    case "archive": {
      if (typeof value.url !== "string") return null
      return {
        kind: "archive",
        url: value.url,
        ...(typeof value.etag === "string" ? { etag: value.etag } : {}),
      }
    }
    case "path": {
      if (typeof value.path !== "string") return null
      return { kind: "path", path: value.path }
    }
    default:
      return null
  }
}

function checkOf(value: unknown): PluginCheck | undefined {
  if (!isObject(value)) return undefined
  if (typeof value.at !== "string" || typeof value.currentHash !== "string") return undefined
  return {
    at: value.at,
    currentHash: value.currentHash,
    ...(typeof value.latest === "string" ? { latest: value.latest } : {}),
  }
}

/**
 * One stored record read back. Only a `name` and a source this build understands
 * are required; a record missing them cannot be checked or updated, so it is
 * dropped rather than kept in a half-usable state.
 *
 * @param value — one entry of the stored array.
 * @returns the record, or null when this build cannot use it.
 */
export function recordOf(value: unknown): PluginRecord | null {
  if (!isObject(value)) return null
  if (typeof value.name !== "string" || value.name === "") return null
  const source = originOf(value.source)
  if (source === null || typeof value.hash !== "string") return null
  const held = Array.isArray(value.assets)
    ? value.assets.filter((asset): asset is string => typeof asset === "string")
    : []
  /* A mark kept among the assets reads as the icon it is; a picture a person
     added does not, and stays where it is. */
  const own = ownPicturePrefix(value.name)
  const kept = held.filter((asset) => !asset.startsWith(own))
  const declared = typeof value.icon === "string" ? value.icon : ""
  return {
    name: value.name,
    version: typeof value.version === "string" ? value.version : "",
    description: typeof value.description === "string" ? value.description : "",
    tags: Array.isArray(value.tags)
      ? value.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    source,
    hash: value.hash,
    icon: declared === "" ? (held.find((asset) => asset.startsWith(own)) ?? "") : declared,
    assets: kept,
    installedAt: typeof value.installedAt === "string" ? value.installedAt : "",
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
    ...(checkOf(value.checked) === undefined ? {} : { checked: checkOf(value.checked) }),
  }
}

/**
 * Read the whole index. A file this build cannot read in any part still yields
 * the records it can: one bad record is not a reason to lose the library.
 *
 * @param stored — the parsed file, or anything else that was found there.
 * @returns the records, in the order the file held them.
 */
export function readIndex(stored: unknown): PluginRecord[] {
  if (!Array.isArray(stored)) return emptyIndex()
  const records: PluginRecord[] = []
  for (const value of stored) {
    const record = recordOf(value)
    if (record !== null) records.push(record)
  }
  return records
}

/** The index as the file is written: two-space JSON, one trailing newline. */
export function serializeIndex(records: readonly PluginRecord[]): string {
  return `${JSON.stringify(records, null, 2)}\n`
}
