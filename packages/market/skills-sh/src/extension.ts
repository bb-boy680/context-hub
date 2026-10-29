/**
 * skills.sh as a built-in market plugin. The plugin owns its page, its read
 * service, and its sidebar row; the shell only supplies the "market" group.
 */
import { StoreIcon } from "lucide-react"

import type { ExtensionModule } from "@context-hub/extensions"

import { marketEn, marketZh } from "./i18n/index.ts"
import { SkillsMarketPage } from "./page.tsx"
import { MARKET_SKILLS_SERVICE, SkillMarket } from "./service.ts"

/** This module's own id; the kernel matches it against the manifest. */
export const MARKET_SKILLS_SH_ID = "hub.market.skills-sh"

/** The built-in skills.sh market: locked, so it has no install or switch. */
export const marketSkillsShExtension: ExtensionModule = {
  name: MARKET_SKILLS_SH_ID,
  manifest: {
    name: "skills.sh",
    version: "0.1.0",
    kind: "code",
    category: "source",
    description: "Browse and install skills from the public skills.sh catalog.",
    icon: StoreIcon,
    defaultEnabled: true,
    locked: true,
    permissions: ["network", "assets.read", "assets.write"],
    provides: [MARKET_SKILLS_SERVICE],
  },
  inject: ["nav", "routes", "locales"],

  apply(ctx) {
    new SkillMarket(ctx)

    ctx.nav.register({
      path: "/market/skills",
      labelKey: "market.skillsSh",
      icon: StoreIcon,
      group: "market",
      order: 10,
    })
    ctx.routes.register({ path: "/market/skills", Component: SkillsMarketPage })
    ctx.locales.register({ id: "en", label: "English", messages: marketEn })
    ctx.locales.register({ id: "zh-CN", label: "简体中文", messages: marketZh })
  },
}
