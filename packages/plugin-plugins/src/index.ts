/**
 * Plugins as a plugin: the catalog screen, its navigation entry, and the English
 * defaults for the `plugins.*` namespace — contributed through the kernel's
 * extension points, so the shell ships no plugin-specific code.
 *
 * The screen is the whole of it for now: it reads `./sample.ts` rather than a
 * catalog, installs nothing, and opens nothing. Reading a pack's own directory
 * and installing it into an agent come next, and they arrive as this module's
 * own service and host half rather than as shell code.
 */
import { PlugIcon } from "lucide-react"

import type { ExtensionDefinition } from "@workspace/extensions"

import { pluginsMessages } from "./messages.ts"
import { PluginsPage } from "./page.tsx"

export { PluginsPage }
export { samplePlugins, sampleInstalled } from "./sample.ts"
export * from "./types.ts"

export const pluginsExtension: ExtensionDefinition = {
  manifest: {
    id: "hub.plugin.catalog",
    name: "Plugins",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "asset",
    description: "Browse the packs this hub knows, and keep them in the agents that use them.",
    icon: PlugIcon,
    defaultEnabled: true,
    permissions: ["assets.read", "assets.write"],
  },
  activate(scope) {
    scope.contribute("nav", {
      path: "/plugins",
      labelKey: "nav.plugins",
      icon: PlugIcon,
      group: "assets",
      order: 30,
    })
    scope.contribute("route", {
      path: "/plugins",
      Component: PluginsPage,
    })
    scope.contribute("locale", {
      id: "en",
      label: "English",
      messages: pluginsMessages,
    })
  },
}
