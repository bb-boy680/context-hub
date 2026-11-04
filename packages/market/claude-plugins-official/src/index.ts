/**
 * Anthropic's official Claude Code marketplace, as a built-in market source.
 *
 * The extension owns its adapter and its cache and nothing else: it registers
 * one source into the market page's registry. Switching it off takes the rows
 * away; packs already delivered to an agent are untouched.
 */
import { createElement } from "react"

import type { ExtensionIcon, ExtensionModule } from "@context-hub/extensions"

import { SOURCE_MARK, SOURCE_NAME, createClaudePluginsSource } from "./source.ts"

/** This module's own id; the kernel matches it against the manifest. */
export const MARKET_CLAUDE_PLUGINS_OFFICIAL_ID = "hub.market.claude-plugins-official"

/** The same mark the rail draws, so both places show one identity. */
const ClaudeMark: ExtensionIcon = ({ className, "aria-hidden": ariaHidden }) =>
  createElement("img", {
    src: SOURCE_MARK,
    alt: "",
    "aria-hidden": ariaHidden,
    className,
  })

/** The official Claude Code marketplace, built in and locked on. */
export const marketClaudePluginsOfficialExtension: ExtensionModule = {
  name: MARKET_CLAUDE_PLUGINS_OFFICIAL_ID,
  manifest: {
    name: SOURCE_NAME,
    version: "0.1.0",
    kind: "code",
    category: "source",
    description: {
      en: "Lists the plugins published in Anthropic's official Claude Code marketplace, with each entry's own description and icon. Installing one copies the pinned version into this hub's plugin library.",
      "zh-cn":
        "列出 Anthropic 官方 Claude Code 市场发布的插件，并显示各自的说明和图标。安装时按所选版本复制到本机的插件库。",
    },
    icon: ClaudeMark,
    defaultEnabled: true,
    locked: true,
    permissions: ["network"],
  },
  inject: ["marketSources"],

  apply(ctx) {
    ctx.marketSources?.register(createClaudePluginsSource(ctx.host.net, ctx.host.log))
  },
}
