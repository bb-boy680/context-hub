/**
 * Codex as a Context Hub integration: one instructions file, one TOML config,
 * the provider that reads and writes the servers in it, and the installer that
 * delivers plugin packs to Codex.
 *
 * Nothing here renders. The plugin declares an agent target and registers its MCP
 * provider and its plugin installer into the modules' registries, and the shell
 * does the rest: the MCP page's places, the catalog entry, the skills page's
 * install targets and the plugins page's menu all read these. Nothing here
 * imports either module at run time — the services carry the registries and the
 * toolkit — which is what lets this plugin work exactly like one downloaded from
 * GitHub.
 */
import Codex from "@lobehub/icons/es/Codex"

import type { ExtensionDefinition, ExtensionIcon } from "@context-hub/extensions"

import { codexInstaller } from "./installer.ts"
import { codexMessages } from "./messages.ts"
import { createCodexMcp } from "./provider.ts"

/** The brand mark in its own colours. */
const CodexIcon: ExtensionIcon = Codex.Color

/** Codex: one instructions file plus a TOML config for MCP. */
export const codexExtension: ExtensionDefinition = {
  manifest: {
    id: "hub.target.codex",
    name: "Codex",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "code",
    category: "agent",
    description: "Deliver skills, memory and MCP servers to Codex.",
    icon: CodexIcon,
    defaultEnabled: true,
    permissions: ["assets.read", "filesystem"],
  },
  activate(scope) {
    /* The MCP module publishes its service; this runs once it exists, and is
       unwound when it goes away. With that module disabled the rest of this
       extension still works: the target below needs nothing from it. */
    scope.inject(["mcp"], (ctx, plugins) => {
      const { registry, tools } = plugins.mcp
      ctx.effect(() => registry.register(createCodexMcp(tools)))
    })

    /* Likewise for the plugins module: it publishes the registry an installer
       registers into and the tools an installer is handed, so this extension
       needs no knowledge of where either lives. */
    scope.inject(["plugins"], (ctx, plugins) => {
      const { registry } = plugins.plugins
      ctx.effect(() => registry.register(codexInstaller))
    })

    scope.contribute("target", {
      id: "hub.target.codex",
      displayName: "Codex",
      icon: CodexIcon,
      supports: ["skill", "mcp", "memory"],
      locations: [
        { label: "Instructions", path: "~/.codex/AGENTS.md" },
        { label: "Config", path: "~/.codex/config.toml" },
      ],
      format: "Markdown instructions; TOML for configuration and MCP servers",
    })
    scope.contribute("locale", {
      id: "en",
      label: "English",
      messages: codexMessages,
    })
  },
}

export { createCodexMcp } from "./provider.ts"
export { codexInstaller } from "./installer.ts"
