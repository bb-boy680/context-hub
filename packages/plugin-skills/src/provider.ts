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
import type { AssetScope } from "@workspace/core/place-files"
import type { ExtensionIcon } from "@workspace/extensions"

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
  /** Every provider registered right now, in registration order. */
  providers(): readonly SkillProvider[]
  /**
   * Add one provider.
   *
   * @returns a disposer that takes it back out; a provider registered inside a
   * plugin's `inject` callback is disposed with that callback.
   */
  register(provider: SkillProvider): () => void
}

/** What the skills module publishes as {@link SKILL_SERVICE}. */
export interface SkillService {
  /** Where an agent extension registers the places it reads. */
  readonly registry: SkillProviderRegistry
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
declare module "@workspace/extensions" {
  interface ExtensionServices {
    /** This module's registry of agent places; see {@link SkillService}. */
    skills: SkillService
  }
}
