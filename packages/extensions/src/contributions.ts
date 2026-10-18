/**
 * The contribution points, as services.
 *
 * A contribution is data for the screen — a navigation entry, a header
 * control, a page, a language pack — as opposed to a service, which carries
 * behaviour another plugin calls. Each point is its own service so that
 * contributing to one is the same act as registering into a module:
 * `ctx.nav.register(entry)` from the plugin's `apply`, with nothing else to
 * remember.
 *
 * The point is where the lifetime comes from. `register` wraps itself in an
 * effect on the context it was called through, so what it added comes out when
 * the contributing plugin unloads. That context is the contributor's own — the
 * value of `ctx` here is whatever context the caller reached the service
 * through, which is how a point can say who registered what without being told.
 */
import { Service } from "./cordis.ts"
import type { Context } from "./cordis.ts"
import type { SkillRegistry } from "./skill-registry.ts"
import type {
  AgentTargetDescriptor,
  ContributionMap,
  ExtensionPointId,
  HeaderContribution,
  LocaleContribution,
  NavContribution,
  RouteContribution,
  SearchContribution,
  SettingsSectionContribution,
} from "./types.ts"

/** One contributed value, with the plugin that contributed it. */
export interface Placement<T> {
  /** The id of the plugin whose `apply` registered it. */
  readonly owner: string
  readonly value: T
}

/**
 * One contribution point.
 *
 * Extending `Service` is what makes the caller's context available, and the
 * caller's context is what makes the contribution belong to the plugin that
 * made it. `register` has to stay a prototype method for that reason: an arrow
 * property would close over the service's own context, and everything would
 * keep working except that nothing would ever be taken back out.
 */
export class ContributionPoint<T> extends Service {
  private readonly held: Placement<T>[] = []

  constructor(ctx: Context, name: string) {
    super(ctx, name)
  }

  /** Add one value, for as long as the plugin that added it stays loaded. */
  register(value: T): () => void {
    const owner = this.ctx.fiber?.name ?? "root"
    const placement: Placement<T> = { owner, value }
    this.held.push(placement)
    return this.ctx.effect(() => () => {
      const at = this.held.indexOf(placement)
      if (at >= 0) this.held.splice(at, 1)
    })
  }

  /**
   * Everything contributed right now, in registration order.
   *
   * The catalog reorders this: see `ExtensionService.contributions`, which reads
   * the same list in the order the build composed the plugins so a list does not
   * move its rows every time one is switched on.
   */
  placements(): readonly Placement<T>[] {
    return this.held
  }
}

/** The service each point is published under. */
export const POINT_SERVICES: Readonly<Record<ExtensionPointId, string>> = {
  nav: "nav",
  header: "header",
  route: "routes",
  locale: "locales",
  target: "targets",
  skillRegistry: "skillRegistries",
  settingsSection: "settingsSections",
  search: "search",
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    /** Sidebar entries the shell renders, in the order their own `order` field asks for. */
    nav: ContributionPoint<NavContribution>
    /** Controls the shell renders in its header, in their own `order`. */
    header: ContributionPoint<HeaderContribution>
    /** Pages the shell mounts at their paths. */
    routes: ContributionPoint<RouteContribution>
    /** Settings groups plugins add to the settings page. */
    settingsSections: ContributionPoint<SettingsSectionContribution>
    /** Language packs a person can switch to. */
    locales: ContributionPoint<LocaleContribution>
    /** One coding agent's consumption contract, for the sidebar and the catalog. */
    targets: ContributionPoint<AgentTargetDescriptor>
    /** Remote skill catalogs a search dialog can ask. */
    skillRegistries: ContributionPoint<SkillRegistry>
    /** Each module's search function, collected by the global search palette. */
    search: ContributionPoint<SearchContribution>
  }
}

/**
 * Publish every point on one context.
 *
 * Called once, before any plugin is mounted, so a plugin's `apply` can reach the
 * points it declares in its own `inject`.
 */
export function createContributionPoints(ctx: Context): void {
  new ContributionPoint<NavContribution>(ctx, POINT_SERVICES.nav)
  new ContributionPoint<HeaderContribution>(ctx, POINT_SERVICES.header)
  new ContributionPoint<RouteContribution>(ctx, POINT_SERVICES.route)
  new ContributionPoint<SettingsSectionContribution>(ctx, POINT_SERVICES.settingsSection)
  new ContributionPoint<LocaleContribution>(ctx, POINT_SERVICES.locale)
  new ContributionPoint<AgentTargetDescriptor>(ctx, POINT_SERVICES.target)
  new ContributionPoint<SkillRegistry>(ctx, POINT_SERVICES.skillRegistry)
  new ContributionPoint<SearchContribution>(ctx, POINT_SERVICES.search)
}

/** The value type of one point, for a caller that has only the point id. */
export type PointValue<P extends ExtensionPointId> = ContributionMap[P]
