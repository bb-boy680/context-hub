/**
 * Trae as a Context Hub integration: the machine-wide skills directory it
 * reads, and the place this hub delivers skills to.
 *
 * Nothing here renders. The plugin registers the place it reads outside any
 * workspace and declares an agent target; the shell does the rest: the
 * sidebar's agent rows, the skills page's place menu, and the extension catalog
 * entry all read these. This plugin registers the machine-wide place only;
 * nothing delivers into the agent's own project directory yet.
 */
import Trae from "@lobehub/icons/es/Trae"

import type { ExtensionDefinition, ExtensionIcon } from "@workspace/extensions"
import type { SkillPlace } from "@workspace/plugin-skills/contract"

import { traeMessages } from "./messages.ts"

/** This integration's id; the kernel matches it against the manifest. */
export const TRAE_ID = "hub.target.trae"

/** The brand mark in its own colours. */
const TraeIcon: ExtensionIcon = Trae.Color

/** The place Trae reads this machine's skills from, outside any workspace. */
const TRAE_PLACES: SkillPlace[] = [
  {
    id: "trae-global",
    labelKey: "trae.tab",
    icon: TraeIcon,
    scope: "global",
    dir: ".trae/skills",
    order: 90,
  },
]

/** Trae: the machine-wide skills directory, and the target beside it. */
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
    /* The places register into the skills module, which is what makes this
       agent one the sidebar lists and the skills page reads. */
    scope.inject(["skills"], (ctx, plugins) => {
      const { registry } = plugins.skills
      ctx.effect(() => registry.register({ id: TRAE_ID, places: TRAE_PLACES }))
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
    })
    scope.contribute("locale", {
      id: "en",
      label: "English",
      messages: traeMessages,
    })
  },
}
