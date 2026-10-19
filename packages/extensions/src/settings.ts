/**
 * Hub settings: the preferences that belong to this machine rather than to any
 * one asset. They live in one state document so every page reads the same
 * values, and they are written the moment a control changes — there is no
 * save step anywhere in the UI. Plugins keep their own settings in the same
 * document, under a namespace the shell never interprets.
 *
 * Theme is deliberately absent: it is a browser preference applied before the
 * kernel starts, and it already lives in `localStorage` under `theme`.
 */
import { Service } from "./cordis.ts"
import type { Context } from "./cordis.ts"

import type { PlatformHost } from "./host.ts"

/** State document holding the preferences, under the hub home's state space. */
export const SETTINGS_DOCUMENT = "settings"

/** How an asset page opens: the card grid or the list table. */
export type LayoutMode = "grid" | "list"

/**
 * How a skill lands in an Agent's directory: link, copy, or let the filesystem
 * decide. `auto` is the historical behavior — link first, copy when the
 * filesystem cannot hold a link.
 */
export type InstallMode = "auto" | "link" | "copy"

/** Everything this hub remembers about how it should behave on this machine. */
export interface HubSettings {
  layout: LayoutMode
  installMode: InstallMode
  /** Download remote images into the hub's own asset directory as they arrive. */
  downloadRemoteImages: boolean
  /** URL of the extension market index; empty when no market is configured. */
  extensionMarketUrl: string
  /**
   * Values owned by plugins, keyed by the plugin's id. The shell treats each
   * value as opaque: whoever wrote it is the one that validates and reads it.
   */
  plugins: Record<string, unknown>
}

/** The fields the shell's own settings controls may replace. */
export type SettingsPatch = Partial<Omit<HubSettings, "plugins">>

/** What an untouched install behaves like. */
export const DEFAULT_SETTINGS: HubSettings = {
  layout: "grid",
  installMode: "auto",
  downloadRemoteImages: true,
  extensionMarketUrl: "",
  plugins: {},
}

/** The plugin-owned part of a stored document; anything else is not a namespace. */
function readPlugins(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {}
  return { ...(value as Record<string, unknown>) }
}

/**
 * Read a stored settings document, field by field. A hand-edited or older
 * document keeps every value it spells correctly and takes the default for
 * everything else; a value this build cannot read is never guessed at.
 *
 * @param value — the stored value, as the form read it.
 * @returns the settings it describes.
 */
export function readSettings(value: unknown): HubSettings {
  const record =
    typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {}
  return {
    layout: record.layout === "list" ? "list" : "grid",
    installMode:
      record.installMode === "link" || record.installMode === "copy"
        ? record.installMode
        : "auto",
    downloadRemoteImages:
      typeof record.downloadRemoteImages === "boolean"
        ? record.downloadRemoteImages
        : DEFAULT_SETTINGS.downloadRemoteImages,
    extensionMarketUrl:
      typeof record.extensionMarketUrl === "string"
        ? record.extensionMarketUrl
        : DEFAULT_SETTINGS.extensionMarketUrl,
    plugins: readPlugins(record.plugins),
  }
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    settings: SettingsService
  }
  interface Events {
    /** One or more settings changed; the argument is the complete new state. */
    "settings/change"(state: HubSettings): void
  }
}

/** The settings every page reads; changes are written back as they happen. */
export class SettingsService extends Service {
  static inject = ["host"]

  private readonly host: PlatformHost
  private current: HubSettings

  constructor(ctx: Context) {
    super(ctx, "settings")
    const host = ctx.get("host")
    if (host === undefined) throw new Error("settings: host service unavailable")
    this.host = host
    this.current = readSettings(host.storage.read(SETTINGS_DOCUMENT))
  }

  /** The complete settings, stable between changes. */
  get state(): HubSettings {
    return this.current
  }

  /**
   * Replace some fields. A patch that changes nothing writes nothing and
   * announces nothing, so a control can call this from every render without
   * turning into a write loop.
   */
  set(patch: SettingsPatch): void {
    const next = readSettings({ ...this.current, ...patch })
    if (
      next.layout === this.current.layout &&
      next.installMode === this.current.installMode &&
      next.downloadRemoteImages === this.current.downloadRemoteImages &&
      next.extensionMarketUrl === this.current.extensionMarketUrl
    ) {
      return
    }
    this.current = next
    this.host.storage.write(SETTINGS_DOCUMENT, next)
    this.ctx.emit("settings/change", next)
  }

  /** One plugin's value, or `undefined` when that plugin never wrote one. */
  plugin(id: string): unknown {
    return this.current.plugins[id]
  }

  /**
   * Replace one plugin's value. Plugins own their namespaces: the shell stores
   * whatever they hand over and never interprets it. A write that changes
   * nothing is dropped the same way a no-op `set` is.
   */
  setPlugin(id: string, value: unknown): void {
    if (JSON.stringify(this.current.plugins[id]) === JSON.stringify(value)) return
    const next: HubSettings = {
      ...this.current,
      plugins: { ...this.current.plugins, [id]: value },
    }
    this.current = next
    this.host.storage.write(SETTINGS_DOCUMENT, next)
    this.ctx.emit("settings/change", next)
  }
}
