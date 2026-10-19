/**
 * The extension manifest contract, shared by the browser loader and the host.
 *
 * A package carries two declarations: `plugin.yaml` (identity, API range,
 * presentation, and the services it needs) and `package.json` (version and
 * entry). The host validates both before it installs one, and the loader
 * validates the same files when it reads them. Keeping the rules here means
 * both sides agree on what a package may say, and neither has to import React
 * or a Node API to find out.
 */
import { CORE_SCHEMA, load } from "js-yaml"

import { DEFAULT_PLUGIN_ENTRY } from "./plugins.ts"

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

/** Text shown in one or more languages; an object must include `en`. */
export type LocalizedText = string | Record<string, string>

/** Manifest fields accepted from `plugin.yaml`, before the kernel resolves them. */
export interface PluginManifestSource {
  /** Must equal the directory name; the kernel refuses a mismatch. */
  id: string
  name: LocalizedText
  /** Kernel API range this plugin was built against, e.g. "^0.1". */
  apiVersion: string
  description: LocalizedText
  /** Known lucide name, e.g. "sparkles", or a plugin-relative image path. */
  icon?: string
  category?: ExtensionCategoryId
  permissions?: ExtensionPermission[]
  /** Service names this plugin requires; it stays waiting until each is provided. */
  inject?: string[]
  /** Service names this plugin provides to others. */
  provides?: string[]
  /** Enable on first sight when the hub has no recorded choice for it. */
  defaultEnabled: boolean
  /** Market display credit; the marketplace may supply a default instead. */
  author?: string
}

/** The declarations a package's `package.json` owns. */
export interface PluginPackageFile {
  version: string
  entry: string
}

/** Everything the loader needs: the manifest plus the package declarations. */
export interface PluginManifestFile extends PluginManifestSource, PluginPackageFile {}

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

const LOCALE_ID = /^[a-z]{2,8}(-[a-z0-9]{1,8})*$/

/** Whether a string is a locale id such as `en` or `zh-cn`. */
export function isLocaleId(value: string): boolean {
  return LOCALE_ID.test(value)
}

/**
 * Pick the text for one locale: exact match, then language, then `en`.
 *
 * @param value — a string or a table of localized strings.
 * @param locale — the reader's locale, e.g. `zh-CN`.
 * @returns the text to display.
 */
export function localized(value: LocalizedText, locale: string): string {
  if (typeof value === "string") return value
  const wanted = locale.toLowerCase()
  const exact = value[wanted]
  if (exact !== undefined) return exact
  const language = wanted.split("-")[0]!
  const prefix = value[language]
  if (prefix !== undefined) return prefix
  return value.en ?? ""
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`plugin manifest: "${field}" must be a non-empty string`)
  }
  return value
}

/** A field that may be one string or a locale table; a table must carry `en`. */
function requireLocalized(value: unknown, field: string): LocalizedText {
  if (typeof value === "string") return requireString(value, field)
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      `plugin manifest: "${field}" must be a non-empty string or a locale table`
    )
  }
  let english = false
  for (const [locale, message] of Object.entries(value)) {
    if (!isLocaleId(locale)) {
      throw new Error(`plugin manifest: "${field}.${locale}" is not a locale id`)
    }
    if (typeof message !== "string" || message.trim() === "") {
      throw new Error(`plugin manifest: "${field}.${locale}" must be a non-empty string`)
    }
    if (locale === "en") english = true
  }
  if (!english) throw new Error(`plugin manifest: "${field}" must include "en"`)
  return value as Record<string, string>
}

/**
 * Validate one `plugin.yaml` document, already parsed.
 *
 * @param value — the parsed YAML.
 * @param id — the directory name, which the manifest id must equal.
 * @returns the validated manifest, without the package declarations.
 * @throws {Error} when a required field is missing, or a value is unusable.
 */
