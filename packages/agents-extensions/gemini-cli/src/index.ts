/**
 * Gemini CLI as a Context Hub integration: the machine-wide skills directory
 * it reads, and the place this hub delivers skills to.
 *
 * Nothing here renders. The plugin declares an agent target and the place it
 * reads outside any workspace; the shell does the rest: the sidebar's agent
 * rows, the skills page's place menu, and the extension catalog entry all read
 * these. A project's skills reach this agent through the shared
 * `.agents/skills` directory the skills module already lists, so no workspace
 * place is declared here.
 */
import GeminiCLI from "@lobehub/icons/es/GeminiCLI"

import type { ExtensionDefinition, ExtensionIcon } from "@workspace/extensions"

import { geminiCliMessages } from "./messages.ts"

/** This integration's id; the kernel matches it against the manifest. */
export const GEMINI_CLI_ID = "hub.target.gemini-cli"

/** The place Gemini CLI reads this machine's skills from, outside any workspace. */
export const GEMINI_CLI_GLOBAL_PLACE = "gemini-cli-global"

/** The brand mark in its own colours. */
const GeminiCliIcon: ExtensionIcon = GeminiCLI.Color

/** Gemini CLI: the machine-wide skills directory, and the target that names it. */
export const geminiCliExtension: ExtensionDefinition = {
  manifest: {
    id: GEMINI_CLI_ID,
    name: "Gemini CLI",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "integration",
    description: "Deliver skills to Gemini CLI.",
    icon: GeminiCliIcon,
    defaultEnabled: true,
    permissions: ["assets.read"],
  },
  activate(scope) {
    /* The place comes first: the target below names it, so a consumer that
       reads one side always finds the other. */
    scope.contribute("skillLocation", {
      id: GEMINI_CLI_GLOBAL_PLACE,
      labelKey: "geminiCli.tab",
      icon: GeminiCliIcon,
      scope: "global",
      dir: ".gemini/skills",
      order: 40,
    })
    scope.contribute("target", {
      id: GEMINI_CLI_ID,
      displayName: "Gemini CLI",
      icon: GeminiCliIcon,
      supports: ["skill"],
      locations: [
        { label: "Skills", path: "~/.gemini/skills/<name>/SKILL.md" },
        { label: "Skills", path: ".agents/skills/<name>/SKILL.md" },
      ],
      format: "Markdown skills with YAML frontmatter",
      globalSkillLocation: GEMINI_CLI_GLOBAL_PLACE,
    })
    scope.contribute("locale", {
      id: "en",
      label: "English",
      messages: geminiCliMessages,
    })
  },
}
