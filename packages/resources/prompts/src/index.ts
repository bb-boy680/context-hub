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
import { FileTextIcon, FolderIcon } from "lucide-react"

import type { ExtensionModule } from "@context-hub/extensions"

import { promptsMessages } from "./messages.ts"
import { PromptsPage } from "./page.tsx"
import { PROMPT_LIBRARY_SERVICE, PromptLibrary } from "./library-store.ts"
import { PROMPT_SERVICE, PromptService } from "./provider.ts"
import { promptSearch } from "./search.ts"
import type { PromptStore } from "./store.ts"
import { workspacePromptProvider } from "./workspace-provider.ts"

export { PromptsPage }
export * from "./store.ts"
export * from "./provider.ts"
export { PromptService } from "./provider.ts"
export { PromptLibrary, PROMPT_LIBRARY_SERVICE } from "./library-store.ts"
export { createRemotePromptStore } from "./remote-store.ts"
export { holdsSomething, heldMarks, type HeldMark } from "./held.ts"

declare module "@deepseek-ai/cordis" {
  interface Context {
    /** The form-owned prompt library; absent when this form cannot reach one. */
    "hub.prompts"?: PromptStore
  }
}

/** This module's own id; the kernel matches it against the manifest. */
const PROMPTS_ID = "hub.prompt.catalog"

export const promptsExtension: ExtensionModule = {
  name: PROMPTS_ID,
  manifest: {
    name: "Prompts",
    version: "0.1.0",
    kind: "code",
    category: "asset",
    description:
      "Keep prompts in one place, and deliver them to an agent as a command, a rule, or a line of its instructions.",
    icon: FileTextIcon,
    defaultEnabled: true,
    permissions: ["assets.read", "filesystem"],
    provides: [PROMPT_SERVICE, PROMPT_LIBRARY_SERVICE],
  },
  inject: ["nav", "routes", "locales", "search"],

  apply(ctx) {
    /* The shared read of the library. Constructed here and read by name from
       the form's own startup, so the rows are already there when a page opens
       rather than being read again on the way in. */
    const library = new PromptLibrary(ctx)

    /* The palette reaches this module through one function rather than by
       knowing which fields the page's filter reads. */
    ctx.search.register(promptSearch(library))

    /* The delivery targets travel through the registry rather than a
       contribution point, so an agent integration registers into this module
       the same way whether it was built here or installed as a folder. The
       workspace place is the module's own and is marked shared: `.agents/` is
       the one directory the agents in this hub share, and it is read whatever
       agents the sidebar chose — unlike an agent's places, which are offered
       only while that agent is chosen. */
    const service = new PromptService(ctx)
    service.register(workspacePromptProvider(FolderIcon))

    ctx.nav.register({
      path: "/prompts",
      labelKey: "nav.prompts",
      icon: FileTextIcon,
      group: "assets",
      order: 35,
    })
    ctx.routes.register({
      path: "/prompts",
      Component: PromptsPage,
    })
    ctx.locales.register({
      id: "en",
      label: "English",
      messages: promptsMessages,
    })
  },
}
