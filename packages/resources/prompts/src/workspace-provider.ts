/**
 * The place every workspace has, which no agent owns: where this hub writes the
 * forms it makes out of a prompt.
 *
 * `.agents/` is the directory the agents in this hub already share — the skills
 * module keeps its own `.agents/skills` there — so a command, a rule or an
 * agents file written under it is found by whoever has been taught to look,
 * rather than being put in one agent's own directory. It takes no prompt of its
 * own: there is no file a prompt itself would be written to here, only the
 * forms made from one.
 */
import { deliver, heldAt, undeliver, type DeliveryPlace } from "./deliver.ts"
import { PromptError } from "./failure.ts"
import type {
  PromptForm,
  PromptHeld,
  PromptPlace,
  PromptProvider,
  PromptIo,
} from "./provider.ts"
import type { Prompt } from "./store.ts"

/** This module's own id; the kernel matches it against the manifest. */
const PROMPTS_ID = "hub.prompt.catalog"

/** The two files a project keeps its standing conventions in. */
const DOCUMENTS = [
  {
    id: "agents",
    labelKey: "prompts.menu.document.agents",
    removeLabelKey: "prompts.menu.document.agents.remove",
    file: "AGENTS.md",
  },
  {
    id: "design",
    labelKey: "prompts.menu.document.design",
    removeLabelKey: "prompts.menu.document.design.remove",
    file: "DESIGN.md",
  },
] as const

/** The place as the directory-and-document actions read it. */
const DELIVERY: DeliveryPlace = {
  id: "workspace",
  scope: "workspace",
  commandDir: ".agents/commands",
  ruleDir: ".agents/rules",
  agentDir: ".agents/agents",
  documents: DOCUMENTS,
}

const FORMS: readonly PromptForm[] = [
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
  {
    id: "agent",
    labelKey: "prompts.menu.agent",
    removeLabelKey: "prompts.menu.agent.remove",
  },
  {
    id: "instructions",
    labelKey: "prompts.menu.documents",
    options: DOCUMENTS.map((one) => ({
      id: one.id,
      labelKey: one.labelKey,
      removeLabelKey: one.removeLabelKey,
    })),
  },
]

const PLACE: PromptPlace = {
  id: "workspace",
  /* No agent owns this one, so it answers to this module. */
  agent: PROMPTS_ID,
  labelKey: "prompts.location.workspace",
  icon: () => null,
  scope: "workspace",
  order: 0,
  generatedOnly: true,
  where: ".agents",
  forms: FORMS,
}

/** Which action a form names. */
function actionOf(form: string): "commands" | "rule" | "agent" | "instructions" {
  if (form === "commands" || form === "rule" || form === "agent" || form === "instructions") {
    return form
  }
  throw new PromptError("prompts.error.unknownForm", { form })
}

/** The old answer, keyed the way the page reads a provider's answer. */
function heldOf(held: Awaited<ReturnType<typeof heldAt>>): PromptHeld {
  const answer: Record<string, boolean> = {}
  if (held.commands) answer.commands = true
  if (held.rule) answer.rule = true
  if (held.agent) answer.agent = true
  for (const id of held.documents) answer[`instructions:${id}`] = true
  return answer
}

/**
 * The provider the prompts module registers for its own workspace place.
 *
 * The icon is filled in by `index.ts` from the module's own icon, because the
 * place is constructed before the extension's runtime values are in scope.
 */
export function workspacePromptProvider(icon: PromptPlace["icon"]): PromptProvider {
  return {
    id: PROMPTS_ID,
    shared: true,
    places: [{ ...PLACE, icon }],

    async held(io: PromptIo, place: string, prompt: Prompt): Promise<PromptHeld> {
      if (place !== DELIVERY.id) {
        throw new PromptError("prompts.error.unknownPlace", { place })
      }
      return heldOf(await heldAt(io.files, DELIVERY, prompt))
    },

    async install(
      io: PromptIo,
      place: string,
      prompt: Prompt,
      form: string,
      option?: string
    ): Promise<void> {
      if (place !== DELIVERY.id) {
        throw new PromptError("prompts.error.unknownPlace", { place })
      }
      await deliver(io.files, DELIVERY, prompt, actionOf(form), option)
    },

    async remove(
      io: PromptIo,
      place: string,
      prompt: Prompt,
      form: string,
      option?: string
    ): Promise<boolean> {
      if (place !== DELIVERY.id) {
        throw new PromptError("prompts.error.unknownPlace", { place })
      }
      return undeliver(io.files, DELIVERY, prompt, actionOf(form), option)
    },
  }
}
