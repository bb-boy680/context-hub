/**
 * Cline as a Context Hub integration: the machine-wide skills directory it
 * reads, and the place this hub delivers skills to.
 *
 * Nothing here renders. The plugin registers the place it reads outside any
 * workspace and declares an agent target; the shell does the rest: the
 * sidebar's agent rows, the skills page's place menu, and the extension catalog
 * entry all read these. A project's skills reach this agent through the shared
 * `.agents/skills` directory the skills module already lists, so no workspace
 * place is registered here.
 */
import Cline from "@lobehub/icons/es/Cline"

import type { ExtensionDefinition, ExtensionIcon } from "@workspace/extensions"
import type { SkillPlace } from "@workspace/plugin-skills/contract"

import { clineMessages } from "./messages.ts"
import { createClineMcp } from "./provider.ts"

/** This integration's id; the kernel matches it against the manifest. */
export const CLINE_ID = "hub.target.cline"

/** The brand mark in its single form; this icon ships no colour variant. */
const ClineIcon: ExtensionIcon = Cline

/** The place Cline reads this machine's skills from, outside any workspace. */
const CLINE_PLACES: SkillPlace[] = [
  {
    id: "cline-global",
    labelKey: "cline.tab",
    icon: ClineIcon,
    scope: "global",
    dir: ".agents/skills",
    order: 50,
  },
]

/** Cline: the machine-wide skills directory, and the target beside it. */
export const clineExtension: ExtensionDefinition = {
  manifest: {
    id: CLINE_ID,
    name: "Cline",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "agent",
    description: "Deliver skills and MCP servers to Cline.",
    icon: ClineIcon,
    defaultEnabled: true,
    permissions: ["assets.read", "filesystem"],
  },
  activate(scope) {
    scope.inject(["mcp"], (ctx, plugins) => {
      const { registry, tools } = plugins.mcp
      ctx.effect(() => registry.register(createClineMcp(tools)))
    })

    /* The places register into the skills module, which is what makes this
       agent one the sidebar lists and the skills page reads. */
    scope.inject(["skills"], (ctx, plugins) => {
      const { registry } = plugins.skills
      ctx.effect(() => registry.register({ id: CLINE_ID, places: CLINE_PLACES }))
    })
    scope.contribute("target", {
      id: CLINE_ID,
      displayName: "Cline",
      icon: ClineIcon,
      supports: ["skill", "mcp"],
      locations: [
        { label: "Skills", path: "~/.agents/skills/<name>/SKILL.md" },
        { label: "Skills", path: ".agents/skills/<name>/SKILL.md" },
        { label: "MCP", path: "~/.cline/data/settings/cline_mcp_settings.json" },
      ],
      format: "Markdown skills with YAML frontmatter",
    })
    scope.contribute("locale", {
      id: "en",
      label: "English",
      messages: clineMessages,
    })
  },
}
