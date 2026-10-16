/**
 * Claude Code as a Context Hub integration, with the brand mark left out.
 *
 * The mark arrives as an argument because it comes from `@lobehub/icons`, whose
 * modules import each other without file extensions — a bundler resolves that
 * and plain Node does not, so a check could not load this file if the mark were
 * imported here. Everything else is here: where this agent reads, the places in
 * a workspace this hub delivers its skills to, and the provider that reads and
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
import type { ExtensionIcon, ExtensionModule } from "@context-hub/extensions"
import type { PromptPlace } from "@context-hub/prompts/contract"
import type { SkillPlace } from "@context-hub/skills/contract"

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

export { createClaudeCodeMcp } from "./provider.ts"
export { claudeCodeInstaller } from "./installer.ts"

/**
 * The places this agent reads skills from: a project's directory, and the one
 * outside it.
 */
function skillPlaces(icon: ExtensionIcon): SkillPlace[] {
  return [
    {
      id: "claude-code",
      labelKey: "claudeCode.tab",
      icon,
      scope: "workspace",
      dir: CLAUDE_CODE_SKILL_DIR,
      order: 20,
    },
    {
      id: "claude-code-global",
      labelKey: "claudeCode.tab",
      icon,
      scope: "global",
      dir: CLAUDE_CODE_SKILL_DIR,
      order: 20,
    },
  ]
}

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
function promptPlaces(icon: ExtensionIcon): PromptPlace[] {
  return [
    {
      id: "claude-code",
      agent: CLAUDE_CODE_ID,
      labelKey: "claudeCode.tab",
      icon,
      scope: "workspace",
      commandDir: CLAUDE_CODE_COMMAND_DIR,
      ruleDir: CLAUDE_CODE_RULE_DIR,
      order: 20,
    },
    {
      id: "claude-code-global",
      agent: CLAUDE_CODE_ID,
      labelKey: "claudeCode.tab",
      icon,
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
}

/**
 * The Claude Code integration, with the brand mark to draw it with.
 *
 * @param icon — the mark every row, tab and menu draws for this agent.
 */
export function claudeCodeModuleWith(icon: ExtensionIcon): ExtensionModule {
  const places = skillPlaces(icon)
  const promptPlacesHere = promptPlaces(icon)

  return {
    name: CLAUDE_CODE_ID,
    manifest: {
      name: "Claude Code",
      version: "0.1.0",
      apiVersion: "^0.1",
      kind: "code",
      category: "agent",
      description: "Deliver skills, memory and MCP servers to Claude Code.",
      icon,
      defaultEnabled: true,
      permissions: ["assets.read", "assets.write", "filesystem"],
    },
    /* Every service this integration registers into, declared once. They are all
       properties of the context by the time `apply` runs, and until they are all
       there this extension waits rather than half-registering: an agent whose
       half its places are listed is harder to understand than one that says what
       it is waiting for. */
    inject: ["skills", "prompts", "mcp", "plugins", "targets", "locales"],

    apply(ctx) {
      /* Where this agent keeps skills is what makes it one the sidebar lists and
         the skills page reads. */
      ctx.skills.register({ id: CLAUDE_CODE_ID, places })

      /* The same places, told to the prompts module, which is what puts this
         agent in a prompt's install menu. */
      ctx.prompts.register({ id: CLAUDE_CODE_ID, places: promptPlacesHere })

      /* How this client's file is read and written. The toolkit comes off the
         same service, which is how it reaches a plugin installed as a folder:
         such a directory imports nothing, so nothing else can hand it over. */
      ctx.mcp.register(createClaudeCodeMcp(ctx.mcp.tools))

      /* How Claude Code installs a plugin is this integration's knowledge, not
         the plugins module's: that module owns the page and the library, and
         this registers the installer it drives. */
      ctx.plugins.register(claudeCodeInstaller)

      ctx.targets.register({
        id: CLAUDE_CODE_ID,
        displayName: "Claude Code",
        icon,
        supports: [...SUPPORTS],
        locations: [...GLOBAL_LOCATIONS, ...PROJECT_LOCATIONS].map((location) => ({
          label: location.label,
          path: location.path,
        })),
        format: "Markdown with YAML frontmatter; JSON for MCP servers and hooks",
      })

      ctx.locales.register({
        id: "en",
        label: "English",
        messages: claudeCodeMessages,
      })
    },
  }
}
