/**
 * The extension market index: what one JSON document on a static host says
 * about the extensions it lists.
 *
 * The document is display data plus a pinned install source. It is validated
 * whole — a malformed entry is a publisher bug, and silently dropping it would
 * hide that. Nothing here fetches: the host reads the document and hands it to
 * this module, and the browser loads the same types from here.
 */
import {
  EXTENSION_CATEGORIES,
  EXTENSION_PERMISSIONS,
  isCompatible,
  isLocaleId,
  localized,
  type ExtensionCategoryId,
  type ExtensionPermission,
  type LocalizedText,
} from "./extension-manifest.ts"
import { assertPluginId } from "./plugins.ts"

export { localized }
export type { LocalizedText }

/** Where one version's files come from: a git repository. */
export interface MarketSource {
  type: "git"
  /** HTTPS repository URL, without credentials, query or fragment. */
  url: string
  /** Directory inside the repository; absent means the repository root. */
  path?: string
}

/** One installable version of an extension. */
export interface ExtensionMarketVersion {
  version: string
  /** Kernel API range the plugin's manifest declares. */
  apiVersion: string
  source: MarketSource
}

/** One extension listed by a market. */
export interface ExtensionMarketPlugin {
  id: string
  title: LocalizedText
  description: LocalizedText
  /** Absolute `https:` URL or a `data:` URL, resolved when the index is read. */
  icon: string
  author: string
  category?: ExtensionCategoryId
  /** Display only; installation does not grant or enforce these. */
  permissions?: ExtensionPermission[]
  /** Recommended version first. */
  versions: ExtensionMarketVersion[]
}

/** One validated market document. */
export interface ExtensionMarketIndex {
  format: 1
  title: LocalizedText
  description?: LocalizedText
  plugins: ExtensionMarketPlugin[]
}

/** How strictly a version source is read. */
export interface MarketIndexOptions {
  /** Allow an absolute local path as a version source; only for an index read from disk. */
  allowLocalGit?: boolean
}

/** Whether a string is an absolute path a person could type into the source box. */
export function isLocalMarketPath(value: string): boolean {
  const trimmed = value.trim()
  return /^[A-Za-z]:[\\/]/.test(trimmed) || trimmed.startsWith("/") || trimmed.startsWith("\\\\")
}

/**
 * Validate a market source: an HTTPS index URL, or an absolute local directory
 * or `marketplace.json` path for development.
 *
 * @param value — what the user typed.
 * @returns the canonical URL, or the trimmed path.
 * @throws {Error} when the source is not usable.
 */
export function isMarketSource(value: string): string {
  const trimmed = value.trim()
  if (isLocalMarketPath(trimmed)) {
    if (trimmed.includes("?") || trimmed.includes("#")) {
      throw new Error("market index: a local path must not carry a query or fragment")
    }
    return trimmed
  }
  return isMarketIndexUrl(trimmed)
}

const DATA_ICON = /^data:(image\/(?:svg\+xml|png|jpeg|webp));base64,([\s\S]+)$/i
const ICON_LIMIT = 32 * 1024

function fail(path: string, problem: string): never {
  throw new Error(`market index: ${path} ${problem}`)
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, "must be an object")
  }
  return value as Record<string, unknown>
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    fail(path, "must be a non-empty string")
  }
  return value
}

function localizedText(value: unknown, path: string): LocalizedText {
  if (typeof value === "string") {
    if (value.trim() === "") fail(path, "must be a non-empty string")
    return value
  }
  const object = record(value, path)
  let english = false
  for (const [locale, message] of Object.entries(object)) {
    if (!isLocaleId(locale)) fail(`${path}.${locale}`, "is not a locale id")
    if (typeof message !== "string" || message.trim() === "") {
      fail(`${path}.${locale}`, "must be a non-empty string")
    }
    if (locale === "en") english = true
  }
  if (!english) fail(path, 'must include "en"')
  return object as Record<string, string>
}

/** Bytes a base64 payload carries, after rejecting anything that is not base64. */
function iconBytes(payload: string, path: string): number {
  const clean = payload.replace(/\s+/g, "")
  if (clean.length === 0 || clean.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) {
    fail(path, "is not a base64 payload")
  }
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0
  return (clean.length / 4) * 3 - padding
}

