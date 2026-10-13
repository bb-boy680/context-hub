/**
 * Windsurf as a Context Hub integration: the machine-wide skills directory it
 * reads, and the place this hub delivers skills to.
 *
 * Nothing here renders. The plugin registers the place it reads outside any
 * workspace and declares an agent target; the shell does the rest: the
 * sidebar's agent rows, the skills page's place menu, and the extension catalog
 * entry all read these. This plugin registers the machine-wide place only;
 * nothing delivers into the agent's own project directory yet.
 */
import Windsurf from "@lobehub/icons/es/Windsurf"

import type { ExtensionDefinition, ExtensionIcon } from "@workspace/extensions"
import type { SkillPlace } from "@workspace/plugin-skills/contract"

import { windsurfMessages } from "./messages.ts"

/** This integration's id; the kernel matches it against the manifest. */
export const WINDSURF_ID = "hub.target.windsurf"

/** The brand mark in its single form; this icon ships no colour variant. */
const WindsurfIcon: ExtensionIcon = Windsurf

/** The place Windsurf reads this machine's skills from, outside any workspace. */
const WINDSURF_PLACES: SkillPlace[] = [
  {
    id: "windsurf-global",
    labelKey: "windsurf.tab",
    icon: WindsurfIcon,
    scope: "global",
    dir: ".codeium/windsurf/skills",
    order: 70,
  },
]

/** Windsurf: the machine-wide skills directory, and the target beside it. */
export const windsurfExtension: ExtensionDefinition = {
  manifest: {
    id: WINDSURF_ID,
    name: "Windsurf",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "agent",
    description: "Deliver skills to Windsurf.",
    icon: WindsurfIcon,
    defaultEnabled: true,
    permissions: ["assets.read"],
  },
  activate(scope) {
    /* The places register into the skills module, which is what makes this
       agent one the sidebar lists and the skills page reads. */
    scope.inject(["skills"], (ctx, plugins) => {
      const { registry } = plugins.skills
      ctx.effect(() => registry.register({ id: WINDSURF_ID, places: WINDSURF_PLACES }))
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
    })
    scope.contribute("locale", {
      id: "en",
      label: "English",
      messages: windsurfMessages,
    })
  },
}
