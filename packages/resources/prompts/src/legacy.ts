/**
 * The provider shape this module shipped before it knew how to write files:
 * places described as directories and documents, with no methods.
 *
 * An installed extension is a folder of code, and the Claude Code extension
 * that shipped against the old shape is still out there. Refusing it would make
 * its prompt deliveries stop until it is updated, and the update is gated on
 * this build — so the old declaration is carried out here, by the same
 * functions the built-in workspace place uses.
 *
 * This is a transition layer, not a second public contract. It is removed when
 * the hub's `engines` upper bound no longer admits a 0.1.x extension.
 */
import type { AssetScope } from "@context-hub/core/place-files"
import type { ExtensionIcon } from "@context-hub/extensions"

import {
  deliver,
  heldAt,
  undeliver,
  type Delivery,
  type DeliveryPlace,
  type Held,
} from "./deliver.ts"
import { PromptError } from "./failure.ts"
import type {
  PromptForm,
  PromptHeld,
  PromptPlace,
  PromptProvider,
  PromptIo,
} from "./provider.ts"
import type { Prompt } from "./store.ts"

/** One file a prompt can be added to, as the old shape declared it. */
export interface LegacyPromptDocument {
  readonly id: string
  readonly labelKey: string
  readonly removeLabelKey?: string
  readonly file: string
}

/** One place, as the old shape declared it. */
export interface LegacyPromptPlace {
  readonly id: string
  readonly agent: string
  readonly labelKey: string
  readonly icon: ExtensionIcon
  readonly scope: AssetScope
  readonly order: number
  readonly commandDir: string
  readonly ruleDir: string
  readonly agentDir?: string
  readonly documents?: readonly LegacyPromptDocument[]
  readonly generatedOnly?: boolean
}

/** The old provider: an id and its places, and nothing to call. */
export interface LegacyPromptProvider {
  readonly id: string
  readonly shared?: boolean
  readonly places: readonly LegacyPromptPlace[]
}

/**
 * Whether a registered value is the old shape.
 *
 * The old places carry a `commandDir` and no `forms`; the new ones carry forms
 * and no directories. Checking every place keeps a half-migrated provider from
 * being read as either.
 */
export function isLegacyPromptProvider(value: unknown): value is LegacyPromptProvider {
  if (typeof value !== "object" || value === null) return false
  const places = (value as { places?: unknown }).places
  return (
    Array.isArray(places) &&
    places.length > 0 &&
    places.every(
      (place) =>
        typeof place === "object" &&
        place !== null &&
        typeof (place as { commandDir?: unknown }).commandDir === "string" &&
        (place as { forms?: unknown }).forms === undefined
    )
  )
}

/** The directory a place's generated files sit under, as the old shape read it. */
function generatedUnder(dir: string): string {
  const parts = dir.split("/")
  return parts.length > 1 ? parts.slice(0, -1).join("/") : dir
}

/** The old place's forms, carrying the labels the old extension's locale owns. */
function formsOf(place: LegacyPromptPlace): PromptForm[] {
  const forms: PromptForm[] = [
    {
      id: "commands",
      labelKey: "prompts.menu.commands",
      removeLabelKey: "prompts.menu.commands.remove",
    },
    {
      id: "rule",
      labelKey: "prompts.menu.rule",
      removeLabelKey: "prompts.menu.rule.remove",
    },
  ]
  if (place.agentDir !== undefined) {
    forms.push({
      id: "agent",
      labelKey: "prompts.menu.agent",
      removeLabelKey: "prompts.menu.agent.remove",
    })
  }
  if (place.documents !== undefined && place.documents.length > 0) {
    forms.push({
      id: "instructions",
      labelKey: "prompts.menu.documents",
      options: place.documents.map((one) => ({
        id: one.id,
        labelKey: one.labelKey,
        ...(one.removeLabelKey === undefined ? {} : { removeLabelKey: one.removeLabelKey }),
      })),
    })
  }
  return forms
}

/** The place as the old delivery functions read it. */
function deliveryOf(place: LegacyPromptPlace): DeliveryPlace {
  return {
    id: place.id,
    scope: place.scope,
    commandDir: place.commandDir,
    ruleDir: place.ruleDir,
    ...(place.agentDir === undefined ? {} : { agentDir: place.agentDir }),
    ...(place.documents === undefined ? {} : { documents: place.documents }),
  }
}

/** Which of the old actions a form names. */
function actionOf(form: string): Delivery {
  if (form === "commands" || form === "rule" || form === "agent" || form === "instructions") {
    return form
  }
  throw new PromptError("prompts.error.unknownForm", { form })
}

/** The old answer, as the form-keyed answer the page reads. */
function heldOf(held: Held): PromptHeld {
  const answer: Record<string, boolean> = {}
  if (held.commands) answer.commands = true
  if (held.rule) answer.rule = true
  if (held.agent) answer.agent = true
  for (const id of held.documents) answer[`instructions:${id}`] = true
  return answer
}

/**
 * Carry one old provider through the new contract.
 *
 * The place identities are kept byte for byte — ids, scopes, icons, order — so
 * the files and the page's marks are the same ones the extension wrote before.
 */
export function legacyPromptProvider(old: LegacyPromptProvider): PromptProvider {
  const delivery = new Map<string, DeliveryPlace>()
  const places: PromptPlace[] = old.places.map((place) => {
    delivery.set(place.id, deliveryOf(place))
    const where = generatedUnder(place.commandDir)
    return {
      id: place.id,
      agent: place.agent,
      labelKey: place.labelKey,
      icon: place.icon,
      scope: place.scope,
      order: place.order,
      ...(place.generatedOnly === undefined ? {} : { generatedOnly: place.generatedOnly }),
      where: place.scope === "global" ? `~/${where}` : where,
      forms: formsOf(place),
    }
  })

  const target = (place: string): DeliveryPlace => {
    const one = delivery.get(place)
    if (one === undefined) {
      throw new PromptError("prompts.error.unknownPlace", { place })
    }
    return one
  }

  return {
    id: old.id,
    ...(old.shared === undefined ? {} : { shared: old.shared }),
    places,

    async held(io: PromptIo, place: string, prompt: Prompt): Promise<PromptHeld> {
      return heldOf(await heldAt(io.files, target(place), prompt))
    },

    async install(
      io: PromptIo,
      place: string,
      prompt: Prompt,
      form: string,
      option?: string
    ): Promise<void> {
      await deliver(io.files, target(place), prompt, actionOf(form), option)
    },

    async remove(
      io: PromptIo,
      place: string,
      prompt: Prompt,
      form: string,
      option?: string
    ): Promise<boolean> {
      return undeliver(io.files, target(place), prompt, actionOf(form), option)
    },
  }
}