function icon(value: unknown, path: string, indexUrl: string): string {
  const raw = text(value, path)
  const data = DATA_ICON.exec(raw)
  if (data !== null) {
    const bytes = iconBytes(data[2] ?? "", path)
    if (bytes > ICON_LIMIT) fail(path, `is larger than ${String(ICON_LIMIT)} bytes`)
    return raw
  }
  const url = (() => {
    try {
      return new URL(raw, indexUrl)
    } catch {
      fail(path, "is not a URL")
    }
  })()
  if (url.protocol !== "https:") fail(path, "must resolve to https")
  if (url.username !== "" || url.password !== "" || url.hash !== "") {
    fail(path, "must not carry credentials or a fragment")
  }
  return url.href
}

function repository(value: unknown, path: string, allowLocal: boolean): string {
  const raw = text(value, path)
  if (allowLocal && isLocalMarketPath(raw)) {
    if (raw.includes("?") || raw.includes("#")) {
      fail(path, "must not carry a query or fragment")
    }
    return raw
  }
  const url = (() => {
    try {
      return new URL(raw)
    } catch {
      fail(path, "is not a URL")
    }
  })()
  if (url.protocol !== "https:") fail(path, "must use https")
  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
    fail(path, "must not carry credentials, a query or a fragment")
  }
  const segments = url.pathname.split("/").filter((segment) => segment !== "")
  if (segments.length < 2) fail(path, "must name a repository, not a host")
  if (url.pathname.endsWith("/")) fail(path, "must not end with a slash")
  if (/\.(?:tgz|tar\.gz)$/i.test(url.pathname)) fail(path, "must not name an archive")
  return raw
}

function inside(value: unknown, path: string): string {
  const raw = text(value, path)
  if (raw.startsWith("/") || raw.includes("\\")) fail(path, "must be a relative POSIX path")
  for (const segment of raw.split("/")) {
    if (!/^[A-Za-z0-9._@+-]+$/.test(segment) || segment === "." || segment === "..") {
      fail(path, `contains an unusable segment "${segment}"`)
    }
  }
  return raw
}

function source(value: unknown, path: string, allowLocal: boolean): MarketSource {
  const object = record(value, path)
  if (object.type !== "git") fail(`${path}.type`, 'must be "git"')
  const result: MarketSource = {
    type: "git",
    url: repository(object.url, `${path}.url`, allowLocal),
  }
  if (object.path !== undefined) result.path = inside(object.path, `${path}.path`)
  return result
}

function version(value: unknown, path: string, allowLocal: boolean): ExtensionMarketVersion {
  const object = record(value, path)
  const tag = text(object.version, `${path}.version`)
  if (tag.length > 64 || /\s/.test(tag)) {
    fail(`${path}.version`, "must be at most 64 characters without whitespace")
  }
  const apiVersion = text(object.apiVersion, `${path}.apiVersion`)
  if (!isCompatible(apiVersion)) {
    fail(`${path}.apiVersion`, "is not compatible with this kernel")
  }
  return {
    version: tag,
    apiVersion,
    source: source(object.source, `${path}.source`, allowLocal),
  }
}

function versions(
  value: unknown,
  path: string,
  allowLocal: boolean
): ExtensionMarketVersion[] {
  if (!Array.isArray(value) || value.length === 0) fail(path, "must be a non-empty array")
  const found = value.map((item, at) =>
    version(item, `${path}[${String(at)}]`, allowLocal)
  )
  const seen = new Set<string>()
  for (const item of found) {
    if (seen.has(item.version)) fail(path, `lists version "${item.version}" twice`)
    seen.add(item.version)
  }
  return found
}

