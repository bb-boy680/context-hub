/**
 * Cline as a Context Hub integration: the machine-wide skills directory it
 * reads, and the place this hub delivers skills to.
 *
 * Nothing here renders. The plugin declares an agent target and the place it
 * reads outside any workspace; the shell does the rest: the sidebar's agent
 * rows, the skills page's place menu, and the extension catalog entry all read
 * these. A project's skills reach this agent through the shared
 * `.agents/skills` directory the skills module already lists, so no workspace
 * place is declared here.
 */
import Cline from "@lobehub/icons/es/Cline"

import type { ExtensionDefinition, ExtensionIcon } from "@workspace/extensions"

import { clineMessages } from "./messages.ts"

/** This integration's id; the kernel matches it against the manifest. */
export const CLINE_ID = "hub.target.cline"

/** The place Cline reads this machine's skills from, outside any workspace. */
export const CLINE_GLOBAL_PLACE = "cline-global"

/** The brand mark in its single form; this icon ships no colour variant. */
const ClineIcon: ExtensionIcon = Cline

/** Cline: the machine-wide skills directory, and the target that names it. */
export const clineExtension: ExtensionDefinition = {
  manifest: {
    id: CLINE_ID,
    name: "Cline",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "integration",
    description: "Deliver skills to Cline.",
    icon: ClineIcon,
    defaultEnabled: true,
    permissions: ["assets.read"],
  },
  activate(scope) {
    /* The place comes first: the target below names it, so a consumer that
       reads one side always finds the other. */
    scope.contribute("skillLocation", {
      id: CLINE_GLOBAL_PLACE,
      labelKey: "cline.tab",
      icon: ClineIcon,
      scope: "global",
      dir: ".agents/skills",
      order: 50,
    })
    scope.contribute("target", {
      id: CLINE_ID,
      displayName: "Cline",
      icon: ClineIcon,
      supports: ["skill"],
      locations: [
        { label: "Skills", path: "~/.agents/skills/<name>/SKILL.md" },
        { label: "Skills", path: ".agents/skills/<name>/SKILL.md" },
      ],
      format: "Markdown skills with YAML frontmatter",
      globalSkillLocation: CLINE_GLOBAL_PLACE,
    })
    scope.contribute("locale", {
      id: "en",
      label: "English",
      messages: clineMessages,
    })
  },
}
