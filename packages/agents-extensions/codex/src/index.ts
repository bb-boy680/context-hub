/**
 * Codex as a Context Hub integration: one instructions file, one TOML config,
 * and the provider that reads and writes the servers in it.
 *
 * Nothing here renders. The plugin declares an agent target and registers its
 * MCP provider into the MCP module's registry, and the shell does the rest: the
 * MCP page's places, the catalog entry, and the skills page's install targets
 * all read these. Nothing here imports the MCP module at run time — the service
 * carries the registry and the toolkit — which is what lets this plugin work
 * exactly like one downloaded from GitHub.
 */
import Codex from "@lobehub/icons/es/Codex"

import type { ExtensionDefinition, ExtensionIcon } from "@workspace/extensions"

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
    category: "integration",
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
