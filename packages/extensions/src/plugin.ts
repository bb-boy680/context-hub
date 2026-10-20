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

import {
  isCompatible,
  parsePluginManifest,
  parsePluginManifestYaml,
  readPluginPackage,
  type PluginManifestFile,
} from "@context-hub/core/extension-manifest"
import { DEFAULT_PLUGIN_ENTRY, PLUGIN_MANIFEST } from "@context-hub/core/plugins"

import { PLUGIN_ICONS, resolvePluginIcon } from "./icons.ts"
import type { ExtensionIcon, ExtensionManifest, ExtensionModule } from "./types.ts"

export { parsePluginManifest, parsePluginManifestYaml }
export type { PluginManifestFile }

/** One plugin found on disk, and whether the kernel can load it. */
export interface DiscoveredPlugin {
  id: string
  module?: ExtensionModule
  /** Why this plugin is not loadable; present instead of `module`. */
  problem?: string
}

/** What a plugin's entry module must export. */
export interface PluginModule {
  apply(scope: PluginScope): void
}

/**
 * The scope a disk plugin's `apply` receives: the kernel's own scope plus
 * what a module that imports nothing still needs — React, the icon table (a
 * contribution carries a component, not a name), and the form's UI kit.
 *
 * Anything else a plugin would have imported arrives as a service instead: the
 * MCP toolkit, for instance, rides on the `mcp` service, which a provider
 * requires anyway. Installing a plugin is copying a directory; there is no
 * package resolution to lean on.
 */
export interface PluginScope {
  react: typeof React
  /** Icons a manifest may name, by kebab-case name. */
  icons: typeof PLUGIN_ICONS
  /** Resolve an icon name, falling back when this build lacks it. */
  icon(name: string): LucideIcon
  /** Component kit the form supplies as the `hub.ui` service. */
  ui: unknown
}

/** Read one plugin directory's manifest, never leaving the directory. */
async function readManifest(
  source: { read(id: string, file: string): Promise<string> },
  id: string
): Promise<PluginManifestFile> {
  const manifest = parsePluginManifestYaml(
    await source.read(id, PLUGIN_MANIFEST),
    id
  )
  const raw = await source.read(id, "package.json").catch(() => null)
  if (raw === null) {
    return { ...manifest, version: "0.0.0", entry: DEFAULT_PLUGIN_ENTRY }
  }
  let value: unknown
  try {
    value = JSON.parse(raw) as unknown
  } catch {
    throw new Error(`extension "${id}": package.json is not JSON`)
  }
  return { ...manifest, ...readPluginPackage(value, id) }
}

/** Image extensions a manifest may point at, relative to the plugin directory. */
const IMAGE_ICON = /\.(?:svg|png|jpe?g|webp)$/i

/** Whether a manifest icon is a safe plugin-relative image path. */
function isImagePath(value: string): boolean {
  if (value.startsWith("/") || value.includes("\\")) return false
  const segments = value.split("/")
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return false
  }
  return segments.length > 1 || IMAGE_ICON.test(value)
}

/**
 * Resolve the icon a manifest names.
 *
 * A known lucide name is the historical form; a plugin-relative image path is
 * served from the extension space, the same way its entry module is. Anything
 * else falls back to the puzzle instead of failing the plugin.
 */
function manifestIcon(name: string | undefined, route: string, id: string): ExtensionIcon {
  if (name !== undefined && Object.hasOwn(PLUGIN_ICONS, name)) {
    return resolvePluginIcon(name)
  }
  if (name !== undefined && isImagePath(name)) {
    const src = `${route}/${encodeURIComponent(id)}/${name
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`
    return ({ className, "aria-hidden": ariaHidden }) =>
      React.createElement("img", {
        src,
        alt: "",
        "aria-hidden": ariaHidden,
        className,
      })
  }
  return resolvePluginIcon(name)
}

/** The catalog manifest for one package, before the kernel adds its id. */
function manifestOf(
  manifest: PluginManifestFile,
  route: string,
  id: string
): ExtensionManifest {
  return {
    name: manifest.name,
    version: manifest.version,
    engines: manifest.engines,
    kind: "code",
    category: manifest.category ?? "source",
    description: manifest.description,
    icon: manifestIcon(manifest.icon, route, id),
    defaultEnabled: manifest.defaultEnabled,
    permissions: manifest.permissions,
    provides: manifest.provides,
  }
}

/**
 * Discover every installed plugin and build its kernel definition.
 *
 * A plugin that cannot be loaded is reported with its reason and left out of
 * the catalog, so one broken download never keeps the hub from starting. A
 * plugin whose `engines` this build does not satisfy is the exception: its row
 * stays, marked incompatible, but its entry module is never imported.
 *
 * @param options.source — the plugin space to read.
 * @param options.importModule — loads one entry module by the URL the source implies.
 * @param options.hubVersion — the running Context Hub version.
 * @param options.route — route the source serves extension files on; defaults to `/hub/extensions`.
 * @returns the loadable extensions, and one entry per plugin that could not be loaded.
 */
export async function discoverPlugins(options: {
  source: { list(): Promise<string[]>; read(id: string, file: string): Promise<string> }
  importModule(url: string): Promise<unknown>
  hubVersion: string
  route?: string
  /** When given, only these ids are read; the source can still list all of them. */
  ids?: readonly string[]
}): Promise<DiscoveredPlugin[]> {
  const route = options.route ?? "/hub/extensions"
  const found: DiscoveredPlugin[] = []
  for (const id of options.ids ?? (await options.source.list())) {
    try {
      const manifest = await readManifest(options.source, id)
      const catalog = manifestOf(manifest, route, id)
      if (!isCompatible(manifest.engines, options.hubVersion)) {
        /* The row has to be visible and removable without running anything. */
        found.push({
          id,
          module: {
            name: manifest.id,
            manifest: catalog,
            inject: manifest.inject,
            stored: true,
          },
        })
        continue
      }
      const entry = manifest.entry
      const module = (await options.importModule(
        `${route}/${encodeURIComponent(id)}/${entry}`
      )) as { apply?: unknown; default?: { apply?: unknown } }
      const apply = module.apply ?? module.default?.apply
      if (typeof apply !== "function") {
        throw new Error("plugin entry module must export an apply function")
      }
      found.push({
        id,
        module: {
          name: manifest.id,
          manifest: catalog,
          inject: manifest.inject,
          stored: true,
          apply: (ctx) => {
            /* React, icons, and the UI kit travel with the context: a plugin
               module imports nothing.

               Built first, then hung behind the context, rather than spread from
               it. A Cordis context is a proxy: spreading one copies its own
               properties only — `root`, `fiber`, `reflect` and the like — and the
               services it resolves are not among them, so a plugin reading
               `ctx.mcp` would find nothing. Assigning onto something that already
               has the context behind it does not work either, because the write
               reaches the proxy's own guard. Own properties first, prototype
               second, keeps every name the fiber declared. */
            const scope: Record<string, unknown> = {
              react: React,
              icons: PLUGIN_ICONS,
              icon: resolvePluginIcon,
              ui: ctx.get("hub.ui"),
            }
            Object.setPrototypeOf(scope, ctx)
            ;(apply as (value: unknown) => void)(scope)
          },
        },
      })
    } catch (error) {
      found.push({ id, problem: error instanceof Error ? error.message : String(error) })
    }
  }
  return found
}
