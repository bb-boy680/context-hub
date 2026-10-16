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
import { Service } from "@deepseek-ai/cordis"
import type { Context } from "@deepseek-ai/cordis"

import type { AssetScope } from "@context-hub/core/place-files"
import type { ExtensionIcon } from "@context-hub/extensions"

/** The service name the prompts module publishes and every agent plugin requires. */
export const PROMPT_SERVICE = "prompts"

/**
 * One file a prompt can be added to as a marked section.
 *
 * The file belongs to whoever writes in it, so nothing here ever replaces it:
 * the section goes in under a marker of this hub's own, and a second delivery
 * of the same prompt replaces that section rather than adding a second one.
 */
export interface PromptDocument {
  /** Stable id; what a delivery names when it asks for this one. */
  readonly id: string
  /** Message key for the file's name, as the row that offers it reads. */
  readonly labelKey: string
  /** Path of the file, relative to the same root the two directories are read under. */
  readonly file: string
}

/**
 * One place an agent takes prompts in, declared as two directories and the
 * files beside them.
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
   * The files a prompt can be added to, in the order a menu offers them.
   * Absent where the place holds none: the actions that write one are then not
   * offered at all, rather than offered and failing.
   */
  readonly documents?: readonly PromptDocument[]
  /**
   * Whether this place takes only what a prompt is written *out* as — a
   * command, a rule, a section of one of its documents — and not the prompt
   * itself.
   *
   * A place that belongs to an agent has a directory the agent reads a prompt
   * out of, so putting one there is a thing to offer. A place that is a
   * workspace's own output directory has no such reading: it is where the
   * generated forms land, and "install the prompt here" names no file.
   */
  readonly generatedOnly?: boolean
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

/**
 * The service this module publishes as {@link PROMPT_SERVICE}.
 *
 * A class, not an interface with a factory, because registering has to belong to
 * whoever called it: `register` wraps itself in an effect on the context the
 * caller reached this service through. That only works while `register` is a
 * prototype method — as an arrow property it would close over this service's own
 * context, and every agent's places would stay on the page after that agent was
 * switched off.
 */
export class PromptService extends Service {
  private readonly held: PromptProvider[] = []

  constructor(ctx: Context) {
    super(ctx, PROMPT_SERVICE)
  }

  /** Every provider registered right now, in registration order. */
  providers(): readonly PromptProvider[] {
    return this.held
  }

  /** Add one provider, for as long as the plugin that added it stays loaded. */
  register(provider: PromptProvider): () => void {
    this.held.push(provider)
    return this.ctx.effect(() => () => {
      const at = this.held.indexOf(provider)
      if (at >= 0) this.held.splice(at, 1)
    })
  }
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
/* A plugin reads this as a property of the context it is handed, so it is
   declared on `Context` — the same place `host` and `i18n` are declared, and
   what makes `ctx.prompts` resolve rather than only `ctx.get("prompts")`. */
declare module "@deepseek-ai/cordis" {
  interface Context {
    /** This module's registry of agent places; see {@link PromptService}. */
    prompts: PromptService
  }
}
