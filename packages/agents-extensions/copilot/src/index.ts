/**
 * GitHub Copilot as a Context Hub integration: the two files it reads inside a
 * repository, and the target that names them.
 *
 * Nothing here renders. The plugin declares an agent target and the shell does
 * the rest: the extension catalog entry, and this target's own detail dialog,
 * read this one declaration. GitHub Copilot is not given a skills place: the
 * project directories it reads are the shared `.agents/skills` the skills
 * module already lists, so a place of its own would name the same directory
 * twice.
 */
import GithubCopilot from "@lobehub/icons/es/GithubCopilot"

import type { ExtensionDefinition, ExtensionIcon } from "@workspace/extensions"

/** This integration's id; the kernel matches it against the manifest. */
export const COPILOT_ID = "hub.target.copilot"

/** The brand mark in its single form; this icon ships no colour variant. */
const CopilotIcon: ExtensionIcon = GithubCopilot

/** GitHub Copilot: repository-scoped instruction and prompt files. */
export const copilotExtension: ExtensionDefinition = {
  manifest: {
    id: COPILOT_ID,
    name: "GitHub Copilot",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "integration",
    description: "Deliver instructions and prompt files to Copilot workspaces.",
    icon: CopilotIcon,
    defaultEnabled: true,
    permissions: ["assets.read", "filesystem"],
  },
  activate(scope) {
    scope.contribute("target", {
      id: COPILOT_ID,
      displayName: "GitHub Copilot",
      icon: CopilotIcon,
      supports: ["skill", "memory"],
      locations: [
        { label: "Repository instructions", path: ".github/copilot-instructions.md" },
        { label: "Prompt files", path: ".github/prompts/<name>.prompt.md" },
      ],
      format: "Markdown and reusable .prompt.md files",
    })
  },
}
