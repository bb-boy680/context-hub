/**
 * The extension contract: what a package declares, what it may contribute, and
 * what the kernel hands it on activation. Every form (web, desktop,
 * executable) shares these types, and nothing here reaches a platform API.
 */
import type { Context } from "@deepseek-ai/cordis"
import type { ComponentType } from "react"

import type { PlatformHost } from "./host.ts"
import type { I18nService } from "./i18n.ts"
import type { SkillRegistry } from "./skill-registry.ts"

/** Extension API this kernel implements; manifests declare the range they were built for. */
export const EXTENSION_API_VERSION = "0.1"

/**
 * An icon an extension contributes. It is a component rather than a name, so a
 * contributor decides what a mark is: a lucide icon, a brand mark from another
 * package, an `<img>` of its own, or an inline `<svg>`. The shell renders one
 * with a class and no other props, inside a box it sizes — so a mark should
 * take `className`, and one that ignores it should fill its box instead. The
 * `aria-hidden` is here because a brand mark carries its own title, which would
 * otherwise be read twice beside the label naming the same thing.
 */
export type ExtensionIcon = ComponentType<{
  className?: string
  "aria-hidden"?: boolean
}>

/** Whether loading the extension requires running its code. */
export type ExtensionKind = "builtin" | "declarative" | "code"

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

/** One selectable UI language contributed by a language pack. */
export interface LocaleContribution {
  /** BCP 47-style id, e.g. "zh-CN"; the kernel falls back to `en` for missing keys. */
  id: string
  /** Display name written in the represented language. */
  label: string
  /** Flat message table: key to template string. */
  messages: Record<string, string>
}

/** Asset kinds an agent target can receive. */
export type AgentAssetKind = "skill" | "mcp" | "memory" | "hook"

/** One location an agent reads injected assets from. */
export interface AgentTargetLocation {
  /** What the path holds, e.g. "Skills". */
  label: string
  /** Display-ready path template, e.g. "~/.claude/skills/<name>/SKILL.md". */
  path: string
}

/** How one coding agent consumes Context Hub assets. */
export interface AgentTargetDescriptor {
  /** Stable id, matched against the contributing manifest id. */
  id: string
  displayName: string
  icon: ExtensionIcon
  /** Asset kinds this target accepts. */
  supports: AgentAssetKind[]
  /** Paths the target reads. */
  locations: AgentTargetLocation[]
  /** Serialized format the target expects, as a display-ready note. */
  format: string
}

/** Sidebar groups the shell renders, in order. */
export type NavGroupId = "assets" | "operate"

/** One sidebar entry contributed by an extension. */
export interface NavContribution {
  /** Route path, e.g. "/skills". */
  path: string
  /** Message key resolved through `ctx.i18n` where the entry renders. */
  labelKey: string
  icon: ExtensionIcon
  group: NavGroupId
  /**
   * Sort rank inside the group; the shell leaves gaps between its own entries
   * (10, 20, 30 …) so a contributed entry can be inserted between them.
   */
  order: number
}

/**
 * One page contributed by an extension; a UI shell mounts it at its path.
 */
export interface RouteContribution {
  path: string
  /** Rendered without props; the page reads its own data through the kernel. */
  Component: ComponentType
}

/** One contribution type per point id; a point indexes every value contributed to it. */
export interface ContributionMap {
  /** A selectable UI language. */
  locale: LocaleContribution
  /** One coding agent's consumption contract. */
  target: AgentTargetDescriptor
  /** One searchable remote skill catalog. */
  skillRegistry: SkillRegistry
  /** A sidebar entry. */
  nav: NavContribution
  /** A page. */
  route: RouteContribution
}

/** Contribution point ids the kernel indexes. */
export type ExtensionPointId = keyof ContributionMap

/** Contributions an extension ships as data, indexed by point id. */
export type DeclarativeContributions = {
  [P in ExtensionPointId]?: ContributionMap[P][]
}

/** What the kernel hands an extension's `activate`. */
export interface ExtensionScope {
  /** The extension's own Cordis context; its services and effects unwind on disable. */
  readonly ctx: Context
  /** Form capabilities and persistence; extensions never touch platform APIs directly. */
  readonly host: PlatformHost
  /**
   * The kernel's translation service. A component rendered later cannot read it
   * off {@link ctx}: a fiber's injected services resolve while `activate` runs,
   * so take what you need to render with now.
   */
  readonly i18n?: I18nService
  /** Register one contribution; removed automatically when the extension is disabled. */
  contribute<P extends ExtensionPointId>(point: P, value: ContributionMap[P]): void
  /**
   * Publish an API under a service name, for other extensions to require.
   *
   * The name must be declared in {@link ExtensionManifest.provides}, so a
   * dependency a person could satisfy is discoverable from the catalog rather
   * than only from a throw. What is published lives as long as this extension
   * is enabled, and an extension that required it unloads when this one is
   * disabled.
   *
   * @throws when another enabled extension already provides that name.
   */
  provide(name: string, api: unknown): void
  /**
   * Run `setup` once the named services are all provided, with a context that
   * has them and a map of the services themselves; unwind it again when one of
   * them goes away.
   *
   * This is how one plugin uses another's API without knowing which extension
   * supplies it, and without either being loaded first: the callback is simply
   * not called until the dependency exists. `services` is keyed by the names
   * asked for, so a plugin reads `services.mcp` rather than reaching for a
   * property of the context — see {@link ExtensionServices}.
   */
  inject<N extends keyof ExtensionServices & string>(
    names: readonly N[],
    setup: (ctx: Context, services: Pick<ExtensionServices, N>) => void
  ): void
}

/**
 * The services a plugin may require, by name.
 *
 * Merge-extensible: the module that publishes a service is the module that
 * types it, so a plugin that requires that name reads it with its own type, and
 * a name no module declared cannot be asked for at all.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the kernel ships no service of its own; every entry is merged in by the module that publishes one.
export interface ExtensionServices {}

/** Identity and presentation of one extension package. */
export interface ExtensionManifest {
  /** Reverse-DNS style id, unique across the catalog, e.g. "hub.locale.zh-CN". */
  id: string
  /** Catalog name, authored in the language the package chooses. */
  name: string
  version: string
  /** Extension API range this package was built against, e.g. "^0.1". */
  apiVersion: string
  kind: ExtensionKind
  category: ExtensionCategoryId
  description: string
  icon: ExtensionIcon
  /** The kernel enables this extension on first launch. */
  defaultEnabled?: boolean
  /** The kernel never disables this extension, so the UI offers no switch. */
  locked?: boolean
  permissions?: ExtensionPermission[]
  /** Cordis service names this extension provides; other extensions may require them. */
  provides?: string[]
  /**
   * Cordis service names this extension requires. It stays `waiting` until
   * every one is provided, and unloads again when one is disabled.
   */
  inject?: string[]
}

/** One package in the catalog. */
export interface ExtensionDefinition {
  manifest: ExtensionManifest
  /** Data contributions loaded on every form; no extension code runs for these. */
  declarative?: DeclarativeContributions
  /** Code activation for forms that run extension code; registrations unwind on disable. */
  activate?: (scope: ExtensionScope) => void
}

/** Whether this kernel can load a manifest, by API range equality. */
export function isCompatible(apiVersion: string): boolean {
  return apiVersion.replace(/^[\^~]/, "") === EXTENSION_API_VERSION
}
