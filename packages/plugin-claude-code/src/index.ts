/**
 * Claude Code as a Context Hub integration: where it reads, and the place in a
 * workspace this hub delivers its skills to.
 *
 * Nothing here renders. The integration declares an agent target and the
 * workspace place that target reads, and the shell does the rest: the menu that
 * picks which agent the hub delivers to, the skills page's place tabs and
 * install targets, and the extension catalog entry all read these two
 * contributions. Disabling this extension takes every one of them away.
 */
import ClaudeCode from "@lobehub/icons/es/ClaudeCode"

import type { ExtensionDefinition, ExtensionIcon } from "@workspace/extensions"

import { claudeCodeMessages } from "./messages.ts"
import {
  CLAUDE_CODE_ID,
  CLAUDE_CODE_SKILL_DIR,
  GLOBAL_LOCATIONS,
  PROJECT_LOCATIONS,
  SUPPORTS,
} from "./locations.ts"

/**
 * The brand mark in its own colours. It takes a `size` of its own as well, but
 * the shell sizes every icon with a class, and a `className` on the svg beats
 * the width/height it sets as attributes — so one mark fits a 14px tab, a
 * 15px menu row and a 20px catalog tile.
 */
const ClaudeCodeIcon: ExtensionIcon = ClaudeCode.Color

/** The place this agent reads a workspace's skills from; the skills module lists it. */
export const CLAUDE_CODE_PLACE = "claude-code"

export const claudeCodeExtension: ExtensionDefinition = {
  manifest: {
    id: CLAUDE_CODE_ID,
    name: "Claude Code",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "integration",
    description: "Deliver skills, memory and MCP servers to Claude Code.",
    icon: ClaudeCodeIcon,
    defaultEnabled: true,
    permissions: ["assets.read", "assets.write", "filesystem"],
  },
  activate(scope) {
    /* The place comes first: the target below names it, so a consumer that
       reads one of the two always finds the other. */
    scope.contribute("skillLocation", {
      id: CLAUDE_CODE_PLACE,
      labelKey: "claudeCode.tab",
      icon: ClaudeCodeIcon,
      dir: CLAUDE_CODE_SKILL_DIR,
      order: 20,
    })
    scope.contribute("target", {
      id: CLAUDE_CODE_ID,
      displayName: "Claude Code",
      icon: ClaudeCodeIcon,
      supports: [...SUPPORTS],
      locations: [...GLOBAL_LOCATIONS, ...PROJECT_LOCATIONS].map((location) => ({
        label: location.label,
        path: location.path,
      })),
      format: "Markdown with YAML frontmatter; JSON for MCP servers and hooks",
      skillLocation: CLAUDE_CODE_PLACE,
    })
    scope.contribute("locale", {
      id: "en",
      label: "English",
      messages: claudeCodeMessages,
    })
  },
}
