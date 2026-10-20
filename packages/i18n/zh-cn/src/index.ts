/**
 * Simplified Chinese language pack: a declarative extension that adds the
 * `zh-CN` locale to Context Hub's language picker. The package carries data
 * only, so the kernel never runs code for it and every form can load it.
 */
import { LanguagesIcon } from "lucide-react"

import type { ExtensionModule } from "@context-hub/extensions"

import { messages } from "./messages.ts"

export { messages as zhCNMessages } from "./messages.ts"

/** Installable language pack; enabling it adds Simplified Chinese to the picker. */
export const simplifiedChineseLocale: ExtensionModule = {
  name: "hub.locale.zh-CN",
  manifest: {
    name: "简体中文",
    version: "0.1.0",
    kind: "declarative",
    category: "language",
    description: "Chinese (Simplified) interface language.",
    icon: LanguagesIcon,
    defaultEnabled: false,
    permissions: [],
  },
  declarative: { locale: [{ id: "zh-CN", label: "简体中文", messages }] },
}
