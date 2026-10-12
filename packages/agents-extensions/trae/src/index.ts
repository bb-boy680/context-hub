/**
 * Trae as a Context Hub integration: the machine-wide skills directory it
 * reads, and the place this hub delivers skills to.
 *
 * Nothing here renders. The plugin declares an agent target and the place it
 * reads outside any workspace; the shell does the rest: the sidebar's agent
 * rows, the skills page's place menu, and the extension catalog entry all read
 * these. This plugin declares the machine-wide place only; nothing delivers
 * into the agent's own project directory yet.
 */
import Trae from "@lobehub/icons/es/Trae"

import type { ExtensionDefinition, ExtensionIcon } from "@workspace/extensions"

import { traeMessages } from "./messages.ts"

/** This integration's id; the kernel matches it against the manifest. */
export const TRAE_ID = "hub.target.trae"

/** The place Trae reads this machine's skills from, outside any workspace. */
export const TRAE_GLOBAL_PLACE = "trae-global"

/** The brand mark in its own colours. */
const TraeIcon: ExtensionIcon = Trae.Color

/** Trae: the machine-wide skills directory, and the target that names it. */
export const traeExtension: ExtensionDefinition = {
  manifest: {
    id: TRAE_ID,
    name: "Trae",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "agent",
    description: "Deliver skills to Trae.",
    icon: TraeIcon,
    defaultEnabled: true,
    permissions: ["assets.read"],
  },
  activate(scope) {
    /* The place comes first: the target below names it, so a consumer that
       reads one side always finds the other. */
    scope.contribute("skillLocation", {
      id: TRAE_GLOBAL_PLACE,
      labelKey: "trae.tab",
      icon: TraeIcon,
      scope: "global",
      dir: ".trae/skills",
      order: 90,
    })
    scope.contribute("target", {
      id: TRAE_ID,
      displayName: "Trae",
      icon: TraeIcon,
      supports: ["skill"],
      locations: [
        { label: "Skills", path: "~/.trae/skills/<name>/SKILL.md" },
        { label: "Skills", path: ".trae/skills/<name>/SKILL.md" },
      ],
      format: "Markdown skills with YAML frontmatter",
      globalSkillLocation: TRAE_GLOBAL_PLACE,
    })
    scope.contribute("locale", {
      id: "en",
      label: "English",
      messages: traeMessages,
    })
  },
}
