/**
 * The official Codex marketplace, read into the page's own entry shape.
 *
 * Most entries are a directory inside the marketplace's own repository; a few
 * name a whole repository or one directory of another one. The index carries
 * no description or mark — those live in each pack's own `plugin.json`, read
 * only for rows that are on screen.
 */
import { assertMarketInstall } from "@context-hub/plugins/market-install"
import type { MarketEntry } from "@context-hub/market-plugins"

import type { RawCodexMarketplace, RawCodexPlugin } from "./types.ts"

/** This source's id, which prefixes every row key. */
export const CODEX_SOURCE_ID = "codex"

/** The repository the marketplace and its relative entries live in. */
export const CODEX_MARKET_REPO = "https://github.com/openai/plugins"

/** The index's path inside that repository. */
export const CODEX_MARKET_INDEX = ".agents/plugins/marketplace.json"

/** The index's raw address. */
export const CODEX_MARKET_INDEX_URL = `https://raw.githubusercontent.com/openai/plugins/main/${CODEX_MARKET_INDEX}`

/** Where a problem with one entry is reported. */
export type MarketLog = (level: "info" | "warn" | "error", message: string) => void

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
  if (!record(source)) return null
  switch (source.source) {
    case "local": {
      const path = typeof source.path === "string" ? relativePath(source.path) : ""
      return path === "" ? null : { kind: "git-subdir", url: CODEX_MARKET_REPO, path, ref: "main" }
    }
    case "url":
      return {
        kind: "url",
        url: source.url,
        ...(source.ref === undefined ? {} : { ref: source.ref }),
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
 * @throws {Error} when the index itself is not the shape this source reads;
 * a bad entry is skipped instead.
 */
export function readCodexMarketplace(data: unknown, log: MarketLog): MarketEntry[] {
  if (!record(data) || !Array.isArray((data as RawCodexMarketplace).plugins)) {
    throw new Error("Codex market: the answer has no plugins list")
  }
  const entries: MarketEntry[] = []
  for (const raw of data.plugins as unknown[]) {
    if (!record(raw)) continue
    const row = raw as RawCodexPlugin
    const name = text(row.name)
    if (name === undefined) continue

    const install = installOf(row.source)
    if (install === null) {
      log("warn", `Codex market: skipped "${name}": its source is not one this hub collects`)
      continue
    }
    let checked
    try {
      checked = assertMarketInstall(install)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      log("warn", `Codex market: skipped "${name}": ${reason}`)
      continue
    }

    const category = text(row.category)
    entries.push({
      id: `${CODEX_SOURCE_ID}:${name}`,
      name,
      sourceId: CODEX_SOURCE_ID,
      install: checked,
      ...(category === undefined ? {} : { category }),
    })
  }
  return entries
}
