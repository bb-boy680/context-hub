/**
 * Icon names a disk manifest can carry. A manifest is JSON, so it cannot hold a
 * component; it names one instead, and the loader resolves it here. Names are
 * the kebab-case form of the icon's export, e.g. "shield-check" for
 * `ShieldCheck`, and an unknown name falls back to the puzzle rather than
 * failing the plugin.
 */
import {
  ActivityIcon,
  BlocksIcon,
  BoxIcon,
  DownloadIcon,
  GlobeIcon,
  LanguagesIcon,
  LayoutGridIcon,
  PackageIcon,
  PlugIcon,
  PuzzleIcon,
  ServerIcon,
  ShieldIcon,
  SparklesIcon,
  StoreIcon,
  type LucideIcon,
} from "lucide-react"

/** Icons a manifest may name, by their kebab-case name. */
export const PLUGIN_ICONS: Record<string, LucideIcon> = {
  "activity": ActivityIcon,
  "blocks": BlocksIcon,
  "box": BoxIcon,
  "download": DownloadIcon,
  "globe": GlobeIcon,
  "languages": LanguagesIcon,
  "layout-grid": LayoutGridIcon,
  "package": PackageIcon,
  "plug": PlugIcon,
  "server": ServerIcon,
  "shield": ShieldIcon,
  "sparkles": SparklesIcon,
  "store": StoreIcon,
}

/** Icon shown for a manifest that names none, or names one this build lacks. */
export const FALLBACK_PLUGIN_ICON = PuzzleIcon

/**
 * Resolve a manifest's icon name.
 *
 * @param name — the kebab-case icon name, when the manifest carries one.
 * @returns the icon component, or the fallback.
 */
export function resolvePluginIcon(name: string | undefined): LucideIcon {
  if (name === undefined) return FALLBACK_PLUGIN_ICON
  return PLUGIN_ICONS[name] ?? FALLBACK_PLUGIN_ICON
}
