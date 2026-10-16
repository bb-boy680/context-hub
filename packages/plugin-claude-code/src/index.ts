/**
 * Claude Code as a Context Hub integration: where it reads, the places in a
 * workspace this hub delivers its skills to, and the provider that reads and
 * writes its two MCP files.
 *
 * Nothing here renders. The integration registers the places this agent reads
 * skills in, adds its MCP provider to the MCP module's registry, and the shell
 * does the rest: the menu that picks which agent the hub delivers to, the
 * skills page's place tabs and install targets, the MCP page's places, and the
 * extension catalog entry all read these. What this extension does not declare
 * it does not get — and disabling it takes every one of them away, including
 * its MCP files, in the same step.
 */
import ClaudeCode from "@lobehub/icons/es/ClaudeCode"

import type { ExtensionDefinition, ExtensionIcon } from "@workspace/extensions"
import type { PromptPlace } from "@workspace/plugin-prompts/contract"
import type { SkillPlace } from "@workspace/plugin-skills/contract"

import { claudeCodeInstaller } from "./installer.ts"
import {
  CLAUDE_CODE_COMMAND_DIR,
  CLAUDE_CODE_GLOBAL_INSTRUCTION_FILE,
  CLAUDE_CODE_ID,
  CLAUDE_CODE_RULE_DIR,
  CLAUDE_CODE_SKILL_DIR,
  GLOBAL_LOCATIONS,
  PROJECT_LOCATIONS,
  SUPPORTS,
} from "./locations.ts"
import { claudeCodeMessages } from "./messages.ts"
import { createClaudeCodeMcp } from "./provider.ts"

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

/** The places this agent reads skills from: a project's directory, and the one outside it. */
const CLAUDE_CODE_PLACES: SkillPlace[] = [
  {
    id: "claude-code",
    labelKey: "claudeCode.tab",
    icon: ClaudeCodeIcon,
    scope: "workspace",
    dir: CLAUDE_CODE_SKILL_DIR,
    order: 20,
  },
  {
    id: "claude-code-global",
    labelKey: "claudeCode.tab",
    icon: ClaudeCodeIcon,
    scope: "global",
    dir: CLAUDE_CODE_SKILL_DIR,
    order: 20,
  },
]

export { createClaudeCodeMcp } from "./provider.ts"
export { claudeCodeInstaller } from "./installer.ts"

/**
 * Where this agent takes a prompt, under both roots it reads: commands as one
 * file each, rules as one file each.
 *
 * The two roots differ in more than their path, and that shows up here. Inside
 * a project the memory file is the repository's own `CLAUDE.md` — a file other
 * people commit and read — while outside one it is the machine's memory file,
 * which is only ever the person's own. Only the second is offered as something
 * a prompt can be added to, because an action that silently edits a shared
 * project file, under the same words as one that edits a private file, is the
 * kind of difference a row has to make visible rather than hide. A project rule
 * goes in as its own file instead, where nothing of anyone else's is touched.
 */
const CLAUDE_CODE_PROMPT_PLACES: PromptPlace[] = [
  {
    id: "claude-code",
    agent: CLAUDE_CODE_ID,
    labelKey: "claudeCode.tab",
    icon: ClaudeCodeIcon,
    scope: "workspace",
    commandDir: CLAUDE_CODE_COMMAND_DIR,
    ruleDir: CLAUDE_CODE_RULE_DIR,
    order: 20,
  },
  {
    id: "claude-code-global",
    agent: CLAUDE_CODE_ID,
    labelKey: "claudeCode.tab",
    icon: ClaudeCodeIcon,
    scope: "global",
    commandDir: CLAUDE_CODE_COMMAND_DIR,
    ruleDir: CLAUDE_CODE_RULE_DIR,
    /* The one file a prompt is added to here, named the way the menu that
       offers it reads. */
    documents: [
      {
        id: "claude",
        labelKey: "claudeCode.menu.instructions",
        file: CLAUDE_CODE_GLOBAL_INSTRUCTION_FILE,
      },
    ],
    order: 20,
  },
]

export const claudeCodeExtension: ExtensionDefinition = {
  manifest: {
    id: CLAUDE_CODE_ID,
    name: "Claude Code",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "agent",
    description: "Deliver skills, memory and MCP servers to Claude Code.",
    icon: ClaudeCodeIcon,
    defaultEnabled: true,
    permissions: ["assets.read", "assets.write", "filesystem"],
  },
  activate(scope) {
    /* The MCP module publishes its service; this runs once it exists, and is
       unwound when it goes away. With that module disabled the rest of this
       extension still works: skills do not depend on MCP.

       Nothing here imports the MCP module: the registry to register into and
       the toolkit to write a file with both arrive as `plugins.mcp`, which is
       the same way a plugin installed as a folder gets them. */
    scope.inject(["mcp"], (ctx, plugins) => {
      const { registry, tools } = plugins.mcp
      ctx.effect(() => registry.register(createClaudeCodeMcp(tools)))
    })

    /* How Claude Code installs a plugin is this extension's knowledge, not the
       plugins module's: that module owns the page and the library, and this
       registers the installer it drives, through the same service. */
    scope.inject(["plugins"], (ctx, plugins) => {
      const { registry } = plugins.plugins
      ctx.effect(() => registry.register(claudeCodeInstaller))
    })

    /* The places register into the skills module, which is what makes this
       agent one the sidebar lists and the skills page reads. */
    scope.inject(["skills"], (ctx, plugins) => {
      const { registry } = plugins.skills
      ctx.effect(() =>
        registry.register({ id: CLAUDE_CODE_ID, places: CLAUDE_CODE_PLACES })
      )
    })

    /* The same places, told to the prompts module, which is what puts this
       agent in a prompt's install menu. A separate inject because the two
       modules are separate: with one of them disabled the other still works. */
    scope.inject(["prompts"], (ctx, plugins) => {
      const { registry } = plugins.prompts
      ctx.effect(() =>
        registry.register({ id: CLAUDE_CODE_ID, places: CLAUDE_CODE_PROMPT_PLACES })
      )
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
    })
    scope.contribute("locale", {
      id: "en",
      label: "English",
      messages: claudeCodeMessages,
    })
  },
}