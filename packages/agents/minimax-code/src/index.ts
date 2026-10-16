/**
 * MiniMax Code as a Context Hub integration: the machine-wide skills directory
 * it reads, and the place this hub delivers skills to.
 *
 * Nothing here renders. The plugin registers the place it reads outside any
 * workspace and declares an agent target; the shell does the rest: the
 * sidebar's agent rows, the skills page's place menu, and the extension catalog
 * entry all read these. This plugin registers the machine-wide place only;
 * nothing delivers into the agent's own project directory yet.
 */
import Minimax from "@lobehub/icons/es/Minimax"

import type { ExtensionDefinition, ExtensionIcon } from "@context-hub/extensions"
import type { SkillPlace } from "@context-hub/skills/contract"

import { minimaxCodeMessages } from "./messages.ts"

/** This integration's id; the kernel matches it against the manifest. */
export const MINIMAX_CODE_ID = "hub.target.minimax-code"

/** The brand mark in its own colours. */
const MinimaxCodeIcon: ExtensionIcon = Minimax.Color

/** The place MiniMax Code reads this machine's skills from, outside any workspace. */
const MINIMAX_CODE_PLACES: SkillPlace[] = [
  {
    id: "minimax-code-global",
    labelKey: "minimaxCode.tab",
    icon: MinimaxCodeIcon,
    scope: "global",
    dir: ".minimax/skills",
    order: 110,
  },
]

/** MiniMax Code: the machine-wide skills directory, and the target beside it. */
export const minimaxCodeExtension: ExtensionDefinition = {
  manifest: {
    id: MINIMAX_CODE_ID,
    name: "MiniMax Code",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "agent",
    description: "Deliver skills to MiniMax Code.",
    icon: MinimaxCodeIcon,
    defaultEnabled: true,
    permissions: ["assets.read"],
  },
  activate(scope) {
    /* The places register into the skills module, which is what makes this
       agent one the sidebar lists and the skills page reads. */
    scope.inject(["skills"], (ctx, plugins) => {
      const { registry } = plugins.skills
      ctx.effect(() => registry.register({ id: MINIMAX_CODE_ID, places: MINIMAX_CODE_PLACES }))
    })
    scope.contribute("target", {
      id: MINIMAX_CODE_ID,
      displayName: "MiniMax Code",
      icon: MinimaxCodeIcon,
      supports: ["skill"],
      locations: [
        { label: "Skills", path: "~/.minimax/skills/<name>/SKILL.md" },
        { label: "Skills", path: ".minimax/skills/<name>/SKILL.md" },
      ],
      format: "Markdown skills with YAML frontmatter",
    })
    scope.contribute("locale", {
      id: "en",
      label: "English",
      messages: minimaxCodeMessages,
    })
  },
}
