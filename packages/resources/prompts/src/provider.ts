/**
 * The one service an agent plugin publishes into when it knows how that agent
 * takes a prompt.
 *
 * The prompts module owns the page, the library and the shared workspace place;
 * it knows no agent's directories or file formats. Each agent extension knows
 * exactly one agent and registers a provider here: the forms it offers, where
 * each one writes, and how to tell whether the agent already holds a prompt.
 * Adding an agent is then a plugin — the page has no list of actions to keep in
 * step, and a place that declares no form simply does not offer it.
 *
 * These paths are the machine-readable ones. A target's `locations` are the
 * strings a catalog row prints; a place is what an action writes to, which is a
 * different answer and has to be checked before it is used.
 */
import { Service } from "@deepseek-ai/cordis"
import type { Context } from "@deepseek-ai/cordis"

import type { AssetScope, PlaceFiles } from "@context-hub/core/place-files"
import { chosenProviders, type ExtensionIcon } from "@context-hub/extensions"

import { isLegacyPromptProvider, legacyPromptProvider } from "./legacy.ts"
import type { LegacyPromptProvider } from "./legacy.ts"
import { promptTools, type PromptTools } from "./toolkit.ts"
import type { Prompt } from "./store.ts"

/** The service name the prompts module publishes and every agent plugin requires. */
export const PROMPT_SERVICE = "prompts"

/** One option inside a form that offers a choice, e.g. one instruction file. */
export interface PromptFormOption {
  /** Stable id; half of the key this option is held under. */
  readonly id: string
  /** Message key for the option's name, as the row that offers it reads. */
  readonly labelKey: string
  /** Message key for taking it back; without it the option stays add-only. */
  readonly removeLabelKey?: string
}

/**
 * One way a place takes a prompt: a directory of generated files, or a set of
 * files a section can be added to.
 *
 * A form without options is one action. A form with options is a heading and
 * one action per option — the shape an agent with several instruction files
 * needs, without making every provider invent its own menu.
 */
export interface PromptForm {
  /** Stable id; what a delivery names and how the form is held. */
  readonly id: string
  /** Message key for the action, or for the heading when there are options. */
  readonly labelKey: string
  /** Message key for taking the single action back. */
  readonly removeLabelKey?: string
  /** The choices the form offers, in the order a menu reads them. */
  readonly options?: readonly PromptFormOption[]
}

/**
 * One place an agent takes prompts in: one root, and the forms it offers there.
 *
 * Both roots a place can sit under are the client's roots — the workspace in
 * use, and the machine-wide one — so nothing here names an absolute path.
 */
export interface PromptPlace {
  /** Stable id; the row's key and the target a delivery names. */
  readonly id: string
  /** The agent's id, e.g. "hub.target.claude-code"; two places of one agent share it. */
  readonly agent: string
  /** Message key for the agent's name. */
  readonly labelKey: string
  readonly icon: ExtensionIcon
  /** The root every form below is read under. */
  readonly scope: AssetScope
  /** Sort rank among the places of its own scope. */
  readonly order: number
  /**
   * Whether this place takes only what a prompt is written *out* as, and not
   * the prompt itself.
   *
   * A place that is a workspace's own output directory has no such reading: it
   * is where the generated forms land, and "install the prompt here" names no
   * file. A place that belongs to an agent does have one, so it is also offered
   * as somewhere the prompt itself can be read.
   */
  readonly generatedOnly?: boolean
  /** The directory a person recognises, e.g. ".claude" or "~/.codex". */
  readonly where?: string
  /** Every way this place takes a prompt, in menu order. */
  readonly forms: readonly PromptForm[]
}

/** What one place already holds of one prompt: form or form:option keys. */
export type PromptHeld = Readonly<Record<string, boolean>>

/** Where a provider reads and writes the client files it owns. */
export interface PromptIo {
  readonly files: PlaceFiles
  /** The workspace in use, as a path, or null when this hub has none. */
  workspace(): Promise<string | null>
}

/**
 * One agent, as the prompts module uses it: where it takes prompts and how.
 *
 * The three methods are the whole contract. `held` is read from the files each
 * time — nothing records a delivery — and `install`/`remove` do one action.
 * A provider that cannot reach its files says so through {@link PromptTools.PromptError}.
 */
