/**
 * Windsurf as a Context Hub integration: the machine-wide skills directory it
 * reads, and the place this hub delivers skills to.
 *
 * Nothing here renders. The plugin declares an agent target and the place it
 * reads outside any workspace; the shell does the rest: the sidebar's agent
 * rows, the skills page's place menu, and the extension catalog entry all read
 * these. This plugin declares the machine-wide place only; nothing delivers
 * into the agent's own project directory yet.
 */
import Windsurf from "@lobehub/icons/es/Windsurf"

import type { ExtensionDefinition, ExtensionIcon } from "@workspace/extensions"

import { windsurfMessages } from "./messages.ts"

/** This integration's id; the kernel matches it against the manifest. */
export const WINDSURF_ID = "hub.target.windsurf"

/** The place Windsurf reads this machine's skills from, outside any workspace. */
export const WINDSURF_GLOBAL_PLACE = "windsurf-global"

/** The brand mark in its single form; this icon ships no colour variant. */
const WindsurfIcon: ExtensionIcon = Windsurf

/** Windsurf: the machine-wide skills directory, and the target that names it. */
export const windsurfExtension: ExtensionDefinition = {
  manifest: {
    id: WINDSURF_ID,
    name: "Windsurf",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "integration",
    description: "Deliver skills to Windsurf.",
    icon: WindsurfIcon,
    defaultEnabled: true,
    permissions: ["assets.read"],
  },
  activate(scope) {
    /* The place comes first: the target below names it, so a consumer that
       reads one side always finds the other. */
    scope.contribute("skillLocation", {
      id: WINDSURF_GLOBAL_PLACE,
      labelKey: "windsurf.tab",
      icon: WindsurfIcon,
      scope: "global",
      dir: ".codeium/windsurf/skills",
      order: 70,
    })
    scope.contribute("target", {
      id: WINDSURF_ID,
      displayName: "Windsurf",
      icon: WindsurfIcon,
      supports: ["skill"],
      locations: [
        { label: "Skills", path: "~/.codeium/windsurf/skills/<name>/SKILL.md" },
        { label: "Skills", path: ".windsurf/skills/<name>/SKILL.md" },
      ],
      format: "Markdown skills with YAML frontmatter",
      globalSkillLocation: WINDSURF_GLOBAL_PLACE,
    })
    scope.contribute("locale", {
      id: "en",
      label: "English",
      messages: windsurfMessages,
    })
  },
}
