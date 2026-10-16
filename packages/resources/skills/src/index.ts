/**
 * Skills as a plugin: the catalog page, its navigation entry, the service every
 * agent extension registers its places into, and the English defaults for the
 * `skills.*` namespace — all through the kernel's extension points, so the
 * shell ships no skill-specific code. Agent targets extend this module the same
 * way — they register the places they read instead of being compiled into it.
 *
 * The definition itself is in `./extension`, which takes the page as an
 * argument so a check can run it under plain Node.
 */
import type { WorkspaceService } from "@context-hub/core/workspace"

import { skillsExtensionWith } from "./extension.ts"
import { SkillsPage } from "./page.tsx"

export { SkillsPage }
export * from "./store.ts"
export * from "./registry.ts"
export * from "./provider.ts"
export { useSkillAgents } from "./library.ts"
export { createRemoteSkillStore } from "./remote-store.ts"
export { SKILLS_ID, skillsExtensionWith } from "./extension.ts"

declare module "@deepseek-ai/cordis" {
  interface Context {
    /** The form-owned skill library; absent when this form cannot reach one. */
    "hub.skills"?: import("./store.ts").SkillStore
    /** The form-owned workspace list; the skills page reads the current folder from it. */
    "hub.workspaces"?: WorkspaceService
  }
}

export const skillsExtension = skillsExtensionWith(SkillsPage)
