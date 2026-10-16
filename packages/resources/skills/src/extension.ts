/**
 * The skills module's extension definition, with the page left out.
 *
 * The page arrives as an argument because a check runs this under plain Node,
 * which cannot parse JSX — the same split the MCP module makes. What is here is
 * everything that does not render: the manifest, the service agent extensions
 * register their places into, and the navigation and language entries.
 */
import type { ComponentType } from "react"
import { FolderIcon, SparklesIcon } from "lucide-react"

import type { ExtensionDefinition } from "@context-hub/extensions"

import { skillsMessages } from "./messages.ts"
import { SKILL_SERVICE, type SkillPlace } from "./provider.ts"
import { createSkillService } from "./service.ts"

/** This module's own id; the kernel matches it against the manifest. */
export const SKILLS_ID = "hub.skill.catalog"

/** The place the skills CLI and this hub share, in every workspace. */
const SHARED_PLACE: SkillPlace = {
  id: "workspace",
  labelKey: "skills.tab.workspace",
  icon: FolderIcon,
  scope: "workspace",
  dir: ".agents/skills",
  order: 10,
}

/**
 * The skills module, with the page to mount at its route.
 *
 * @param page — the page a UI shell renders at `/skills`.
 */
export function skillsExtensionWith(page: ComponentType): ExtensionDefinition {
  return {
    manifest: {
      id: SKILLS_ID,
      name: "Skills",
      version: "0.1.0",
      apiVersion: "^0.1",
      kind: "code",
      category: "asset",
      description: "Browse, import and install skills, and keep them in this workspace.",
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
        Component: page,
      })
      scope.contribute("locale", {
        id: "en",
        label: "English",
        messages: skillsMessages,
      })
    },
  }
}
