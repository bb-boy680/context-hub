/**
 * The extension contract: what a package declares, what it may contribute, and
 * what the kernel hands it on activation. Every form (web, desktop,
 * executable) shares these types, and nothing here reaches a platform API.
 */
import type { Context } from "@deepseek-ai/cordis"
import type { ComponentType } from "react"

import { EXTENSION_API_VERSION, isCompatible } from "@context-hub/core/extension-manifest"
import type {
  ExtensionCategoryId,
  ExtensionPermission,
} from "@context-hub/core/extension-manifest"

import type { SkillRegistry } from "./skill-registry.ts"

export { EXTENSION_API_VERSION, isCompatible }
export type { ExtensionCategoryId, ExtensionPermission }

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
   * (20, 30 …) so a contributed entry can be inserted between them.
   */
  order: number
}

/** One control contributed to the shell's header row. */
export interface HeaderContribution {
  /** The contributor's own id for this control; may repeat across plugins. */
  id: string
  /**
   * Sort rank inside the header; smaller comes first. Equal ranks keep the
   * catalog order `useContributions` returns.
   */
  order: number
  /**
   * Rendered with no props as a direct child of the header's flex row. The
   * component owns its size and spacing, including `shrink-0` when it must
   * not be squeezed by the breadcrumb.
   */
  Component: ComponentType
}

/**
 * One page contributed by an extension; a UI shell mounts it at its path.
 */
export interface RouteContribution {
  path: string
  /** Rendered without props; the page reads its own data through the kernel. */
  Component: ComponentType
}

/**
 * One section an extension adds to the settings page.
 *
 * The shell draws the heading and the card that holds the controls; the
 * component fills the card. The id is the page anchor a search result scrolls
 * to, so it has to be unique and must not reuse one of the shell's own anchors.
 */
export interface SettingsSectionContribution {
  /** Anchor the settings page scrolls to; lowercase, hyphenated, unique. */
  id: string
  /** Message key for the heading, resolved through `ctx.i18n` where it draws. */
  titleKey: string
  /** Message key for the sentence under the heading. */
  descriptionKey: string
  /** Rendered inside the section's card, with no props. */
  Component: ComponentType
}

/**
 * One row a module offers to the global search.
 *
 * A row is display data and an address, not an action: the palette renders it
 * and navigates to {@link path}, and the page it names decides what the query
 * means there.
 */
export interface SearchResult {
  /** Stable within the provider that returned it; what the list keys on. */
  id: string
  /** The row's own title, already worded for the locale it was read in. */
  title: string
  /** The sentence under the title; omitted when the row has nothing to add. */
  description?: string
  /** The row's own picture, as a URL; drawn before {@link icon}. */
  avatar?: string
  /** The row's own mark, drawn when it has no avatar. */
  icon?: ExtensionIcon
  /** The page the row opens, query and anchor included. */
  path: string
}

/**
 * One module's search function, offered to the shell's global search.
 *
 * Synchronous on purpose: every provider reads a shared in-memory library, and
 * a keystroke must not start I/O. A module that later needs a remote search can
 * take the query and answer from its own cache.
 */
export interface SearchContribution {
  /** Message key naming the module in the result list, resolved where it renders. */
  labelKey: string
  /** The mark drawn for a result that names neither an avatar nor an icon. */
  icon: ExtensionIcon
  /** Rows matching the text; an empty query is the palette's business, not the provider's. */
  search(query: string): SearchResult[]
  /**
   * Tells the palette the rows may have changed.
   *
   * Optional because a module whose data cannot move while the palette is open
   * has nothing to announce. A provider that does offer this lets a slow read —
   * an MCP probe, a client's own command line — land in a dialog already
   * showing.
   */
  subscribe?(listener: () => void): () => void
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
  /** One control in the shell's header row. */
  header: HeaderContribution
  /** A page. */
  route: RouteContribution
  /** One group of settings a plugin adds to the settings page. */
  settingsSection: SettingsSectionContribution
  /** One module's search function, for the global search palette. */
  search: SearchContribution
}

/** Contribution point ids the kernel indexes. */
export type ExtensionPointId = keyof ContributionMap

/** Contributions an extension ships as data, indexed by point id. */
export type DeclarativeContributions = {
  [P in ExtensionPointId]?: ContributionMap[P][]
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

/** Identity and presentation of one extension package, apart from its id. */
export interface ExtensionManifest {
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
  /** Service names this package publishes; a plugin may require them by name. */
  provides?: string[]
}

/**
 * One package in the catalog, as its own module declares it.
 *
 * The module is the unit of a plugin: `name` is its id, `manifest` is what the
 * catalog shows, `inject` names the services it needs, and `apply` registers
 * what it contributes. Reading the module is not running it, so the catalog can
 * list a package that is switched off.
 *
 * A plugin reads its services as properties of the context it is handed —
 * `ctx.skills.register(...)` — which is why `inject` is a declaration and not a
 * callback: every name it lists is on the context before `apply` runs.
 */
export interface ExtensionModule {
  /** Reverse-DNS style id, unique across the catalog, e.g. "hub.skill.catalog". */
  name: string
  /** Everything the catalog shows, apart from the id. */
  manifest: ExtensionManifest
  /** Service names this package requires; it stays waiting until each is there. */
  inject?: string[]
  /** Data contributions, loaded on every form; no code runs for these. */
  declarative?: DeclarativeContributions
  /** Register what this package contributes, for as long as it is enabled. */
  apply?: (ctx: Context) => void
}

/** One package as the kernel holds it: the module, with its id resolved. */
export interface ExtensionDefinition {
  module: ExtensionModule
  /** The module's manifest with its `name` filled in from the module's id. */
  manifest: ExtensionManifest & { id: string }
}
