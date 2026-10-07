/**
 * Skills as a plugin: the catalog page, its navigation entry, and the English
 * defaults for the `skills.*` namespace all arrive through the kernel's
 * extension points, so the shell ships no skill-specific code. Agent targets
 * extend this module the same way — they contribute a `target` descriptor
 * instead of being compiled into it.
 */
import { SparklesIcon } from "lucide-react"

import type { ExtensionDefinition } from "@workspace/extensions"

import { skillsMessages } from "./messages.ts"
import { SkillsPage } from "./page.tsx"

export { SkillsPage }

export const skillsExtension: ExtensionDefinition = {
  manifest: {
    id: "hub.skill.catalog",
    name: "Skills",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "source",
    description:
      "Browse, import and install skills, and keep them in this workspace.",
    icon: SparklesIcon,
    defaultEnabled: true,
    permissions: ["assets.read", "assets.write"],
  },
  activate(scope) {
    scope.contribute("nav", {
      path: "/skills",
      labelKey: "nav.skills",
      icon: SparklesIcon,
      group: "manage",
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
