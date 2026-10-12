/**
 * Kiro CLI as a Context Hub integration: the machine-wide skills directory it
 * reads, and the place this hub delivers skills to.
 *
 * Nothing here renders. The plugin declares an agent target and the place it
 * reads outside any workspace; the shell does the rest: the sidebar's agent
 * rows, the skills page's place menu, and the extension catalog entry all read
 * these. This plugin declares the machine-wide place only; nothing delivers
 * into the agent's own project directory yet.
 */
import Kiro from "@lobehub/icons/es/Kiro"

import type { ExtensionDefinition, ExtensionIcon } from "@workspace/extensions"

import { kiroCliMessages } from "./messages.ts"

/** This integration's id; the kernel matches it against the manifest. */
export const KIRO_CLI_ID = "hub.target.kiro-cli"

/** The place Kiro CLI reads this machine's skills from, outside any workspace. */
export const KIRO_CLI_GLOBAL_PLACE = "kiro-cli-global"

/** The brand mark in its own colours. */
const KiroCliIcon: ExtensionIcon = Kiro.Color

/** Kiro CLI: the machine-wide skills directory, and the target that names it. */
export const kiroCliExtension: ExtensionDefinition = {
  manifest: {
    id: KIRO_CLI_ID,
    name: "Kiro CLI",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "integration",
    description: "Deliver skills to Kiro CLI.",
    icon: KiroCliIcon,
    defaultEnabled: true,
    permissions: ["assets.read"],
  },
  activate(scope) {
    /* The place comes first: the target below names it, so a consumer that
       reads one side always finds the other. */
    scope.contribute("skillLocation", {
      id: KIRO_CLI_GLOBAL_PLACE,
      labelKey: "kiroCli.tab",
      icon: KiroCliIcon,
      scope: "global",
      dir: ".kiro/skills",
      order: 80,
    })
    scope.contribute("target", {
      id: KIRO_CLI_ID,
      displayName: "Kiro CLI",
      icon: KiroCliIcon,
      supports: ["skill"],
      locations: [
        { label: "Skills", path: "~/.kiro/skills/<name>/SKILL.md" },
        { label: "Skills", path: ".kiro/skills/<name>/SKILL.md" },
      ],
      format: "Markdown skills with YAML frontmatter",
      globalSkillLocation: KIRO_CLI_GLOBAL_PLACE,
    })
    scope.contribute("locale", {
      id: "en",
      label: "English",
      messages: kiroCliMessages,
    })
  },
}
