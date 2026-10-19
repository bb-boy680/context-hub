/**
 * The active locale survives a reload: the kernel is composed before any
 * extension has activated, so the language pack that answers for the stored id
 * contributes only later. Startup must not read that gap as "the pack is gone".
 */
import { describe, expect, it } from "vitest"

import { builtinExtensions } from "../src/builtin/index.ts"
import type { PlatformHost } from "../src/host.ts"
import { createHubKernel } from "../src/kernel.ts"
import type { ExtensionModule } from "../src/types.ts"

const chineseLocale: ExtensionModule = {
  name: "test.locale.zh",
  manifest: {
    name: "简体中文",
    version: "0.1.0",
    apiVersion: "^0.1",
    kind: "declarative",
    category: "language",
    description: "Test language pack.",
    icon: () => null,
    defaultEnabled: true,
  },
  declarative: {
    locale: [{ id: "zh-CN", label: "简体中文", messages: { greeting: "你好" } }],
  },
}

/** A host whose storage remembers one document, and every write it receives. */
function hostWithLocale(locale: string): { host: PlatformHost; writes: [string, unknown][] } {
  const state = new Map<string, unknown>([["locale", locale]])
  const writes: [string, unknown][] = []
  return {
    writes,
    host: {
      form: "Test",
      capabilities: { code: true, filesystem: false, network: false },
      storage: {
        read: (key) => state.get(key) ?? null,
        write: (key, value) => {
          state.set(key, value)
          writes.push([key, value])
        },
      },
      net: null,
      files: null,
      log: () => undefined,
    },
  }
}

describe("a stored locale whose pack activates with the kernel", () => {
  it("stays active after start, and is not rewritten to the fallback", async () => {
    const { host, writes } = hostWithLocale("zh-CN")
    const kernel = await createHubKernel({
      host,
      extensions: [...builtinExtensions, chineseLocale],
    })
    await kernel.start()

    expect(kernel.ctx.i18n.state.active, "active locale").toBe("zh-CN")
    expect(kernel.ctx.i18n.t("greeting"), "translated text").toBe("你好")
    expect(writes, "locale writes").not.toContainEqual(["locale", "en"])
  })

  it("still falls back once the pack is actually withdrawn", async () => {
    const { host, writes } = hostWithLocale("zh-CN")
    const kernel = await createHubKernel({
      host,
      extensions: [...builtinExtensions, chineseLocale],
    })
    await kernel.start()

    await kernel.ctx.extensions.disable("test.locale.zh")

    expect(kernel.ctx.i18n.state.active, "active locale").toBe("en")
    expect(writes, "locale writes").toContainEqual(["locale", "en"])
  })
})
