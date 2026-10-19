/**
 * Claude Code as a Context Hub integration: the brand mark, and the definition
 * that draws with it.
 *
 * The mark comes from `@lobehub/icons`, which is the one thing here that a
 * bundler can load and plain Node cannot — its modules import each other
 * without file extensions. So the definition lives in `./extension` and takes
 * the mark as an argument, the way the skills module takes its page.
 */
import ClaudeCode from "@lobehub/icons/es/ClaudeCode"

import type { ExtensionIcon } from "@context-hub/extensions"

import { claudeCodeModuleWith } from "./extension.ts"

/**
 * The brand mark in its own colours. It takes a `size` of its own as well, but
 * the shell sizes every icon with a class, and a `className` on the svg beats
 * the width/height it sets as attributes — so one mark fits a 14px tab, a
 * 15px menu row and a 20px catalog tile.
 *
 * It is declared once, here, and travels as this extension's manifest icon: the
 * MCP page draws it beside this client's places and the catalog draws it on the
 * row, both from that one declaration.
 */
const ClaudeCodeIcon: ExtensionIcon = ClaudeCode.Color

export { createClaudeCodeMcp } from "./provider.ts"
export { claudeCodeInstaller } from "./installer.ts"
export { CLAUDE_CODE_ID } from "./locations.ts"
export { claudeCodeModuleWith } from "./extension.ts"

export const claudeCodeExtension = claudeCodeModuleWith(ClaudeCodeIcon)
