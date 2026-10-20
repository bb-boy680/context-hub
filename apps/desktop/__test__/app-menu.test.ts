import { describe, expect, it, vi } from "vitest"

import { appMenuTemplate } from "../src/app-menu.ts"

function options() {
  return {
    zh: true,
    updatesEnabled: true,
    send: vi.fn(),
    checkForUpdates: vi.fn(),
    quit: vi.fn(),
  }
}

describe("appMenuTemplate", () => {
  it("lists the rows in the requested order with two separators", () => {
    const items = appMenuTemplate(options())
    expect(
      items.map((item) => (item.type === "separator" ? "---" : item.label))
    ).toEqual([
      "关于 context-hub",
      "---",
      "检测更新",
      "重新加载",
      "刷新插件",
      "---",
      "退出",
    ])
  })

  it("sends page work to the renderer and runs the main-process rows", () => {
    const deps = options()
    const items = appMenuTemplate(deps)
    ;(items[0]?.click as () => void)()
    ;(items[2]?.click as () => void)()
    ;(items[3]?.click as () => void)()
    ;(items[4]?.click as () => void)()
    ;(items[6]?.click as () => void)()

    expect(deps.send).toHaveBeenNthCalledWith(1, "about")
    expect(deps.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(deps.send).toHaveBeenNthCalledWith(2, "reload-resources")
    expect(deps.send).toHaveBeenNthCalledWith(3, "refresh-plugins")
    expect(deps.quit).toHaveBeenCalledTimes(1)
  })

  it("disables the update row when this build has no feed", () => {
    const items = appMenuTemplate({ ...options(), updatesEnabled: false })
    expect(items[2]?.enabled).toBe(false)
  })

  it("uses the English labels when the page is English", () => {
    const items = appMenuTemplate({ ...options(), zh: false })
    expect(items.map((item) => item.label)).toEqual([
      "About Context Hub",
      undefined,
      "Check for Updates",
      "Reload",
      "Refresh Plugins",
      undefined,
      "Quit",
    ])
  })
})
