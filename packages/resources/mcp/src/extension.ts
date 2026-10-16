/**
 * The module's headless half: its manifest, the service it publishes, and the
 * contributions that carry no rendering. The page arrives as an argument, so
 * this file can be loaded wherever the hub runs — a check runs it under plain
 * Node, which cannot parse JSX.
 */
import type { ComponentType } from "react"
import { ServerIcon } from "lucide-react"

import type { WorkspaceService } from "@context-hub/core/workspace"
import type { ExtensionDefinition } from "@context-hub/extensions"
import { MCP_SERVICE } from "./contract.ts"

import { mcpMessages } from "./messages.ts"
import { createMcpService } from "./registry.ts"

declare module "@deepseek-ai/cordis" {
  interface Context {
    /**
     * The form-owned workspace list; a workspace place is read inside the folder
     * this names, so the page rescans when it changes.
     */
    "hub.workspaces"?: WorkspaceService
  }
}

/**
 * The MCP module, with the page to mount at its route.
 *
 * @param page — the page a UI shell renders at `/mcp-servers`.
 */
export function mcpExtensionWith(page: ComponentType): ExtensionDefinition {
  return {
    manifest: {
      id: "hub.mcp.servers",
      name: "MCP servers",
      version: "0.1.0",
      apiVersion: "^0.1",
      kind: "code",
      category: "asset",
      description: "Declare the MCP servers agents may use, and where each is installed.",
      icon: ServerIcon,
      defaultEnabled: true,
      permissions: ["storage.self", "filesystem"],
      provides: [MCP_SERVICE],
    },
    activate(scope) {
      scope.provide(MCP_SERVICE, createMcpService())

      scope.contribute("nav", {
        path: "/mcp-servers",
        labelKey: "nav.mcpServers",
        icon: ServerIcon,
        group: "assets",
        order: 20,
      })
      scope.contribute("route", { path: "/mcp-servers", Component: page })
      scope.contribute("locale", { id: "en", label: "English", messages: mcpMessages })
    },
  }
}
