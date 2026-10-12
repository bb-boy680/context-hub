/**
 * MiniMax Code as a Context Hub integration: the machine-wide skills directory
 * it reads, and the place this hub delivers skills to.
 *
 * Nothing here renders. The plugin declares an agent target and the place it
 * reads outside any workspace; the shell does the rest: the sidebar's agent
 * rows, the skills page's place menu, and the extension catalog entry all read
 * these. This plugin declares the machine-wide place only; nothing delivers
 * into the agent's own project directory yet.
 */
import Minimax from "@lobehub/icons/es/Minimax"

import type { ExtensionDefinition, ExtensionIcon } from "@workspace/extensions"

import { minimaxCodeMessages } from "./messages.ts"

/** This integration's id; the kernel matches it against the manifest. */
export const MINIMAX_CODE_ID = "hub.target.minimax-code"

/** The place MiniMax Code reads this machine's skills from, outside any workspace. */
export const MINIMAX_CODE_GLOBAL_PLACE = "minimax-code-global"

/** The brand mark in its own colours. */
const MinimaxCodeIcon: ExtensionIcon = Minimax.Color

/** MiniMax Code: the machine-wide skills directory, and the target that names it. */
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
    /* The place comes first: the target below names it, so a consumer that
       reads one side always finds the other. */
    scope.contribute("skillLocation", {
      id: MINIMAX_CODE_GLOBAL_PLACE,
      labelKey: "minimaxCode.tab",
      icon: MinimaxCodeIcon,
      scope: "global",
      dir: ".minimax/skills",
      order: 110,
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
      globalSkillLocation: MINIMAX_CODE_GLOBAL_PLACE,
    })
    scope.contribute("locale", {
      id: "en",
      label: "English",
      messages: minimaxCodeMessages,
    })
  },
}
