/**
 * Command Code as a Context Hub integration: the machine-wide skills directory
 * it reads, and the place this hub delivers skills to.
 *
 * Nothing here renders. The plugin declares an agent target and the place it
 * reads outside any workspace; the shell does the rest: the sidebar's agent
 * rows, the skills page's place menu, and the extension catalog entry all read
 * these. This plugin declares the machine-wide place only; nothing delivers
 * into the agent's own project directory yet.
 */
import CommandCode from "@lobehub/icons/es/CommandCode"

import type { ExtensionDefinition, ExtensionIcon } from "@workspace/extensions"

import { commandCodeMessages } from "./messages.ts"

/** This integration's id; the kernel matches it against the manifest. */
export const COMMAND_CODE_ID = "hub.target.command-code"

/** The place Command Code reads this machine's skills from, outside any workspace. */
export const COMMAND_CODE_GLOBAL_PLACE = "command-code-global"

/** The brand mark in its single form; this icon ships no colour variant. */
const CommandCodeIcon: ExtensionIcon = CommandCode

/** Command Code: the machine-wide skills directory, and the target that names it. */
export const commandCodeExtension: ExtensionDefinition = {
  manifest: {
    id: COMMAND_CODE_ID,
    name: "Command Code",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "integration",
    description: "Deliver skills to Command Code.",
    icon: CommandCodeIcon,
    defaultEnabled: true,
    permissions: ["assets.read"],
  },
  activate(scope) {
    /* The place comes first: the target below names it, so a consumer that
       reads one side always finds the other. */
    scope.contribute("skillLocation", {
      id: COMMAND_CODE_GLOBAL_PLACE,
      labelKey: "commandCode.tab",
      icon: CommandCodeIcon,
      scope: "global",
      dir: ".commandcode/skills",
      order: 120,
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
      globalSkillLocation: COMMAND_CODE_GLOBAL_PLACE,
    })
    scope.contribute("locale", {
      id: "en",
      label: "English",
      messages: commandCodeMessages,
    })
  },
}
