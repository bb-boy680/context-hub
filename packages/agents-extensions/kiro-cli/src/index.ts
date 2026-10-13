/**
 * Kiro CLI as a Context Hub integration: the machine-wide skills directory it
 * reads, and the place this hub delivers skills to.
 *
 * Nothing here renders. The plugin registers the place it reads outside any
 * workspace and declares an agent target; the shell does the rest: the
 * sidebar's agent rows, the skills page's place menu, and the extension catalog
 * entry all read these. This plugin registers the machine-wide place only;
 * nothing delivers into the agent's own project directory yet.
 */
import Kiro from "@lobehub/icons/es/Kiro"

import type { ExtensionDefinition, ExtensionIcon } from "@workspace/extensions"
import type { SkillPlace } from "@workspace/plugin-skills/contract"

import { kiroCliMessages } from "./messages.ts"

/** This integration's id; the kernel matches it against the manifest. */
export const KIRO_CLI_ID = "hub.target.kiro-cli"

/** The brand mark in its own colours. */
const KiroCliIcon: ExtensionIcon = Kiro.Color

/** The place Kiro CLI reads this machine's skills from, outside any workspace. */
const KIRO_CLI_PLACES: SkillPlace[] = [
  {
    id: "kiro-cli-global",
    labelKey: "kiroCli.tab",
    icon: KiroCliIcon,
    scope: "global",
    dir: ".kiro/skills",
    order: 80,
  },
]

/** Kiro CLI: the machine-wide skills directory, and the target beside it. */
export const kiroCliExtension: ExtensionDefinition = {
  manifest: {
    id: KIRO_CLI_ID,
    name: "Kiro CLI",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "agent",
    description: "Deliver skills to Kiro CLI.",
    icon: KiroCliIcon,
    defaultEnabled: true,
    permissions: ["assets.read"],
  },
  activate(scope) {
    /* The places register into the skills module, which is what makes this
       agent one the sidebar lists and the skills page reads. */
    scope.inject(["skills"], (ctx, plugins) => {
      const { registry } = plugins.skills
      ctx.effect(() => registry.register({ id: KIRO_CLI_ID, places: KIRO_CLI_PLACES }))
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
    })
    scope.contribute("locale", {
      id: "en",
      label: "English",
      messages: kiroCliMessages,
    })
  },
}
