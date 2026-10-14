/**
 * Installed plugins: the manifest a plugin directory carries, and the loader
 * that turns one into a kernel extension. A manifest is JSON because it was
 * written by whoever built the plugin — possibly downloaded from a marketplace
 * — so every field is validated here, and the values the kernel needs as code
 * (the icon, the entry module) are resolved rather than trusted.
 *
 * The entry module is imported through a channel the form supplies: a browser
 * form imports the file the host serves, while a Node form imports the file
 * from disk. Plugins are self-contained modules: they receive React and the UI
 * kit from the kernel instead of importing packages, so one copy of each runs.
 */
import * as React from "react"
import type { LucideIcon } from "lucide-react"

import { PLUGIN_ICONS, resolvePluginIcon } from "./icons.ts"
import {
  isCompatible,
  type ExtensionDefinition,
  type ExtensionPermission,
  type ExtensionScope,
} from "./types.ts"

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
  /** Module file inside the plugin directory that exports `activate`; defaults to index.js. */
  entry?: string
  category?: "agent" | "asset" | "integration" | "language" | "appearance" | "source" | "storage"
  permissions?: ExtensionPermission[]
  /** Service names this plugin requires; it stays waiting until each is provided. */
  inject?: string[]
  /** Service names this plugin provides to others. */
  provides?: string[]
  /** Enable on first sight when the hub has no recorded choice for it. */
  defaultEnabled?: boolean
}

/** One plugin found on disk, and whether the kernel can load it. */
export interface DiscoveredPlugin {
  id: string
  definition?: ExtensionDefinition
  /** Why this plugin is not loadable; present instead of `definition`. */
  problem?: string
}

/** What a plugin's entry module must export. */
export interface PluginModule {
  activate(scope: PluginScope): void
}

/**
 * The scope a disk plugin's `activate` receives: the kernel's own scope plus
 * what a module that imports nothing still needs — React, the icon table (a
 * contribution carries a component, not a name), and the form's UI kit.
 *
 * Anything else a plugin would have imported arrives as a service instead: the
 * MCP toolkit, for instance, rides on the `mcp` service, which a provider
 * requires anyway. Installing a plugin is copying a directory; there is no
 * package resolution to lean on.
 */
export interface PluginScope extends ExtensionScope {
  react: typeof React
  /** Icons a manifest may name, by kebab-case name. */
  icons: typeof PLUGIN_ICONS
  /** Resolve an icon name, falling back when this build lacks it. */
  icon(name: string): LucideIcon
  /** Component kit the form supplies as the `hub.ui` service. */
  ui: unknown
}

const PERMISSIONS: readonly ExtensionPermission[] = [
  "storage.self",
  "assets.read",
  "assets.write",
  "filesystem",
  "network",
]

const CATEGORIES = ["agent", "asset", "integration", "language", "appearance", "source", "storage"] as const

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
    if (!Array.isArray(permissions) || !permissions.every((item) => PERMISSIONS.includes(item as ExtensionPermission))) {
      throw new Error("plugin manifest: permissions must list known permissions")
    }
  }
  const category = file.category
  if (category !== undefined && !CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
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

/** Read one plugin directory's manifest, never leaving the directory. */
async function readManifest(
  source: { read(id: string, file: string): Promise<string> },
  id: string
): Promise<PluginManifestFile> {
  return parsePluginManifest(JSON.parse(await source.read(id, "plugin.json")) as unknown, id)
}

/**
 * Discover every installed plugin and build its kernel definition.
 *
 * A plugin that cannot be loaded is reported with its reason and left out of
 * the catalog, so one broken download never keeps the hub from starting.
 *
 * @param options.source — the plugin space to read.
 * @param options.importModule — loads one entry module by the URL the source implies.
 * @param options.route — route the source serves extension files on; defaults to `/hub/extensions`.
 * @returns the loadable extensions, and one entry per plugin that could not be loaded.
 */
export async function discoverPlugins(options: {
  source: { list(): Promise<string[]>; read(id: string, file: string): Promise<string> }
  importModule(url: string): Promise<unknown>
  route?: string
}): Promise<DiscoveredPlugin[]> {
  const route = options.route ?? "/hub/extensions"
  const found: DiscoveredPlugin[] = []
  for (const id of await options.source.list()) {
    try {
      const manifest = await readManifest(options.source, id)
      const entry = manifest.entry ?? "index.js"
      const module = (await options.importModule(
        `${route}/${encodeURIComponent(id)}/${entry}`
      )) as { activate?: unknown; default?: { activate?: unknown } }
      const activate = module.activate ?? module.default?.activate
      if (typeof activate !== "function") {
        throw new Error("plugin entry module must export an activate function")
      }
      found.push({
        id,
        definition: {
          manifest: {
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            apiVersion: manifest.apiVersion,
            kind: "code",
            category: manifest.category ?? "source",
            description: manifest.description ?? "",
            icon: resolvePluginIcon(manifest.icon),
            defaultEnabled: manifest.defaultEnabled,
            permissions: manifest.permissions,
            inject: manifest.inject,
            provides: manifest.provides,
          },
          activate: (scope: ExtensionScope) => {
            /* React, icons, and the UI kit travel on the scope: a plugin module imports nothing. */
            ;(activate as (value: unknown) => void)({
              ...scope,
              react: React,
              icons: PLUGIN_ICONS,
              icon: resolvePluginIcon,
              ui: scope.ctx.get("hub.ui"),
            })
          },
        },
      })
    } catch (error) {
      found.push({ id, problem: error instanceof Error ? error.message : String(error) })
    }
  }
  return found
}
