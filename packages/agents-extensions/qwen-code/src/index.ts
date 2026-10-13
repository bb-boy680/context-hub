/**
 * Qwen Code as a Context Hub integration: the machine-wide skills directory it
 * reads, and the place this hub delivers skills to.
 *
 * Nothing here renders. The plugin registers the place it reads outside any
 * workspace and declares an agent target; the shell does the rest: the
 * sidebar's agent rows, the skills page's place menu, and the extension catalog
 * entry all read these. This plugin registers the machine-wide place only;
 * nothing delivers into the agent's own project directory yet.
 */
import Qwen from "@lobehub/icons/es/Qwen"

import type { ExtensionDefinition, ExtensionIcon } from "@workspace/extensions"
import type { SkillPlace } from "@workspace/plugin-skills/contract"

import { qwenCodeMessages } from "./messages.ts"

/** This integration's id; the kernel matches it against the manifest. */
export const QWEN_CODE_ID = "hub.target.qwen-code"

/** The brand mark in its own colours. */
const QwenCodeIcon: ExtensionIcon = Qwen.Color

/** The place Qwen Code reads this machine's skills from, outside any workspace. */
const QWEN_CODE_PLACES: SkillPlace[] = [
  {
    id: "qwen-code-global",
    labelKey: "qwenCode.tab",
    icon: QwenCodeIcon,
    scope: "global",
    dir: ".qwen/skills",
    order: 60,
  },
]

/** Qwen Code: the machine-wide skills directory, and the target beside it. */
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
    /* The places register into the skills module, which is what makes this
       agent one the sidebar lists and the skills page reads. */
    scope.inject(["skills"], (ctx, plugins) => {
      const { registry } = plugins.skills
      ctx.effect(() => registry.register({ id: QWEN_CODE_ID, places: QWEN_CODE_PLACES }))
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
    })
    scope.contribute("locale", {
      id: "en",
      label: "English",
      messages: qwenCodeMessages,
    })
  },
}
