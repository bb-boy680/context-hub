/**
 * Reading what a pack says about itself, in whatever directory it sits.
 *
 * An agent's own list reports a pack's name and where it lives, and nothing
 * about what it carries; the pack's manifest is where its description is written
 * down, and its own files are where its picture is. Both are read here, so a row
 * can say as much about a pack an agent holds as about one this hub collected.
 *
 * A directory that holds no manifest is not an error: a manifest is optional,
 * and an agent derives a name for such a pack from its own marketplace entry. So
 * this answers with empty fields, which a row shows as nothing rather than as an
 * invented sentence.
 *
 * The picture is kept the way collecting the pack would keep it — through the
 * hub's asset store, under the hub's own directory — so a row never points into
 * an agent's install directory: that path stops resolving the moment the agent
 * removes the pack. Nothing about the pack is recorded, only its picture, and a
 * pack read twice keeps one copy of it.
 *
 * This module runs in the process that owns the disk.
 */
import { promises as fs } from "node:fs"
import path from "node:path"

import type { AssetStore } from "@context-hub/core"

import { PLUGIN_MANIFESTS, type PackDescription } from "../contract.ts"
import { findLogo, storePicture } from "./logo.ts"

/** One pack's manifest, read as the fields a record and a row both need. */
export interface ManifestFields {
  /** Whether any manifest file was found, readable or not — a file that is somebody else's still says this directory is not empty of them. */
  carried: boolean
  /** The name it gives, when it gives one. */
  name?: string
  version: string
  description: string
}

/** No manifest, or one this build cannot use: every field empty. */
const NOTHING: ManifestFields = { carried: false, version: "", description: "" }

/**
 * Read the first manifest of a directory that names or versions the pack.
 *
 * The order across the locations is the one {@link PLUGIN_MANIFESTS} sets, and a
 * file that names nothing is passed over rather than taken: a repository root
 * carries a `plugin.json` for its own tooling often enough that stopping at one
 * would read the wrong file.
 *
 * @param dir — the pack's directory.
 * @returns what the manifest says, with `carried` saying whether one was found at all.
 */
export async function readManifestFields(dir: string): Promise<ManifestFields> {
  let carried = false
  for (const relative of PLUGIN_MANIFESTS) {
    const manifest = await readManifestFile(path.join(dir, relative))
    if (manifest === null) continue
    carried = true
    const name =
      typeof manifest.name === "string" && manifest.name !== "" ? manifest.name : undefined
    const version = typeof manifest.version === "string" ? manifest.version : ""
    if (name === undefined && version === "") continue
    return {
      carried: true,
      ...(name === undefined ? {} : { name }),
      version,
      description: typeof manifest.description === "string" ? manifest.description : "",
    }
  }
  return { ...NOTHING, carried }
}

/** One manifest file read as JSON, or nothing when it is absent or unreadable. */
async function readManifestFile(file: string): Promise<Record<string, unknown> | null> {
  const raw = await fs.readFile(file, "utf8").catch(() => null)
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null
  } catch {
    /* A manifest this build cannot parse is not one it can use; the next
       location may still hold one it can. */
    return null
  }
}

/**
 * What the pack in one directory says about itself.
 *
 * @param dir — the pack's directory, as the agent named it.
 * @param name — the pack's name, which prefixes the file its picture is kept as.
 * @param assets — the hub's asset store, where the picture is kept.
 * @returns its name, version, description, and the reference to its picture when it ships one the hub will keep.
 */
export async function describePack(
  dir: string,
  name: string,
  assets: AssetStore
): Promise<PackDescription> {
  const fields = await readManifestFields(dir)
  const logo = await findLogo(dir)
  const icon = logo === undefined ? undefined : await storePicture(assets, dir, name, logo)
  return {
    name: fields.name ?? "",
    version: fields.version,
    description: fields.description,
    ...(icon === undefined ? {} : { icon }),
  }
}
