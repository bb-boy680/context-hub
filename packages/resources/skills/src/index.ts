/**
 * Skills as a plugin: the catalog page, its navigation entry, the service every
 * agent extension registers its places into, and the English defaults for the
 * `skills.*` namespace — all through the kernel's extension points, so the
 * shell ships no skill-specific code. Agent targets extend this module the same
 * way — they register the places they read instead of being compiled into it.
 */
import { FolderIcon, SparklesIcon } from "lucide-react"

import type { WorkspaceService } from "@context-hub/core/workspace"
import type { ExtensionDefinition } from "@context-hub/extensions"

import { skillsMessages } from "./messages.ts"
import { SkillsPage } from "./page.tsx"
import { SKILL_SERVICE, type SkillPlace } from "./provider.ts"
import { createSkillService } from "./service.ts"
import type { SkillStore } from "./store.ts"

export { SkillsPage }
export * from "./store.ts"
export * from "./registry.ts"
export * from "./provider.ts"
export { useSkillAgents } from "./library.ts"
export { createSkillService } from "./service.ts"
export { createRemoteSkillStore } from "./remote-store.ts"

declare module "@deepseek-ai/cordis" {
  interface Context {
    /** The form-owned skill library; absent when this form cannot reach one. */
    "hub.skills"?: SkillStore
    /** The form-owned workspace list; the skills page reads the current folder from it. */
    "hub.workspaces"?: WorkspaceService
  }
}

/** This module's own id; the kernel matches it against the manifest. */
const SKILLS_ID = "hub.skill.catalog"

/** The place the skills CLI and this hub share, in every workspace. */
const SHARED_PLACE: SkillPlace = {
  id: "workspace",
  labelKey: "skills.tab.workspace",
  icon: FolderIcon,
  scope: "workspace",
  dir: ".agents/skills",
  order: 10,
}

export const skillsExtension: ExtensionDefinition = {
  manifest: {
    id: SKILLS_ID,
    name: "Skills",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "asset",
    description:
      "Browse, import and install skills, and keep them in this workspace.",
    icon: SparklesIcon,
    defaultEnabled: true,
    permissions: ["assets.read", "assets.write"],
    provides: [SKILL_SERVICE],
  },
  activate(scope) {
    /* The places travel through the registry rather than a contribution point,
       so an agent integration registers into this module the same way whether
       it was built here or installed as a folder. This module's own place is
       the first one in it: it is in every workspace, so no agent has to be
       chosen for it to be read. */
    const service = createSkillService()
    service.registry.register({ id: SKILLS_ID, places: [SHARED_PLACE] })
    scope.provide(SKILL_SERVICE, service)

    scope.contribute("nav", {
      path: "/skills",
      labelKey: "nav.skills",
      icon: SparklesIcon,
      group: "assets",
      order: 15,
    })
    scope.contribute("route", {
      path: "/skills",
      Component: SkillsPage,
    })
    scope.contribute("locale", {
      id: "en",
      label: "English",
      messages: skillsMessages,
    })
  },
}
