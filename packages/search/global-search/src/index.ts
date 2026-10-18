/**
 * Global search as a plugin: the header control, the palette, and the two
 * searches whose pages the shell owns.
 *
 * Every other module offers its own rows through the kernel's `search` point;
 * this package never names a skill, an MCP server, a pack, a prompt, or a
 * variable. Settings and Extensions are the exception, because they are shell
 * pages rather than extensions — their providers live here.
 */
import { SearchIcon } from "lucide-react"

import type { ExtensionModule } from "@context-hub/extensions"

import { GlobalSearchButton } from "./button.tsx"
import { globalSearchMessages } from "./messages.ts"
import { extensionsContribution, settingsContribution } from "./search.ts"

/** This module's own id; the kernel matches it against the manifest. */
export const GLOBAL_SEARCH_ID = "hub.search.palette"

export const globalSearchExtension: ExtensionModule = {
  name: GLOBAL_SEARCH_ID,
  manifest: {
    name: "Global search",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "integration",
    description: "Search every module from anywhere with Ctrl+K.",
    icon: SearchIcon,
    defaultEnabled: true,
    permissions: [],
  },
  inject: ["header", "locales", "search", "i18n", "extensions"],

  apply(ctx) {
    ctx.header.register({
      id: "global-search",
      order: 10,
      Component: GlobalSearchButton,
    })
    ctx.locales.register({
      id: "en",
      label: "English",
      messages: globalSearchMessages,
    })

    /* The two shell pages have no extension to register their own search, so
       this package offers it. Both read at search time: the settings through
       the active locale, the extensions through the kernel's live catalog. */
    ctx.search.register(settingsContribution((key) => ctx.i18n.t(key)))
    ctx.search.register(
      extensionsContribution(() => ctx.extensions.snapshot().entries)
    )
  },
}
