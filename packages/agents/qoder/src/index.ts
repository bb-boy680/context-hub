/**
 * Qoder as a Context Hub integration: the machine-wide skills directory it
 * reads, and the place this hub delivers skills to.
 *
 * Nothing here renders. The plugin registers the place it reads outside any
 * workspace and declares an agent target; the shell does the rest: the
 * sidebar's agent rows, the skills page's place menu, and the extension catalog
 * entry all read these. This plugin registers the machine-wide place only;
 * nothing delivers into the agent's own project directory yet.
 */
import Qoder from "@lobehub/icons/es/Qoder"

import type { ExtensionDefinition, ExtensionIcon } from "@context-hub/extensions"
import type { SkillPlace } from "@context-hub/skills/contract"

import { qoderMessages } from "./messages.ts"

/** This integration's id; the kernel matches it against the manifest. */
export const QODER_ID = "hub.target.qoder"

/** The brand mark in its own colours. */
const QoderIcon: ExtensionIcon = Qoder.Color

/** The place Qoder reads this machine's skills from, outside any workspace. */
const QODER_PLACES: SkillPlace[] = [
  {
    id: "qoder-global",
    labelKey: "qoder.tab",
    icon: QoderIcon,
    scope: "global",
    dir: ".qoder/skills",
    order: 100,
  },
]

/** Qoder: the machine-wide skills directory, and the target beside it. */
export const qoderExtension: ExtensionDefinition = {
  manifest: {
    id: QODER_ID,
    name: "Qoder",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "agent",
    description: "Deliver skills to Qoder.",
    icon: QoderIcon,
    defaultEnabled: true,
    permissions: ["assets.read"],
  },
  activate(scope) {
    /* The places register into the skills module, which is what makes this
       agent one the sidebar lists and the skills page reads. */
    scope.inject(["skills"], (ctx, plugins) => {
      const { registry } = plugins.skills
      ctx.effect(() => registry.register({ id: QODER_ID, places: QODER_PLACES }))
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
    })
    scope.contribute("locale", {
      id: "en",
      label: "English",
      messages: qoderMessages,
    })
  },
}
