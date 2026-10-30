/**
 * The official Claude Code marketplace, read into the page's own entry shape.
 *
 * Three source forms are in the index today: a relative path inside the
 * marketplace's own repository, a whole repository, and one directory of a
 * repository. Each becomes the collect address the library already knows; a
 * fourth form is skipped with a log line rather than handed to the page.
 */
import { assertMarketInstall } from "@context-hub/plugins/market-install"
import type { MarketEntry } from "@context-hub/market-plugins"

import type { RawClaudeMarketplace, RawClaudePlugin } from "./types.ts"

/** This source's id, which prefixes every row key. */
export const CLAUDE_SOURCE_ID = "claude-code"

/** The repository the marketplace and its relative entries live in. */
export const CLAUDE_MARKET_REPO = "https://github.com/anthropics/claude-plugins-official"

/** The index's path inside that repository. */
export const CLAUDE_MARKET_INDEX = ".claude-plugin/marketplace.json"

/** The index's raw address. */
export const CLAUDE_MARKET_INDEX_URL = `https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/${CLAUDE_MARKET_INDEX}`

/** Where a problem with one entry is reported. */
export type MarketLog = (level: "info" | "warn" | "error", message: string) => void

/** The GitHub owner a repository address names, when it names a GitHub one. */
export function githubOwner(url: string): string | undefined {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }
  if (parsed.hostname.toLowerCase() !== "github.com") return undefined
  return parsed.pathname.split("/").filter((part) => part !== "")[0]
}

/**
 * The owner's avatar, which is the closest the official index has to a mark.
 *
 * Anthropic's own entries answer with nothing: their avatar would be
 * Anthropic's, which names the marketplace rather than the pack, so the row
 * falls back to its category mark instead.
 */
export function ownerAvatar(url: string): string | undefined {
  const owner = githubOwner(url)
  if (owner === undefined || owner.toLowerCase() === "anthropics") return undefined
  return `https://github.com/${encodeURIComponent(owner)}.png?size=64`
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined
}

/** A relative path inside the marketplace repository, as `git-subdir` spells it. */
function relativePath(value: string): string {
  return value
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part !== "" && part !== ".")
    .join("/")
}

/** The collect address one index entry names, or `null` for a form this source skips. */
function installOf(source: unknown): unknown {
  if (typeof source === "string") {
    const path = relativePath(source)
    return path === "" ? null : { kind: "git-subdir", url: CLAUDE_MARKET_REPO, path }
  }
  if (!record(source)) return null
  switch (source.source) {
    case "url":
      return {
        kind: "url",
        url: source.url,
        ...(source.sha === undefined ? {} : { sha: source.sha }),
      }
    case "git-subdir":
      return {
        kind: "git-subdir",
        url: source.url,
        path: source.path,
        ...(source.ref === undefined ? {} : { ref: source.ref }),
        ...(source.sha === undefined ? {} : { sha: source.sha }),
      }
    default:
      return null
  }
}

/**
 * Read one index.
 *
 * @param data — the parsed index.
 * @param log — where a skipped entry is reported.
 * @throws {Error} when the index itself is not the shape this source reads;
 * a bad entry is skipped instead, because one bad row must not hide the rest.
 */
export function readClaudeMarketplace(data: unknown, log: MarketLog): MarketEntry[] {
  if (!record(data) || !Array.isArray((data as RawClaudeMarketplace).plugins)) {
    throw new Error("Claude Code market: the answer has no plugins list")
  }
  const entries: MarketEntry[] = []
  for (const raw of data.plugins as unknown[]) {
    if (!record(raw)) continue
    const row = raw as RawClaudePlugin
    const name = text(row.name)
    if (name === undefined) continue

    const install = installOf(row.source)
    if (install === null) {
      log("warn", `Claude Code market: skipped "${name}": its source is not one this hub collects`)
      continue
    }
    let checked
    try {
      checked = assertMarketInstall(install)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      log("warn", `Claude Code market: skipped "${name}": ${reason}`)
      continue
    }

    const author = record(row.author) ? text(row.author.name) : text(row.author)
    const description = text(row.description)
    const category = text(row.category)
    const homepage = text(row.homepage)
    entries.push({
      id: `${CLAUDE_SOURCE_ID}:${name}`,
      name,
      sourceId: CLAUDE_SOURCE_ID,
      install: checked,
      ...(description === undefined ? {} : { description }),
      ...(author === undefined ? {} : { author }),
      ...(category === undefined ? {} : { category }),
      ...(homepage === undefined ? {} : { homepage }),
    })
  }
  return entries
}
