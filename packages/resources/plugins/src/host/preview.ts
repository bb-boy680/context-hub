/**
 * What a market entry carries, read before it is collected.
 *
 * A market lists a pack by address, not by content: its README, skills,
 * commands and `.mcp.json` only exist inside the pack. This fetches that pack
 * into a staging directory the library never sees, reads it with the same
 * reader a collected pack uses, and throws the directory away. Nothing is
 * written to the library.
 *
 * A preview is a fetch, so answers are kept for a while: opening the same
 * entry twice should not clone the repository twice.
 */
import { promises as fs } from "node:fs"
import path from "node:path"

import type { PackContents } from "../contract.ts"
import type { PluginSourceSpec } from "../inspect.ts"
import { readPackContents } from "./contents.ts"
import { fetchPlugin, stagingDir } from "./fetch.ts"

/** What one entry says before it is here. */
export interface MarketPreview {
  /** The pack's README as written, or `null` when it carries none. */
  readme: string | null
  /** The skills, commands and MCP declaration its own directory holds. */
  contents: PackContents
}

/** The file names a pack may write its README under, in the order they are tried. */
const README_NAMES = ["README.md", "readme.md", "Readme.md"]

/** How long a preview is trusted; a pinned commit cannot change under it. */
const PREVIEW_TTL = 10 * 60_000

const cached = new Map<string, { at: number; value: MarketPreview }>()
const pending = new Map<string, Promise<MarketPreview>>()

/** One address as the cache key: every part that names different bytes. */
function keyOf(spec: PluginSourceSpec, manifests: readonly string[]): string {
  return JSON.stringify([
    spec.kind,
    "url" in spec ? spec.url : "",
    "path" in spec ? spec.path : "",
    "ref" in spec ? spec.ref : "",
    "sha" in spec ? spec.sha : "",
    manifests,
  ])
}

/** Fetch one pack into a staging directory, read it, and remove the directory. */
async function readPreview(spec: PluginSourceSpec, manifests: readonly string[]): Promise<MarketPreview> {
  const work = await stagingDir()
  const stage = path.join(work, "pack")
  try {
    await fs.mkdir(stage, { recursive: true })
    await fetchPlugin(spec, stage, work)
    const contents = await readPackContents(stage, manifests)
    let readme: string | null = null
    for (const name of README_NAMES) {
      readme = await fs.readFile(path.join(stage, name), "utf8").catch(() => null)
      if (readme !== null) break
    }
    return { readme, contents }
  } finally {
    await fs.rm(work, { recursive: true, force: true })
  }
}

/**
 * What one market entry carries, cached for a while and shared while in flight.
 *
 * @param spec — a validated market address.
 * @throws {Error} when the pack cannot be fetched or read.
 */
export function previewMarket(spec: PluginSourceSpec, manifests: readonly string[] = []): Promise<MarketPreview> {
  const key = keyOf(spec, manifests)
  const hit = cached.get(key)
  if (hit !== undefined && Date.now() - hit.at < PREVIEW_TTL) {
    return Promise.resolve(hit.value)
  }
  const running = pending.get(key)
  if (running !== undefined) return running
  const job = readPreview(spec, manifests)
    .then((value) => {
      cached.set(key, { at: Date.now(), value })
      return value
    })
    .finally(() => {
      pending.delete(key)
    })
  pending.set(key, job)
  return job
}
