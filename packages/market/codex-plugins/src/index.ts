/**
 * OpenAI's official Codex marketplace, as a built-in market source.
 *
 * It adapts the Codex index and nothing else: switching it off takes its rows
 * away, and packs already delivered to an agent stay where they are.
 */
import { createElement } from "react"

import type { ExtensionIcon, ExtensionModule } from "@context-hub/extensions"

import { SOURCE_MARK, SOURCE_NAME, createCodexPluginsSource } from "./source.ts"

/** This module's own id; the kernel matches it against the manifest. */
export const MARKET_CODEX_PLUGINS_ID = "hub.market.codex-plugins"

/** The same mark the rail draws, so both places show one identity. */
const CodexMark: ExtensionIcon = ({ className, "aria-hidden": ariaHidden }) =>
  createElement("img", {
    src: SOURCE_MARK,
    alt: "",
    "aria-hidden": ariaHidden,
    className,
  })

/** The official Codex marketplace, built in and locked on. */
export const marketCodexPluginsExtension: ExtensionModule = {
  name: MARKET_CODEX_PLUGINS_ID,
  manifest: {
    name: SOURCE_NAME,
    version: "0.1.0",
    kind: "code",
    category: "source",
    description: {
      en: "Lists the plugins published in OpenAI's official Codex marketplace. Each row's description and icon are read from the pack's own manifest; installing one copies the pinned version into this hub's plugin library.",
      "zh-cn":
        "列出 OpenAI 官方 Codex 市场发布的插件，每行的说明和图标取自插件包自己的清单。安装时按所选版本复制到本机的插件库。",
    },
    icon: CodexMark,
    defaultEnabled: true,
    locked: true,
    permissions: ["network"],
  },
  inject: ["marketSources"],

  apply(ctx) {
    ctx.marketSources?.register(createCodexPluginsSource(ctx.host.net, ctx.host.log))
  },
}