export function parsePluginManifest(value: unknown, id: string): PluginManifestSource {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("plugin manifest: expected an object")
  }
  const file = value as Record<string, unknown>
  const manifestId = requireString(file.id, "id")
  if (manifestId !== id) {
    throw new Error(`plugin manifest: id "${manifestId}" does not match its directory "${id}"`)
  }
  if (file.version !== undefined) {
    throw new Error('plugin manifest: "version" belongs in package.json')
  }
  if (file.entry !== undefined) {
    throw new Error('plugin manifest: "entry" belongs in package.json\'s "main"')
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
    name: requireLocalized(file.name, "name"),
    apiVersion,
    description:
      file.description === undefined ? "" : requireLocalized(file.description, "description"),
    icon: typeof file.icon === "string" ? file.icon : undefined,
    category: (category as PluginManifestSource["category"]) ?? "source",
    permissions: permissions as ExtensionPermission[] | undefined,
    inject: Array.isArray(file.inject) ? (file.inject as string[]) : undefined,
    provides: Array.isArray(file.provides) ? (file.provides as string[]) : undefined,
    defaultEnabled: file.defaultEnabled === true,
    author: typeof file.author === "string" ? file.author : undefined,
  }
}

/**
 * Parse one `plugin.yaml` document.
 *
 * @param text — the file's bytes as text.
 * @param id — the directory name the manifest must match.
 * @returns the validated manifest.
 * @throws {Error} when the YAML does not parse, or a field is unusable.
 */
export function parsePluginManifestYaml(text: string, id: string): PluginManifestSource {
  let value: unknown
  try {
    value = load(text, { schema: CORE_SCHEMA })
  } catch (error) {
    throw new Error(`plugin manifest: not valid YAML: ${messageOf(error)}`, { cause: error })
  }
  return parsePluginManifest(value, id)
}

/**
 * Read the declarations a market install requires from `package.json`.
 *
 * @param value — the parsed package document.
 * @param id — the plugin id, for error messages.
 * @returns the version and entry; `main` defaults to `index.js`.
 * @throws {Error} when the document or a declared value is unusable.
 */
export function parsePluginPackage(value: unknown, id: string): PluginPackageFile {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`extension "${id}": package.json is not an object`)
  }
  const pkg = value as Record<string, unknown>
  if (typeof pkg.version !== "string" || pkg.version.trim() === "") {
    throw new Error(`extension "${id}": package.json version must be a non-empty string`)
  }
  if (pkg.main !== undefined && (typeof pkg.main !== "string" || pkg.main.trim() === "")) {
    throw new Error(`extension "${id}": package.json main must be a non-empty string`)
  }
  return {
    version: pkg.version,
    entry: (pkg.main as string | undefined) ?? DEFAULT_PLUGIN_ENTRY,
  }
}

/**
 * Read an installed package leniently: an older directory may declare neither
 * field, and that is not a reason to stop loading it.
 *
 * @param value — the parsed package document.
 * @param id — the plugin id, for error messages.
 * @returns the version and entry, with `0.0.0` / `index.js` for missing fields.
 * @throws {Error} when the document itself, or a present field, is unusable.
 */
export function readPluginPackage(value: unknown, id: string): PluginPackageFile {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`extension "${id}": package.json is not an object`)
  }
  const pkg = value as Record<string, unknown>
  if (
    pkg.version !== undefined &&
    (typeof pkg.version !== "string" || pkg.version.trim() === "")
  ) {
    throw new Error(`extension "${id}": package.json version must be a non-empty string`)
  }
  if (pkg.main !== undefined && (typeof pkg.main !== "string" || pkg.main.trim() === "")) {
    throw new Error(`extension "${id}": package.json main must be a non-empty string`)
  }
  return {
    version: (pkg.version as string | undefined) ?? "0.0.0",
    entry: (pkg.main as string | undefined) ?? DEFAULT_PLUGIN_ENTRY,
  }
}

/** Whether this kernel can load a manifest, by API range equality. */
export function isCompatible(apiVersion: string): boolean {
  return apiVersion.replace(/^[\^~]/, "") === EXTENSION_API_VERSION
}
