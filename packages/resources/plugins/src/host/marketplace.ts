/**
 * The marketplace indexes a library root carries, so the directory can be handed
 * to a coding agent as it is.
 *
 * One root serves several clients, because each one looks for its own file and
 * ignores the others: Claude Code reads `.claude-plugin/marketplace.json`, and
 * Codex reads `.agents/plugins/marketplace.json`. Both were checked against the
 * clients themselves — a local directory registered with either CLI, and a pack
 * collected from it. That is also what makes the library deliverable: commit it,
 * clone it on another machine, add the clone.
 *
 * The indexes are derived, never authored: every field comes from the packs' own
 * manifests, so they are written from the library as it stands rather than kept
 * in step by hand. Nothing here reads somebody else's index — taking a pack from
 * a marketplace is a different step, with a different owner.
 *
 * This module runs in the process that owns the disk.
 */
import { promises as fs } from "node:fs"
import path from "node:path"

import { writeFileAtomic } from "@context-hub/core/host/atomic"

import {
  PLUGIN_MARKETPLACE_DIR,
  PLUGIN_MARKETPLACE_FILE,
  PLUGIN_MARKETPLACE_NAME,
} from "../contract.ts"
import type { PluginRecord } from "../revision.ts"

/** Where Codex keeps the marketplace manifest of a directory it reads. */
const CODEX_MARKETPLACE_DIR = path.join(".agents", "plugins")

/** One entry of the Claude Code index. */
interface ClaudeEntry {
  name: string
  source: string
  description: string
  version: string
}

/** One entry of the Codex index, whose source is an object and whose policy is required. */
interface CodexEntry {
  name: string
  source: { source: "local"; path: string }
  policy: { installation: "AVAILABLE" }
  category: string
  description: string
  version: string
}

/** The index shape both clients share: a name, an owner-ish label, and the entries. */
interface MarketplaceIndex<T> {
  name: string
  description: string
  interface?: { displayName: string }
  owner?: { name: string }
  plugins: T[]
}

/**
 * Build the Claude Code index for one library root.
 *
 * @param records — the packs to list, in the order the library holds them.
 * @returns the document as it is written.
 */
export function marketplaceIndex(records: readonly PluginRecord[]): MarketplaceIndex<ClaudeEntry> {
  return {
    name: PLUGIN_MARKETPLACE_NAME,
    description: "Plugin packs collected by Context Hub.",
    owner: { name: "Context Hub" },
    /* A relative source keeps the index portable: the same file works from any
       checkout, because it points inside the marketplace it sits in. */
    plugins: records.map((record) => ({
      name: record.name,
      source: `./${record.name}`,
      description: record.description,
      version: record.version,
    })),
  }
}

/**
 * Build the Codex index for the same root. Codex reads a different file, wants
 * its source as an object, and expects an install policy per entry.
 *
 * @param records — the packs to list.
 * @returns the document as Codex reads it.
 */
export function codexMarketplaceIndex(
  records: readonly PluginRecord[]
): MarketplaceIndex<CodexEntry> {
  return {
    name: PLUGIN_MARKETPLACE_NAME,
    description: "Plugin packs collected by Context Hub.",
    interface: { displayName: "Context Hub" },
    plugins: records.map((record) => ({
      name: record.name,
      source: { source: "local", path: `./${record.name}` },
      policy: { installation: "AVAILABLE" },
      category: "Other",
      description: record.description,
      version: record.version,
    })),
  }
}

/** Write one index, creating the directory the client expects it in. */
async function writeIndex(target: string, document: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true })
  await writeFileAtomic(target, `${JSON.stringify(document, null, 2)}\n`)
}

/**
 * Write every index a library root carries. A root with no packs still gets
 * them, because a client that reads a directory with no manifest says so
 * instead of reading it as an empty marketplace.
 *
 * @param root — the library root.
 * @param records — the packs to list.
 */
export async function writeMarketplaceIndex(
  root: string,
  records: readonly PluginRecord[]
): Promise<void> {
  await Promise.all([
    writeIndex(
      path.join(root, PLUGIN_MARKETPLACE_DIR, PLUGIN_MARKETPLACE_FILE),
      marketplaceIndex(records)
    ),
    writeIndex(
      path.join(root, CODEX_MARKETPLACE_DIR, PLUGIN_MARKETPLACE_FILE),
      codexMarketplaceIndex(records)
    ),
  ])
}

