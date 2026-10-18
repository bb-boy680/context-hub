/**
 * The skills module's extension definition, with the page left out.
 *
 * The page arrives as an argument because a check runs this under plain Node,
 * which cannot parse JSX — the same split the MCP module makes. What is here is
 * everything that does not render: the manifest, the service agent extensions
 * register their places into, and the navigation and language entries.
 */
import type { ComponentType } from "react"
import { FolderIcon, SparklesIcon } from "lucide-react"

import type { ExtensionModule } from "@context-hub/extensions"

import { SKILL_LIBRARY_SERVICE, SkillLibrary } from "./library-store.ts"
import { skillsMessages } from "./messages.ts"
import { SKILL_SERVICE, SkillService, type SkillPlace } from "./provider.ts"
import { skillSearch } from "./search.ts"
import { startUpdateSchedule } from "./update-settings.ts"

/** This module's own id; the kernel matches it against the manifest. */
export const SKILLS_ID = "hub.skill.catalog"

/** The place the skills CLI and this hub share, in every workspace. */
const SHARED_PLACE: SkillPlace = {
  id: "workspace",
  labelKey: "skills.tab.workspace",
  icon: FolderIcon,
  scope: "workspace",
  dir: ".agents/skills",
  order: 10,
}

/**
 * The skills module, with the page to mount at its route and the settings
 * section it contributes.
 *
 * @param page — the page a UI shell renders at `/skills`.
 * @param settingsSection — the controls a UI shell renders inside the settings
 *   page's section for this plugin.
 */
export function skillsModuleWith(
  page: ComponentType,
  settingsSection: ComponentType
): ExtensionModule {
  return {
    name: SKILLS_ID,
    manifest: {
      name: "Skills",
      version: "0.1.0",
      apiVersion: "^0.1",
      kind: "code",
      category: "asset",
      description: "Browse, import and install skills, and keep them in this workspace.",
      icon: SparklesIcon,
      defaultEnabled: true,
      permissions: ["assets.read", "assets.write"],
      provides: [SKILL_SERVICE, SKILL_LIBRARY_SERVICE],
    },
    inject: ["nav", "routes", "locales", "search", "settings", "settingsSections"],

    apply(ctx) {
      /* The places travel through the registry rather than a contribution point,
         so an agent integration registers into this module the same way whether
         it was built here or installed as a folder. This module's own place is
         the first one in it, and it is marked shared: it is in every workspace,
         so it is read whatever agents the sidebar chose — unlike an agent's
         places, which are read only while that agent is chosen.

         Constructing the service publishes it, and it belongs to this plugin —
         so the places it holds, including this module's own, go away with it. */
      const service = new SkillService(ctx)
      service.register({ id: SKILLS_ID, shared: true, places: [SHARED_PLACE] })

      /* The shared read of the library. Constructed here and read by name from
         the form's own startup, so the rows are already there when a page opens
         rather than being read again on the way in. */
      const library = new SkillLibrary(ctx)

      /* The schedule and the settings controls both belong to this plugin. The
         schedule is disposed with it; the settings page only draws the card. */
      ctx.settingsSections.register({
        id: "skills-updates",
        titleKey: "skills.settings.title",
        descriptionKey: "skills.settings.description",
        Component: settingsSection,
      })
      startUpdateSchedule(ctx, SKILLS_ID)

      /* The palette reaches this module through one function rather than by
         knowing how a skill row is built. */
      ctx.search.register(skillSearch(library))

      ctx.nav.register({
        path: "/skills",
        labelKey: "nav.skills",
        icon: SparklesIcon,
        group: "assets",
        order: 15,
      })
      ctx.routes.register({
        path: "/skills",
        Component: page,
      })
      ctx.locales.register({
        id: "en",
        label: "English",
        messages: skillsMessages,
      })
    },
  }
}
