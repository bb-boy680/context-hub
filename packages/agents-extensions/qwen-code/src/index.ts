/**
 * Qwen Code as a Context Hub integration: the machine-wide skills directory it
 * reads, and the place this hub delivers skills to.
 *
 * Nothing here renders. The plugin declares an agent target and the place it
 * reads outside any workspace; the shell does the rest: the sidebar's agent
 * rows, the skills page's place menu, and the extension catalog entry all read
 * these. This plugin declares the machine-wide place only; nothing delivers
 * into the agent's own project directory yet.
 */
import Qwen from "@lobehub/icons/es/Qwen"

import type { ExtensionDefinition, ExtensionIcon } from "@workspace/extensions"

import { qwenCodeMessages } from "./messages.ts"

/** This integration's id; the kernel matches it against the manifest. */
export const QWEN_CODE_ID = "hub.target.qwen-code"

/** The place Qwen Code reads this machine's skills from, outside any workspace. */
export const QWEN_CODE_GLOBAL_PLACE = "qwen-code-global"

/** The brand mark in its own colours. */
const QwenCodeIcon: ExtensionIcon = Qwen.Color

/** Qwen Code: the machine-wide skills directory, and the target that names it. */
export const qwenCodeExtension: ExtensionDefinition = {
  manifest: {
    id: QWEN_CODE_ID,
    name: "Qwen Code",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "agent",
    description: "Deliver skills to Qwen Code.",
    icon: QwenCodeIcon,
    defaultEnabled: true,
    permissions: ["assets.read"],
  },
  activate(scope) {
    /* The place comes first: the target below names it, so a consumer that
       reads one side always finds the other. */
    scope.contribute("skillLocation", {
      id: QWEN_CODE_GLOBAL_PLACE,
      labelKey: "qwenCode.tab",
      icon: QwenCodeIcon,
      scope: "global",
      dir: ".qwen/skills",
      order: 60,
    })
    scope.contribute("target", {
      id: QWEN_CODE_ID,
      displayName: "Qwen Code",
      icon: QwenCodeIcon,
      supports: ["skill"],
      locations: [
        { label: "Skills", path: "~/.qwen/skills/<name>/SKILL.md" },
        { label: "Skills", path: ".qwen/skills/<name>/SKILL.md" },
      ],
      format: "Markdown skills with YAML frontmatter",
      globalSkillLocation: QWEN_CODE_GLOBAL_PLACE,
    })
    scope.contribute("locale", {
      id: "en",
      label: "English",
      messages: qwenCodeMessages,
    })
  },
}
