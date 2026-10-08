/**
 * `ctx.i18n` (I18nService): active locale and message lookup. Language packs
 * arrive through the extension point, so installing one is the whole feature;
 * the kernel keeps `en` as the locked fallback table.
 */
import { Service } from "./cordis.ts"
import type { Context } from "./cordis.ts"

import type { PlatformHost } from "./host.ts"
import type { ExtensionService } from "./service.ts"
import type { LocaleContribution } from "./types.ts"

/** State document holding the active locale id, under the hub home's state space. */
const LOCALE_DOCUMENT = "locale"

/** Fallback locale id; the kernel locks this pack so the lookup chain always terminates. */
const FALLBACK_LOCALE = "en"

/** One selectable language as the UI reads it. */
export interface LocaleDefinition {
  id: string
  label: string
}

/** Immutable locale state published on every change. */
export interface I18nState {
  active: string
  locales: LocaleDefinition[]
  revision: number
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    i18n: I18nService
  }
  interface Events {
    /** The active locale or the selectable set changed. */
    "i18n/change"(state: I18nState): void
  }
}

export class I18nService extends Service {
  static inject = ["extensions", "host"]

  private readonly host: PlatformHost
  private readonly extensions: ExtensionService
  private active: string
  private table = new Map<string, string>()
  private revision = 0
  private cached!: I18nState

  constructor(ctx: Context) {
    super(ctx, "i18n")
    const host = ctx.get("host")
    const extensions = ctx.get("extensions")
    if (host === undefined) throw new Error("i18n: host service unavailable")
    if (extensions === undefined) throw new Error("i18n: extension service unavailable")
    this.host = host
    this.extensions = extensions
    const stored = host.storage.read(LOCALE_DOCUMENT)
    this.active = typeof stored === "string" ? stored : FALLBACK_LOCALE
    ctx.on("extensions/changed", () => this.refresh())
    this.refresh()
  }

  /** Current locale state; stable between changes. */
  get state(): I18nState {
    return this.cached
  }

  /** Translate one key through the active table, falling back to `en`, then to the key. */
  t(key: string): string {
    return this.table.get(key) ?? key
  }

  /** Switch the active locale; unknown or disabled ids are ignored. */
  setLocale(id: string): void {
    if (id === this.active) return
    if (!this.cached.locales.some((locale) => locale.id === id)) return
    this.active = id
    this.host.storage.write(LOCALE_DOCUMENT, id)
    this.refresh()
  }

  private refresh(): void {
    const packs = this.packs()
    const locales: LocaleDefinition[] = []
    for (const pack of packs) {
      if (locales.some((locale) => locale.id === pack.id)) continue
      locales.push({ id: pack.id, label: pack.label })
    }
    if (!locales.some((locale) => locale.id === this.active)) {
      this.active = FALLBACK_LOCALE
      this.host.storage.write(LOCALE_DOCUMENT, this.active)
    }
    this.table = this.buildTable(packs)
    this.revision += 1
    this.cached = { active: this.active, locales, revision: this.revision }
    this.ctx.emit("i18n/change", this.cached)
  }

  private packs(): LocaleContribution[] {
    return this.extensions.contributions("locale")
  }

  /**
   * Merge the fallback locale first and the active locale over it, so a key
   * the active pack omits keeps its English text. Every pack of a locale is
   * merged in catalog order, because the kernel and each extension ship their
   * own namespace defaults under the same locale id.
   */
  private buildTable(packs: LocaleContribution[]): Map<string, string> {
    const table = new Map<string, string>()
    const merge = (locale: string) => {
      for (const pack of packs) {
        if (pack.id !== locale) continue
        for (const [key, value] of Object.entries(pack.messages)) table.set(key, value)
      }
    }
    merge(FALLBACK_LOCALE)
    if (this.active !== FALLBACK_LOCALE) merge(this.active)
    return table
  }
}
