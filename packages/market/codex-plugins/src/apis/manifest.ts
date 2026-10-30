/**
 * One Codex pack's own `plugin.json`, read for the two things its index does
 * not carry: the sentence a person reads under the name, and the mark beside
 * it.
 */
import type { MarketInstallSource } from "@context-hub/plugins/market-install"

import { CODEX_MARKET_REPO } from "./marketplace.ts"

/** The marketplace repository without a `.git` suffix, for comparison. */
const MARKET_REPO = CODEX_MARKET_REPO.replace(/\.git$/, "")

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined
}

/**
 * The raw address of one pack's manifest, when this source can name it.
 *
 * Only the marketplace's own directory entries are read: a pack from another
 * repository and a whole-repository pack do not have a one-line raw address
 * this source could derive without knowing that host's layout.
 */
export function manifestUrl(install: MarketInstallSource): string | undefined {
  if (install.kind !== "git-subdir") return undefined
  if (install.url.replace(/\.git$/, "") !== MARKET_REPO) return undefined
  const ref = install.ref ?? "main"
  return `https://raw.githubusercontent.com/openai/plugins/${ref}/${install.path}/.codex-plugin/plugin.json`
}

/** What a manifest says about the two fields the index leaves out. */
export function readCodexManifest(data: unknown): {
  logo?: string
  description?: string
} {
  if (!record(data)) return {}
  const description = text(data.description)
  const logo = record(data.interface) ? text(data.interface.logo) : undefined
  return {
    ...(description === undefined ? {} : { description }),
    ...(logo === undefined ? {} : { logo }),
  }
}

/**
 * A manifest's logo, resolved against the pack's directory into a raw address.
 *
 * A logo may already be an address; a relative one is a file beside the
 * manifest, which is where the raw repository serves it from.
 */
export function resolveLogo(
  install: MarketInstallSource,
  logo: string
): string | undefined {
  if (/^https:\/\//i.test(logo)) return logo
  if (install.kind !== "git-subdir") return undefined
  const relative = logo.replace(/^\.\//, "").replace(/^\//, "")
  if (relative === "" || relative.split("/").includes("..")) return undefined
  const ref = install.ref ?? "main"
  return `https://raw.githubusercontent.com/openai/plugins/${ref}/${install.path}/${relative}`
}
