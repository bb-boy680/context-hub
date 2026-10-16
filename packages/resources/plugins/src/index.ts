/**
 * Plugins as a plugin: the library screen, its navigation entry, the service
 * every agent extension registers its installer into, and the English defaults
 * for the `plugins.*` namespace — all through the kernel's extension points, so
 * the shell ships no plugin-specific code.
 *
 * The library itself lives behind this package: `./vite` is the bridge that puts
 * the disk-backed library behind the dev server, and `./provider` is the service
 * an agent plugin registers how it installs a plugin into. Nothing here names an
 * agent — adding one is a plugin, not a case in this module.
 */
import { PlugIcon } from "lucide-react"

import type { WorkspaceService } from "@context-hub/core/workspace"
import type { ExtensionDefinition } from "@context-hub/extensions"

import { pluginsMessages } from "./messages.ts"
import { PluginsPage } from "./page.tsx"
import {
  createPluginInstallerRegistry,
  PLUGIN_SERVICE,
  type PluginService,
} from "./provider.ts"
import { createRemotePluginTools } from "./tools.ts"

declare module "@deepseek-ai/cordis" {
  interface Context {
    /**
     * The form-owned workspace list; a client resolves its own project files
     * against the folder this names, so the page rereads when it changes.
     */
    "hub.workspaces"?: WorkspaceService
  }
}

export { PluginsPage }
export * from "./contract.ts"
export * from "./revision.ts"
export * from "./records.ts"
export * from "./inspect.ts"
export * from "./provider.ts"
export { createRemotePluginTools } from "./tools.ts"
export { usePluginLibrary, packFile, packFiles, type PluginLibrary } from "./library.ts"
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
    provides: [PLUGIN_SERVICE],
  },
  activate(scope) {
    /* The service carries the registry agent plugins register into and the tools
       an installer is handed. It is published before anything else, so an agent
       plugin enabled in the same pass can register as soon as it activates. */
    const service: PluginService = {
      registry: createPluginInstallerRegistry(),
      tools: createRemotePluginTools(),
    }
    scope.provide(PLUGIN_SERVICE, service)

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
