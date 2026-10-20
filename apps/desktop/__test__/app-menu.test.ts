import type { MenuItemConstructorOptions } from "electron"
import { describe, expect, it, vi } from "vitest"

import { appMenuTemplate, trayMenuTemplate } from "../src/app-menu.ts"

function options() {
  return {
    zh: true,
    updatesEnabled: true,
    send: vi.fn(),
    checkForUpdates: vi.fn(),
    restartApp: vi.fn(),
    quit: vi.fn(),
  }
}

function trayOptions() {
  return { ...options(), openWindow: vi.fn() }
}

function rows(items: MenuItemConstructorOptions[]): (string | undefined)[] {
  return items.map((item) => (item.type === "separator" ? "---" : item.label))
}

/** The parts of a row the two menus must agree on. */
function shape(items: MenuItemConstructorOptions[]) {
  return items.map((item) => ({
    label: item.label,
    type: item.type ?? null,
    enabled: item.enabled ?? true,
  }))
}

describe("appMenuTemplate", () => {
  it("lists the rows in the requested order with two separators", () => {
    expect(rows(appMenuTemplate(options()))).toEqual([
      "关于 context-hub",
      "---",
      "检测更新",
      "重新加载",
      "刷新插件",
      "---",
      "重新启动",
      "退出",
    ])
  })

  it("uses the English labels when the page is English", () => {
    expect(rows(appMenuTemplate({ ...options(), zh: false }))).toEqual([
      "About Context Hub",
      "---",
      "Check for Updates",
      "Reload",
      "Refresh Plugins",
      "---",
      "Restart App",
      "Quit",
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
    ;(items[7]?.click as () => void)()

    expect(deps.send).toHaveBeenNthCalledWith(1, "about")
    expect(deps.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(deps.send).toHaveBeenNthCalledWith(2, "reload-resources")
    expect(deps.send).toHaveBeenNthCalledWith(3, "refresh-plugins")
    expect(deps.restartApp).toHaveBeenCalledTimes(1)
    expect(deps.quit).toHaveBeenCalledTimes(1)
  })

  it("keeps the update row disabled when this build has no feed", () => {
    const items = appMenuTemplate({ ...options(), updatesEnabled: false })
    expect(items[2]?.enabled).toBe(false)
  })
})

describe("trayMenuTemplate", () => {
  it("prepends the way back to the window to the same rows", () => {
    expect(rows(trayMenuTemplate(trayOptions()))).toEqual([
      "打开 Context Hub",
      "---",
      "关于 context-hub",
      "---",
      "检测更新",
      "重新加载",
      "刷新插件",
      "---",
      "重新启动",
      "退出",
    ])
  })

  it("uses the English labels when the page is English", () => {
    expect(rows(trayMenuTemplate({ ...trayOptions(), zh: false }))).toEqual([
      "Open Context Hub",
      "---",
      "About Context Hub",
      "---",
      "Check for Updates",
      "Reload",
      "Refresh Plugins",
      "---",
      "Restart App",
      "Quit",
    ])
  })

  it("matches the application menu row for row", () => {
    const sharedZh = appMenuTemplate(options())
    const trayZh = trayMenuTemplate(trayOptions())
    expect(trayZh).toHaveLength(sharedZh.length + 2)
    expect(trayZh[0]?.label).toBe("打开 Context Hub")
    expect(trayZh[1]?.type).toBe("separator")
    expect(shape(trayZh.slice(2))).toEqual(shape(sharedZh))

    const sharedEn = appMenuTemplate({ ...options(), zh: false })
    const trayEn = trayMenuTemplate({ ...trayOptions(), zh: false })
    expect(trayEn).toHaveLength(sharedEn.length + 2)
    expect(trayEn[0]?.label).toBe("Open Context Hub")
    expect(trayEn[1]?.type).toBe("separator")
    expect(shape(trayEn.slice(2))).toEqual(shape(sharedEn))
  })

  it("wires the open row and every shared row", () => {
    const deps = trayOptions()
    const items = trayMenuTemplate(deps)
    ;(items[0]?.click as () => void)()
    ;(items[2]?.click as () => void)()
    ;(items[4]?.click as () => void)()
    ;(items[5]?.click as () => void)()
    ;(items[6]?.click as () => void)()
    ;(items[8]?.click as () => void)()
    ;(items[9]?.click as () => void)()

    expect(deps.openWindow).toHaveBeenCalledTimes(1)
    expect(deps.send).toHaveBeenNthCalledWith(1, "about")
    expect(deps.checkForUpdates).toHaveBeenCalledTimes(1)
    expect(deps.send).toHaveBeenNthCalledWith(2, "reload-resources")
    expect(deps.send).toHaveBeenNthCalledWith(3, "refresh-plugins")
    expect(deps.restartApp).toHaveBeenCalledTimes(1)
    expect(deps.quit).toHaveBeenCalledTimes(1)
  })

  it("keeps the update row disabled and restart available when there is no feed", () => {
    const items = trayMenuTemplate({
      ...trayOptions(),
      updatesEnabled: false,
    })
    expect(items[4]?.enabled).toBe(false)
    expect(items[8]?.label).toBe("重新启动")
  })
})
