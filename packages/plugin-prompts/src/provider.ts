/**
 * The one service an agent plugin publishes into when it knows where an agent
 * takes a prompt: the directory a prompt is delivered to as a command, the
 * directory a generated rule goes in, and the instruction file a prompt can be
 * added to.
 *
 * The prompts module owns the page, the library and the four delivery actions;
 * it knows no agent's directories. Each agent extension knows exactly one agent
 * and registers its places here, so adding an agent is a plugin — the page has
 * no list of agents to keep in step, and a place that declares no instruction
 * file simply does not offer the action that writes one.
 *
 * These paths are the machine-readable ones. A target's `locations` are the
 * strings a catalog row prints; a place is what an action writes to, which is a
 * different answer and has to be checked before it is used.
 */
import type { AssetScope } from "@workspace/core/place-files"
import type { ExtensionIcon } from "@workspace/extensions"

/** The service name the prompts module publishes and every agent plugin requires. */
export const PROMPT_SERVICE = "prompts"

/**
 * One place an agent takes prompts in, declared as two directories and the file
 * beside them.
 *
 * A directory rather than a file: a prompt becomes its own file, named after the
 * prompt, and the name is only known once someone has written one. Both roots a
 * place can sit under are the client's roots — the workspace in use, and the
 * machine-wide one — so nothing here names an absolute path.
 */
export interface PromptPlace {
  /** Stable id; the row's key and the target a delivery names. */
  readonly id: string
  /** The agent's id, e.g. "hub.target.claude-code"; two places of one agent share it. */
  readonly agent: string
  /** Message key for the agent's name. */
  readonly labelKey: string
  readonly icon: ExtensionIcon
  /** The root both directories below are read under. */
  readonly scope: AssetScope
  /** Where a prompt is installed as a command, `/`-separated, e.g. ".claude/commands". */
  readonly commandDir: string
  /** Where a generated rule goes, e.g. ".claude/rules". */
  readonly ruleDir: string
  /**
   * The instruction file a prompt can be added to, relative to the same root.
   * Absent where the agent reads none: the action that writes one is then not
   * offered at all, rather than offered and failing.
   */
  readonly instructionFile?: string
  /** Sort rank among the places of its own scope. */
  readonly order: number
}

/** One agent, as the prompts module uses it: where that agent takes prompts. */
export interface PromptProvider {
  /** The agent's id, e.g. "hub.target.claude-code". */
  readonly id: string
  /** Every place this agent takes prompts in. */
  readonly places: readonly PromptPlace[]
}

/** Where an agent extension registers the places it takes prompts in. */
export interface PromptProviderRegistry {
  /** Every provider registered right now, in registration order. */
  providers(): readonly PromptProvider[]
  /**
   * Add one provider.
   *
   * @returns a disposer that takes it back out; a provider registered inside a
   * plugin's `inject` callback is disposed with that callback.
   */
  register(provider: PromptProvider): () => void
}

/** What the prompts module publishes as {@link PROMPT_SERVICE}. */
export interface PromptService {
  /** Where an agent extension registers the places it takes prompts in. */
  readonly registry: PromptProviderRegistry
}

/**
 * Every place the registered providers declare.
 *
 * All of them, in the order the agents registered: a place is where a delivery
 * can go, and which agents the sidebar is narrowed to says what this hub reads,
 * not what it may write to. So a machine-wide place is offered as soon as its
 * agent is enabled, the same way the install menus of the other asset kinds
 * list every client they can reach.
 */
export function promptPlaces(
  providers: readonly PromptProvider[]
): readonly PromptPlace[] {
  return providers
    .flatMap((provider) => provider.places)
    .slice()
    .sort((a, b) => a.scope.localeCompare(b.scope) || a.order - b.order)
}

/**
 * The service this module publishes, added to the kernel's map of services a
 * plugin may require.
 *
 * The module that publishes a service is the module that types it: a plugin
 * requiring `prompts` reads `plugins.prompts` with this type, and a name no
 * module declared is a name no plugin can inject.
 */
declare module "@workspace/extensions" {
  interface ExtensionServices {
    /** This module's registry of agent places; see {@link PromptService}. */
    prompts: PromptService
  }
}
