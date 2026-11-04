/**
 * OpenAI's official Codex marketplace, as a built-in market source.
 *
 * It adapts the Codex index and nothing else: switching it off takes its rows
 * away, and packs already delivered to an agent stay where they are.
 */
import { BoxesIcon } from "lucide-react"

import type { ExtensionModule } from "@context-hub/extensions"

import { createCodexPluginsSource } from "./source.ts"

/** This module's own id; the kernel matches it against the manifest. */
export const MARKET_CODEX_PLUGINS_ID = "hub.market.codex-plugins"

/** The official Codex marketplace, off until a person enables it. */
export const marketCodexPluginsExtension: ExtensionModule = {
  name: MARKET_CODEX_PLUGINS_ID,
  manifest: {
    name: "Codex market",
    version: "0.1.0",
    kind: "code",
    category: "source",
    description: "List the packs in OpenAI's official Codex marketplace.",
    icon: BoxesIcon,
    defaultEnabled: true,
    permissions: ["network"],
  },
  inject: ["marketSources"],

  apply(ctx) {
    ctx.marketSources?.register(createCodexPluginsSource(ctx.host.net, ctx.host.log))
  },
}
