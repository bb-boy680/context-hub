/**
 * The one service an agent plugin publishes into when it knows where an agent
 * keeps its skills: the directory inside a workspace, the directory outside
 * every workspace, or both.
 *
 * The skills module owns the page, the library and the loading; it does not
 * know a single agent directory. Each agent extension knows exactly one agent
 * and registers its places here, so adding an agent is a plugin — the skills
 * page has no list of agents to keep in step.
 *
 * A provider's id is the agent's own, the same one its `target` contribution
 * carries: the sidebar records the chosen agents by that id, and a place
 * outside every workspace is read only while its agent is chosen.
 */
import { Service } from "@deepseek-ai/cordis"
import type { Context } from "@deepseek-ai/cordis"

import type { AssetScope } from "@context-hub/core/place-files"
import type { ExtensionIcon } from "@context-hub/extensions"

/** The service name the skills module publishes and every agent plugin requires. */
export const SKILL_SERVICE = "skills"

/**
 * One place an agent keeps skills in: the directory itself, plus how the skills
 * module names it. The module reads that directory, lists its tab, and offers
 * it as an install target, so an agent integration declares data rather than
 * code inside the skills module.
 */
export interface SkillPlace {
  /** Stable id; the tab row's key and the target a row's install names. */
  readonly id: string
  /** Message key for the entry's label. */
  readonly labelKey: string
  readonly icon: ExtensionIcon
  /**
   * The root `dir` is read under: the workspace in use, or the home directory
   * every workspace shares.
   */
  readonly scope: AssetScope
  /** The directory inside that root, `/`-separated, e.g. ".claude/skills". */
  readonly dir: string
  /** Sort rank among the places of its own scope. */
  readonly order: number
}

/** One agent, as the skills module uses it: where that agent reads skills. */
export interface SkillProvider {
  /** The agent's id, e.g. "hub.target.claude-code". */
  readonly id: string
  /** Every place this agent keeps skills in. */
  readonly places: readonly SkillPlace[]
}

/** Where an agent extension registers the places it reads. */
export interface SkillProviderRegistry {
  providers(): readonly SkillProvider[]
  register(provider: SkillProvider): () => void
}

/**
 * The service this module publishes as {@link SKILL_SERVICE}.
 *
 * A class, not an interface with a factory, because registering has to belong to
 * whoever called it: `register` wraps itself in an effect on the context the
 * caller reached this service through, so the places come out when that agent
 * extension unloads. That only works while `register` is a prototype method —
 * as an arrow property it would close over this service's own context, and the
 * places would stay behind on every agent that was ever enabled.
 */
export class SkillService extends Service {
  private readonly held: SkillProvider[] = []

  constructor(ctx: Context) {
    super(ctx, SKILL_SERVICE)
  }

  /** Every provider registered right now, in registration order. */
  providers(): readonly SkillProvider[] {
    return this.held
  }

  /** Add one provider, for as long as the plugin that added it stays loaded. */
  register(provider: SkillProvider): () => void {
    this.held.push(provider)
    return this.ctx.effect(() => () => {
      const at = this.held.indexOf(provider)
      if (at >= 0) this.held.splice(at, 1)
    })
  }
}

/**
 * The places a set of providers makes readable.
 *
 * Every workspace-scope place is read: a workspace is a folder the hub was
 * pointed at, so its directories are a fact about it rather than a choice. A
 * machine-wide place belongs to one agent, so it is read only while `chosen`
 * names that agent — the choice is what says which of the machine's agents this
 * hub delivers to.
 *
 * @param providers — every registered provider.
 * @param chosen — the agents the sidebar chose, by provider id.
 * @returns the places to read, in the order their own extensions ask for.
 */
export function readablePlaces(
  providers: readonly SkillProvider[],
  chosen: readonly string[]
): SkillPlace[] {
  const places = providers.flatMap((provider) =>
    provider.places.filter(
      (place) => place.scope === "workspace" || chosen.includes(provider.id)
    )
  )
  return places.sort((left, right) => left.order - right.order)
}

/**
 * The service this module publishes, added to the kernel's map of services a
 * plugin may require.
 *
 * The module that publishes a service is the module that types it: a plugin
 * requiring `skills` reads `plugins.skills` with this type, and a name no
 * module declared is a name no plugin can inject.
 */
/* A plugin reads this as a property of the context it is handed, so it is
   declared on `Context` — the same place `host` and `i18n` are declared, and
   what makes `ctx.skills` resolve rather than only `ctx.get("skills")`. */
declare module "@deepseek-ai/cordis" {
  interface Context {
    /** This module's registry of agent places; see {@link SkillService}. */
    skills: SkillService
  }
}
