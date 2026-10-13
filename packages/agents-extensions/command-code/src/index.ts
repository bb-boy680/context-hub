/**
 * Command Code as a Context Hub integration: the machine-wide skills directory
 * it reads, and the place this hub delivers skills to.
 *
 * Nothing here renders. The plugin registers the place it reads outside any
 * workspace and declares an agent target; the shell does the rest: the
 * sidebar's agent rows, the skills page's place menu, and the extension catalog
 * entry all read these. This plugin registers the machine-wide place only;
 * nothing delivers into the agent's own project directory yet.
 */
import CommandCode from "@lobehub/icons/es/CommandCode"

import type { ExtensionDefinition, ExtensionIcon } from "@workspace/extensions"
import type { SkillPlace } from "@workspace/plugin-skills/contract"

import { commandCodeMessages } from "./messages.ts"

/** This integration's id; the kernel matches it against the manifest. */
export const COMMAND_CODE_ID = "hub.target.command-code"

/** The brand mark in its single form; this icon ships no colour variant. */
const CommandCodeIcon: ExtensionIcon = CommandCode

/** The place Command Code reads this machine's skills from, outside any workspace. */
const COMMAND_CODE_PLACES: SkillPlace[] = [
  {
    id: "command-code-global",
    labelKey: "commandCode.tab",
    icon: CommandCodeIcon,
    scope: "global",
    dir: ".commandcode/skills",
    order: 120,
  },
]

/** Command Code: the machine-wide skills directory, and the target beside it. */
export const commandCodeExtension: ExtensionDefinition = {
  manifest: {
    id: COMMAND_CODE_ID,
    name: "Command Code",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "agent",
    description: "Deliver skills to Command Code.",
    icon: CommandCodeIcon,
    defaultEnabled: true,
    permissions: ["assets.read"],
  },
  activate(scope) {
    /* The places register into the skills module, which is what makes this
       agent one the sidebar lists and the skills page reads. */
    scope.inject(["skills"], (ctx, plugins) => {
      const { registry } = plugins.skills
      ctx.effect(() => registry.register({ id: COMMAND_CODE_ID, places: COMMAND_CODE_PLACES }))
    })
    scope.contribute("target", {
      id: COMMAND_CODE_ID,
      displayName: "Command Code",
      icon: CommandCodeIcon,
      supports: ["skill"],
      locations: [
        { label: "Skills", path: "~/.commandcode/skills/<name>/SKILL.md" },
        { label: "Skills", path: ".commandcode/skills/<name>/SKILL.md" },
      ],
      format: "Markdown skills with YAML frontmatter",
    })
    scope.contribute("locale", {
      id: "en",
      label: "English",
      messages: commandCodeMessages,
    })
  },
}
