/**
 * Anthropic's official Claude Code marketplace, as a built-in market source.
 *
 * The extension owns its adapter and its cache and nothing else: it registers
 * one source into the market page's registry. Switching it off takes the rows
 * away; packs already delivered to an agent are untouched.
 */
import { GlobeIcon } from "lucide-react"

import type { ExtensionModule } from "@context-hub/extensions"

import { createClaudePluginsSource } from "./source.ts"

/** This module's own id; the kernel matches it against the manifest. */
export const MARKET_CLAUDE_PLUGINS_OFFICIAL_ID = "hub.market.claude-plugins-official"

/** The official Claude Code marketplace, off until a person enables it. */
export const marketClaudePluginsOfficialExtension: ExtensionModule = {
  name: MARKET_CLAUDE_PLUGINS_OFFICIAL_ID,
  manifest: {
    name: "Claude Code market",
    version: "0.1.0",
    kind: "code",
    category: "source",
    description: "List the packs in Anthropic's official Claude Code marketplace.",
    icon: GlobeIcon,
    defaultEnabled: true,
    permissions: ["network"],
  },
  inject: ["marketSources"],

  apply(ctx) {
    ctx.marketSources?.register(createClaudePluginsSource(ctx.host.net, ctx.host.log))
  },
}