function plugin(
  value: unknown,
  path: string,
  indexUrl: string,
  allowLocal: boolean
): ExtensionMarketPlugin {
  const object = record(value, path)
  const id = text(object.id, `${path}.id`)
  try {
    assertPluginId(id)
  } catch {
    fail(`${path}.id`, `"${id}" is not a usable plugin id`)
  }
  const result: ExtensionMarketPlugin = {
    id,
    title: localizedText(object.title, `${path}.title`),
    description: localizedText(object.description, `${path}.description`),
    icon: icon(object.icon, `${path}.icon`, indexUrl),
    author: text(object.author, `${path}.author`),
    versions: versions(object.versions, `${path}.versions`, allowLocal),
  }
  if (object.category !== undefined) {
    if (!EXTENSION_CATEGORIES.includes(object.category as ExtensionCategoryId)) {
      fail(`${path}.category`, `"${String(object.category)}" is not a known category`)
    }
    result.category = object.category as ExtensionCategoryId
  }
  if (object.permissions !== undefined) {
    if (
      !Array.isArray(object.permissions) ||
      !object.permissions.every((item) =>
        EXTENSION_PERMISSIONS.includes(item as ExtensionPermission)
      )
    ) {
      fail(`${path}.permissions`, "must list known permissions")
    }
    result.permissions = object.permissions as ExtensionPermission[]
  }
  return result
}

/**
 * Validate one market document.
 *
 * @param value — the parsed JSON.
 * @param indexUrl — the URL the document was read from, used to resolve icons.
 * @returns the validated index.
 * @throws {Error} with the JSON path of the first violation.
 */
export function readMarketIndex(
  value: unknown,
  indexUrl: string,
  options: MarketIndexOptions = {}
): ExtensionMarketIndex {
  const object = record(value, "index")
  if (object.format !== 1) fail("format", "must be 1")
  if (!Array.isArray(object.plugins)) fail("plugins", "must be an array")
  const allowLocal = options.allowLocalGit === true
  const seen = new Set<string>()
  const plugins = object.plugins.map((item, at) => {
    const found = plugin(item, `plugins[${String(at)}]`, indexUrl, allowLocal)
    const key = found.id.toLowerCase()
    if (seen.has(key)) fail(`plugins[${String(at)}].id`, `"${found.id}" is listed twice`)
    seen.add(key)
    return found
  })
  return {
    format: 1,
    title: localizedText(object.title, "title"),
    ...(object.description === undefined
      ? {}
      : { description: localizedText(object.description, "description") }),
    plugins,
  }
}

/**
 * Validate and normalize a market index URL.
 *
 * A GitHub repository URL is accepted as a convenience and mapped to the raw
 * `marketplace.json` on its `main` branch, which is where this market keeps the
 * index. Any other GitHub page is refused with that shape named.
 *
 * @param value — what the user typed.
 * @returns the canonical URL.
 * @throws {Error} when the URL is not usable as an index source.
 */
export function isMarketIndexUrl(value: string): string {
  const url = (() => {
    try {
      return new URL(value.trim())
    } catch {
      throw new Error("market index: the address is not a URL")
    }
  })()
  if (url.protocol !== "https:") throw new Error("market index: the address must use https")
  if (url.username !== "" || url.password !== "" || url.hash !== "") {
    throw new Error("market index: the address must not carry credentials or a fragment")
  }
  if (url.hostname === "github.com" || url.hostname === "www.github.com") {
    return githubRawIndex(url)
  }
  return url.href
}

/** `/<owner>/<repo>` is the only GitHub path this shortcut understands. */
const GITHUB_REPO_PATH = /^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

/**
 * Map a GitHub repository URL to the raw index on its default branch.
 *
 * The market repository keeps `marketplace.json` at its root on `main`; a
 * repository that does otherwise can still enter the raw index URL directly.
 */
function githubRawIndex(url: URL): string {
  if (!GITHUB_REPO_PATH.test(url.pathname)) {
    throw new Error(
      "market index: use a repository URL like https://github.com/<owner>/<repo> or its raw marketplace.json URL"
    )
  }
  const [owner, repo] = url.pathname.split("/").filter((segment) => segment !== "")
  return `https://raw.githubusercontent.com/${owner}/${repo!.replace(/\.git$/i, "")}/main/marketplace.json`
}

/**
 * Pick the text for one locale: exact match, then language, then `en`.
 *
 * @param plugin — one validated market entry.
 * @returns its first version.
 */
export function recommendedVersion(plugin: ExtensionMarketPlugin): ExtensionMarketVersion {
  const first = plugin.versions[0]
  if (first === undefined) throw new Error(`market index: "${plugin.id}" lists no versions`)
  return first
}
