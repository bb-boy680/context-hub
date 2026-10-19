/**
 * The extension manifest contract, shared by the browser loader and the host.
 *
 * The host validates a downloaded `plugin.json` before it installs one, and the
 * loader validates the same file again when it reads it. Keeping the rules here
 * means both sides agree on what a manifest may say, and neither has to import
 * React or a Node API to find out.
 */

/** Extension API this kernel implements; manifests declare the range they were built for. */
export const EXTENSION_API_VERSION = "0.1"

/** Catalog grouping on the Extensions page. */
export type ExtensionCategoryId =
  | "agent"
  | "asset"
  | "integration"
  | "language"
  | "appearance"
  | "source"
  | "storage"

/** A capability an extension asks for before it is enabled. */
export type ExtensionPermission =
  | "storage.self"
  | "assets.read"
  | "assets.write"
  | "filesystem"
  | "network"

/** Manifest fields accepted from `plugin.json`, before the kernel resolves them. */
export interface PluginManifestFile {
  /** Must equal the directory name; the kernel refuses a mismatch. */
  id: string
  name: string
  version: string
  /** Kernel API range this plugin was built against, e.g. "^0.1". */
  apiVersion: string
  description?: string
  /** Kebab-case icon name, e.g. "sparkles"; see `PLUGIN_ICONS`. */
  icon?: string
  /** Module file inside the plugin directory that exports `apply`; defaults to index.js. */
  entry?: string
  category?: ExtensionCategoryId
  permissions?: ExtensionPermission[]
  /** Service names this plugin requires; it stays waiting until each is provided. */
  inject?: string[]
  /** Service names this plugin provides to others. */
  provides?: string[]
  /** Enable on first sight when the hub has no recorded choice for it. */
  defaultEnabled?: boolean
}

/** Permissions a manifest may ask for. */
export const EXTENSION_PERMISSIONS: readonly ExtensionPermission[] = [
  "storage.self",
  "assets.read",
  "assets.write",
  "filesystem",
  "network",
]

/** Categories a manifest may declare. */
export const EXTENSION_CATEGORIES: readonly ExtensionCategoryId[] = [
  "agent",
  "asset",
  "integration",
  "language",
  "appearance",
  "source",
  "storage",
]

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`plugin manifest: "${field}" must be a non-empty string`)
  }
  return value
}

/**
 * Validate one `plugin.json` document.
 *
 * @param value — the parsed JSON.
 * @param id — the directory name, which the manifest id must equal.
 * @returns the validated manifest.
 * @throws {Error} when a required field is missing, or a value is unusable.
 */
export function parsePluginManifest(value: unknown, id: string): PluginManifestFile {
  if (typeof value !== "object" || value === null) {
    throw new Error("plugin manifest: expected a JSON object")
  }
  const file = value as Record<string, unknown>
  const manifestId = requireString(file.id, "id")
  if (manifestId !== id) {
    throw new Error(`plugin manifest: id "${manifestId}" does not match its directory "${id}"`)
  }
  const apiVersion = requireString(file.apiVersion, "apiVersion")
  if (!isCompatible(apiVersion)) {
    throw new Error(
      `plugin manifest: apiVersion "${apiVersion}" is not compatible with this kernel`
    )
  }
  const permissions = file.permissions
  if (permissions !== undefined) {
    if (
      !Array.isArray(permissions) ||
      !permissions.every((item) => EXTENSION_PERMISSIONS.includes(item as ExtensionPermission))
    ) {
      throw new Error("plugin manifest: permissions must list known permissions")
    }
  }
  const category = file.category
  if (category !== undefined && !EXTENSION_CATEGORIES.includes(category as ExtensionCategoryId)) {
    throw new Error(`plugin manifest: unknown category "${String(category)}"`)
  }
  if (file.locked !== undefined) {
    throw new Error("plugin manifest: an installed plugin cannot lock itself on")
  }
  return {
    id: manifestId,
    name: requireString(file.name, "name"),
    version: requireString(file.version, "version"),
    apiVersion,
    description: typeof file.description === "string" ? file.description : "",
    icon: typeof file.icon === "string" ? file.icon : undefined,
    entry: typeof file.entry === "string" ? file.entry : undefined,
    category: (category as PluginManifestFile["category"]) ?? "source",
    permissions: permissions as ExtensionPermission[] | undefined,
    inject: Array.isArray(file.inject) ? (file.inject as string[]) : undefined,
    provides: Array.isArray(file.provides) ? (file.provides as string[]) : undefined,
    defaultEnabled: file.defaultEnabled === true,
  }
}

/** Whether this kernel can load a manifest, by API range equality. */
export function isCompatible(apiVersion: string): boolean {
  return apiVersion.replace(/^[\^~]/, "") === EXTENSION_API_VERSION
}