export interface PromptProvider {
  /** The agent's id, e.g. "hub.target.claude-code". */
  readonly id: string
  /**
   * True when this is the module's own place rather than an agent's: the
   * workspace's own output directory, which exists whatever the sidebar chose.
   */
  readonly shared?: boolean
  /** Every place this agent takes prompts in. */
  readonly places: readonly PromptPlace[]
  /** What each place already holds of one prompt. */
  held(io: PromptIo, place: string, prompt: Prompt): Promise<PromptHeld>
  /** Write one form into one place, replacing what the same prompt wrote there. */
  install(
    io: PromptIo,
    place: string,
    prompt: Prompt,
    form: string,
    option?: string
  ): Promise<void>
  /** Take one form back; false when there was nothing to take back. */
  remove(
    io: PromptIo,
    place: string,
    prompt: Prompt,
    form: string,
    option?: string
  ): Promise<boolean>
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

  /** The file-naming and section rules a provider cannot import itself. */
  readonly tools: PromptTools = promptTools

  constructor(ctx: Context) {
    super(ctx, PROMPT_SERVICE)
  }

  /** Every provider registered right now, in registration order. */
  providers(): readonly PromptProvider[] {
    return this.held
  }

  /** The provider that declared one place, or none when no one did. */
  providerOf(place: string): PromptProvider | undefined {
    return this.held.find((provider) => provider.places.some((one) => one.id === place))
  }

  /**
   * Add one provider, for as long as the plugin that added it stays loaded.
   *
   * A provider written before this contract — places only, with directories and
   * documents — is wrapped by the legacy adapter rather than refused. The old
   * shape is a data description, and the adapter knows how to carry it out.
   *
   * @throws when the value is neither shape, or when it claims a place id that
   * is already registered: two providers behind one id would send a write to
   * the wrong one.
   */
  register(provider: PromptProvider | LegacyPromptProvider): () => void {
    const next = isLegacyPromptProvider(provider)
      ? legacyPromptProvider(provider)
      : (provider as PromptProvider)
    assertProvider(next)

    const places = next.places.map((place) => place.id)
    if (new Set(places).size !== places.length) {
      throw new Error(`${next.id} declares the same place twice`)
    }
    const taken = places.find((id) =>
      this.held.some((one) => one.places.some((place) => place.id === id))
    )
    if (taken !== undefined) {
      throw new Error(`the place ${taken} is already registered`)
    }

    this.held.push(next)
    return this.ctx.effect(() => () => {
      const at = this.held.indexOf(next)
      if (at >= 0) this.held.splice(at, 1)
    })
  }
}

/**
 * Check that a provider carries what the page will call.
 *
 * An installed extension is a folder of code, not a type: it can arrive with a
 * shape this build does not know, and a provider silently missing `held` would
 * make the menu draw rows that cannot answer. Refusing it names what was wrong.
 */
function assertProvider(provider: PromptProvider): void {
  if (typeof provider !== "object" || provider === null) {
    throw new Error("a prompt provider is an object")
  }
  if (typeof provider.id !== "string" || provider.id === "") {
    throw new Error("a prompt provider needs an id")
  }
  if (!Array.isArray(provider.places) || provider.places.length === 0) {
    throw new Error(`${provider.id} declares no places`)
  }
  if (
    typeof provider.held !== "function" ||
    typeof provider.install !== "function" ||
    typeof provider.remove !== "function"
  ) {
    throw new Error(`${provider.id} does not implement held, install and remove`)
  }
  for (const place of provider.places) {
    if (typeof place !== "object" || place === null || typeof place.id !== "string") {
      throw new Error(`${provider.id} declares a place without an id`)
    }
    if (!Array.isArray(place.forms) || place.forms.length === 0) {
      throw new Error(`${provider.id}/${place.id} declares no forms`)
    }
  }
}

/**
 * Every place the registered providers make available.
 *
 * A provider belongs to one agent, and the sidebar's choice says which agents
 * this hub works with: an agent nobody chose is not offered as a delivery
 * target, so neither is anything it reads. The module's own workspace place is
 * not an agent's — it is where this hub writes what it generates, whatever is
 * chosen — and says so with `shared`.
 *
 * @param providers — every registered provider.
 * @param chosen — the agents the sidebar chose, by provider id.
 * @returns the places, ordered by scope and then by their own rank.
 */
export function promptPlaces(
  providers: readonly PromptProvider[],
  chosen: readonly string[]
): readonly PromptPlace[] {
  return chosenProviders(providers, chosen)
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
