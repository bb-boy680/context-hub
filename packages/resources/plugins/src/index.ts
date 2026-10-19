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
import type { ExtensionModule } from "@context-hub/extensions"

import { PLUGINS_ID } from "./contract.ts"
import { pluginUpdateSource } from "./library.ts"
import { pluginsMessages } from "./messages.ts"
import { PluginsPage } from "./page.tsx"
import { PluginsSettingsSection } from "./settings-section.tsx"
import { startUpdateSchedule } from "./update-settings.ts"
import { PLUGIN_LIBRARY_SERVICE, PluginLibrary } from "./library-store.ts"
import { PLUGIN_SERVICE, PluginService } from "./provider.ts"
import { pluginSearch } from "./search.ts"
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
export { PluginLibrary, PLUGIN_LIBRARY_SERVICE } from "./library-store.ts"
export { usePluginLibrary, packFile, packFiles } from "./library.ts"
export * from "./types.ts"

export const pluginsExtension: ExtensionModule = {
  name: PLUGINS_ID,
  manifest: {
    name: "Plugins",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "asset",
    description: "Browse the packs this hub knows, and keep them in the agents that use them.",
    icon: PlugIcon,
    defaultEnabled: true,
    permissions: ["assets.read", "assets.write"],
    provides: [PLUGIN_SERVICE, PLUGIN_LIBRARY_SERVICE],
  },
  inject: ["nav", "routes", "locales", "search", "i18n", "settings", "settingsSections"],

  apply(ctx) {
    /* The service carries the registry agent plugins register into and the tools
       an installer is handed. The tools are this form's, so they are passed in;
       constructing the service publishes it, before anything else runs, so an
       agent plugin enabled in the same pass can register as soon as it
       activates. */
    new PluginService(ctx, createRemotePluginTools())

    /* The shared read of the library. Constructed here and read by name from the
       form's own startup, so the rows are already there when a page opens rather
       than being read again on the way in — and constructed after the registry,
       which is where it reads the clients from. It reads nothing yet: a module
       enabled is not a module asked to start probing a machine. */
    const library = new PluginLibrary(ctx)

    /* The settings page draws the card; the controls and the schedule belong to
       this plugin, so disabling it takes both away. */
    ctx.settingsSections.register({
      id: "plugins-updates",
      titleKey: "plugins.settings.title",
      descriptionKey: "plugins.settings.description",
      Component: PluginsSettingsSection,
    })
    startUpdateSchedule(ctx, PLUGINS_ID, pluginUpdateSource(() => library.reload()))

    /* The palette reaches this module through one function rather than by
       knowing how a record and a client's answer fold into a row. */
    ctx.search.register(pluginSearch(ctx, library))

    ctx.nav.register({
      path: "/plugins",
      labelKey: "nav.plugins",
      icon: PlugIcon,
      group: "assets",
      order: 30,
    })
    ctx.routes.register({
      path: "/plugins",
      Component: PluginsPage,
    })
    ctx.locales.register({
      id: "en",
      label: "English",
      messages: pluginsMessages,
    })
  },
}
