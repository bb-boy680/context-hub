/**
 * Cursor as a Context Hub integration: the machine-wide skills directory it
 * reads, and the place this hub delivers skills to.
 *
 * Nothing here renders. The plugin registers the place it reads outside any
 * workspace and declares an agent target; the shell does the rest: the
 * sidebar's agent rows, the skills page's place menu, and the extension catalog
 * entry all read these. A project's skills reach this agent through the shared
 * `.agents/skills` directory the skills module already lists, so no workspace
 * place is registered here.
 */
import Cursor from "@lobehub/icons/es/Cursor"

import type { ExtensionDefinition, ExtensionIcon } from "@context-hub/extensions"
import type { SkillPlace } from "@context-hub/skills/contract"

import { cursorMessages } from "./messages.ts"

/** This integration's id; the kernel matches it against the manifest. */
export const CURSOR_ID = "hub.target.cursor"

/** The brand mark in its single form; this icon ships no colour variant. */
const CursorIcon: ExtensionIcon = Cursor

/** The place Cursor reads this machine's skills from, outside any workspace. */
const CURSOR_PLACES: SkillPlace[] = [
  {
    id: "cursor-global",
    labelKey: "cursor.tab",
    icon: CursorIcon,
    scope: "global",
    dir: ".cursor/skills",
    order: 30,
  },
]

/** Cursor: the machine-wide skills directory, and the target beside it. */
export const cursorExtension: ExtensionDefinition = {
  manifest: {
    id: CURSOR_ID,
    name: "Cursor",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "agent",
    description: "Deliver skills to Cursor.",
    icon: CursorIcon,
    defaultEnabled: true,
    permissions: ["assets.read"],
  },
  activate(scope) {
    /* The places register into the skills module, which is what makes this
       agent one the sidebar lists and the skills page reads. */
    scope.inject(["skills"], (ctx, plugins) => {
      const { registry } = plugins.skills
      ctx.effect(() => registry.register({ id: CURSOR_ID, places: CURSOR_PLACES }))
    })
    scope.contribute("target", {
      id: CURSOR_ID,
      displayName: "Cursor",
      icon: CursorIcon,
      supports: ["skill"],
      locations: [
        { label: "Skills", path: "~/.cursor/skills/<name>/SKILL.md" },
        { label: "Skills", path: ".agents/skills/<name>/SKILL.md" },
      ],
      format: "Markdown skills with YAML frontmatter",
    })
    scope.contribute("locale", {
      id: "en",
      label: "English",
      messages: cursorMessages,
    })
  },
}
