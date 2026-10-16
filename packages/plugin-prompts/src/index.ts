/**
 * Prompts as a plugin: the catalog page, its navigation entry, the service
 * every agent extension registers its delivery targets into, and the English
 * defaults for the `prompts.*` namespace — all through the kernel's extension
 * points, so the shell ships no prompt-specific code.
 *
 * A prompt is the one asset this hub holds that is neither enabled nor loaded:
 * its whole life is being written out somewhere. So this module owns the
 * library and the page, and the agents own the question of where "somewhere" is
 * — each declares its own directories when it activates.
 */
import { FileTextIcon } from "lucide-react"

import type { ExtensionDefinition } from "@workspace/extensions"

import { promptsMessages } from "./messages.ts"
import { PromptsPage } from "./page.tsx"
import { PROMPT_SERVICE } from "./provider.ts"
import { createPromptService } from "./service.ts"
import type { PromptStore } from "./store.ts"

export { PromptsPage }
export * from "./store.ts"
export * from "./provider.ts"
export { createPromptService } from "./service.ts"
export { createRemotePromptStore } from "./remote-store.ts"
export { deliver, delivered, targetOf, undeliver, type Delivery } from "./deliver.ts"

declare module "@deepseek-ai/cordis" {
  interface Context {
    /** The form-owned prompt library; absent when this form cannot reach one. */
    "hub.prompts"?: PromptStore
  }
}

/** This module's own id; the kernel matches it against the manifest. */
const PROMPTS_ID = "hub.prompt.catalog"

export const promptsExtension: ExtensionDefinition = {
  manifest: {
    id: PROMPTS_ID,
    name: "Prompts",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "asset",
    description:
      "Keep prompts in one place, and deliver them to an agent as a command, a rule, or a line of its instructions.",
    icon: FileTextIcon,
    defaultEnabled: true,
    permissions: ["assets.read", "filesystem"],
    provides: [PROMPT_SERVICE],
  },
  activate(scope) {
    /* The delivery targets travel through the registry rather than a
       contribution point, so an agent integration registers into this module
       the same way whether it was built here or installed as a folder. This
       module registers no place of its own: unlike a skill, a prompt has no
       directory every agent already shares — it only exists where it was sent,
       so the library the form owns is the only other place it lives. */
    scope.provide(PROMPT_SERVICE, createPromptService())

    scope.contribute("nav", {
      path: "/prompts",
      labelKey: "nav.prompts",
      icon: FileTextIcon,
      group: "assets",
      order: 35,
    })
    scope.contribute("route", {
      path: "/prompts",
      Component: PromptsPage,
    })
    scope.contribute("locale", {
      id: "en",
      label: "English",
      messages: promptsMessages,
    })
  },
}
