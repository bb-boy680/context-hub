/**
 * Qoder as a Context Hub integration: the machine-wide skills directory it
 * reads, and the place this hub delivers skills to.
 *
 * Nothing here renders. The plugin declares an agent target and the place it
 * reads outside any workspace; the shell does the rest: the sidebar's agent
 * rows, the skills page's place menu, and the extension catalog entry all read
 * these. This plugin declares the machine-wide place only; nothing delivers
 * into the agent's own project directory yet.
 */
import Qoder from "@lobehub/icons/es/Qoder"

import type { ExtensionDefinition, ExtensionIcon } from "@workspace/extensions"

import { qoderMessages } from "./messages.ts"

/** This integration's id; the kernel matches it against the manifest. */
export const QODER_ID = "hub.target.qoder"

/** The place Qoder reads this machine's skills from, outside any workspace. */
export const QODER_GLOBAL_PLACE = "qoder-global"

/** The brand mark in its own colours. */
const QoderIcon: ExtensionIcon = Qoder.Color

/** Qoder: the machine-wide skills directory, and the target that names it. */
export const qoderExtension: ExtensionDefinition = {
  manifest: {
    id: QODER_ID,
    name: "Qoder",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "integration",
    description: "Deliver skills to Qoder.",
    icon: QoderIcon,
    defaultEnabled: true,
    permissions: ["assets.read"],
  },
  activate(scope) {
    /* The place comes first: the target below names it, so a consumer that
       reads one side always finds the other. */
    scope.contribute("skillLocation", {
      id: QODER_GLOBAL_PLACE,
      labelKey: "qoder.tab",
      icon: QoderIcon,
      scope: "global",
      dir: ".qoder/skills",
      order: 100,
    })
    scope.contribute("target", {
      id: QODER_ID,
      displayName: "Qoder",
      icon: QoderIcon,
      supports: ["skill"],
      locations: [
        { label: "Skills", path: "~/.qoder/skills/<name>/SKILL.md" },
        { label: "Skills", path: ".qoder/skills/<name>/SKILL.md" },
      ],
      format: "Markdown skills with YAML frontmatter",
      globalSkillLocation: QODER_GLOBAL_PLACE,
    })
    scope.contribute("locale", {
      id: "en",
      label: "English",
      messages: qoderMessages,
    })
  },
}
