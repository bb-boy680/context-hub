/**
 * The one source shape a market may ask this hub to collect: a repository, or
 * one directory of one, pinned to a commit when the market publishes one.
 *
 * A market entry is somebody else's data, so nothing it says reaches `git`
 * before it passes here. The two kinds are the two a market index can name
 * without this hub having to reach into the machine the page runs on — an
 * archive is a download this library does not pin, and a local path is not a
 * thing a remote index can know.
 *
 * This module runs on both sides of the wire, so the page and the host judge
 * an entry by the same rules.
 */
import { assertPackRelative } from "./host/names.ts"

/** One pack a market says is there, as the address the library collects. */
export type MarketInstallSource =
  | { kind: "url"; url: string; ref?: string; sha?: string }
  | { kind: "git-subdir"; url: string; path: string; ref?: string; sha?: string }

/** A commit id, as a market index spells it. */
const SHA = /^[0-9a-f]{40}$/i

/** Refuse an address that is not the one thing a market may name. */
function httpsUrl(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("a market source needs a repository address")
  }
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`not an address: ${value}`)
  }
  if (parsed.protocol !== "https:") throw new Error(`a market source must use https: ${value}`)
  if (parsed.username !== "" || parsed.password !== "") {
    throw new Error("a market source must not carry credentials")
  }
  if (parsed.search !== "" || parsed.hash !== "") {
    throw new Error("a market source must not carry a query or a fragment")
  }
  return value
}

/** A branch or tag, as the field travels to `git`. */
function optionalRef(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "string" || value === "" || /\s/.test(value)) {
    throw new Error("a market source ref must be a single word")
  }
  return value
}

/** A commit, when the market publishes one; the optional field stays absent otherwise. */
function optionalSha(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "string" || !SHA.test(value)) {
    throw new Error("a market source sha must be a 40-character commit id")
  }
  return value
}

function recordOf(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("a market source must be an object")
  }
  return value as Record<string, unknown>
}

/**
 * Read one market entry's source, or refuse it with the reason.
 *
 * @throws {Error} for a kind this hub does not collect from a market, a URL
 * that is not https, or a path that would escape the pack.
 */
export function assertMarketInstall(value: unknown): MarketInstallSource {
  const source = recordOf(value)
  const url = httpsUrl(source.url)
  const ref = optionalRef(source.ref)
  const sha = optionalSha(source.sha)

  if (source.kind === "url") {
    if (source.path !== undefined) throw new Error("a url market source has no path")
    return { kind: "url", url, ...(ref === undefined ? {} : { ref }), ...(sha === undefined ? {} : { sha }) }
  }
  if (source.kind === "git-subdir") {
    if (typeof source.path !== "string") throw new Error("a git-subdir market source needs a path")
    return {
      kind: "git-subdir",
      url,
      path: assertPackRelative(source.path),
      ...(ref === undefined ? {} : { ref }),
      ...(sha === undefined ? {} : { sha }),
    }
  }
  throw new Error(`a market source must be url or git-subdir: ${String(source.kind)}`)
}
