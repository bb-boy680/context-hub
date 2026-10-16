/**
 * Gemini CLI as a Context Hub integration: the machine-wide skills directory
 * it reads, and the place this hub delivers skills to.
 *
 * Nothing here renders. The plugin registers the place it reads outside any
 * workspace and declares an agent target; the shell does the rest: the
 * sidebar's agent rows, the skills page's place menu, and the extension catalog
 * entry all read these. A project's skills reach this agent through the shared
 * `.agents/skills` directory the skills module already lists, so no workspace
 * place is registered here.
 */
import GeminiCLI from "@lobehub/icons/es/GeminiCLI"

import type { ExtensionDefinition, ExtensionIcon } from "@context-hub/extensions"
import type { SkillPlace } from "@context-hub/skills/contract"

import { geminiCliMessages } from "./messages.ts"

/** This integration's id; the kernel matches it against the manifest. */
export const GEMINI_CLI_ID = "hub.target.gemini-cli"

/** The brand mark in its own colours. */
const GeminiCliIcon: ExtensionIcon = GeminiCLI.Color

/** The place Gemini CLI reads this machine's skills from, outside any workspace. */
const GEMINI_CLI_PLACES: SkillPlace[] = [
  {
    id: "gemini-cli-global",
    labelKey: "geminiCli.tab",
    icon: GeminiCliIcon,
    scope: "global",
    dir: ".gemini/skills",
    order: 40,
  },
]

/** Gemini CLI: the machine-wide skills directory, and the target beside it. */
export const geminiCliExtension: ExtensionDefinition = {
  manifest: {
    id: GEMINI_CLI_ID,
    name: "Gemini CLI",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "agent",
    description: "Deliver skills to Gemini CLI.",
    icon: GeminiCliIcon,
    defaultEnabled: true,
    permissions: ["assets.read"],
  },
  activate(scope) {
    /* The places register into the skills module, which is what makes this
       agent one the sidebar lists and the skills page reads. */
    scope.inject(["skills"], (ctx, plugins) => {
      const { registry } = plugins.skills
      ctx.effect(() => registry.register({ id: GEMINI_CLI_ID, places: GEMINI_CLI_PLACES }))
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
    })
    scope.contribute("locale", {
      id: "en",
      label: "English",
      messages: geminiCliMessages,
    })
  },
}
