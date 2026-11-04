/**
 * The plugin market as a built-in extension: the page (added with its own
 * phase), the source registry every market extension registers into, and the
 * sidebar row that reaches it.
 */
import { StoreIcon } from "lucide-react"

import type { ExtensionModule } from "@context-hub/extensions"

import { MARKET_SOURCE_SERVICE, MarketSourceRegistry } from "./contract.ts"
import { marketPluginsEn, marketPluginsZh } from "./i18n/index.ts"
import { PluginsMarketPage } from "./page.tsx"

/** This module's own id; the kernel matches it against the manifest. */
export const MARKET_PLUGINS_ID = "hub.market.plugins"

/** The page extension is locked, so the sources that inject its registry always have one. */
export const marketPluginsExtension: ExtensionModule = {
  name: MARKET_PLUGINS_ID,
  manifest: {
    name: "Plugin market",
    version: "0.1.0",
    kind: "code",
    category: "source",
    description: "Browse the plugin markets this hub ships and install their packs.",
    icon: StoreIcon,
    defaultEnabled: true,
    locked: true,
    permissions: ["network"],
    provides: [MARKET_SOURCE_SERVICE],
  },

  /* The page needs the plugin library's services, and the sources need the
     registry this module publishes. Both are declared here so activation
     waits for them rather than registering a page over nothing. */
  inject: ["nav", "routes", "locales", "plugins", "catalog.plugins"],

  apply(ctx) {
    new MarketSourceRegistry(ctx)

    ctx.nav.register({
      path: "/market/plugins",
      labelKey: "market.plugins.nav",
      icon: StoreIcon,
      group: "market",
      order: 20,
    })
    ctx.routes.register({ path: "/market/plugins", Component: PluginsMarketPage })
    ctx.locales.register({ id: "en", label: "English", messages: marketPluginsEn })
    ctx.locales.register({ id: "zh-CN", label: "简体中文", messages: marketPluginsZh })
  },
}
