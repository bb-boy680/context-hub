import type { MenuItemConstructorOptions } from "electron"
import { describe, expect, it } from "vitest"

import { applicationMenuTemplate, type MenuActions } from "../src/menu.ts"

const actions: MenuActions = {
  reloadPage: () => undefined,
  checkForUpdates: () => undefined,
  restartApp: () => undefined,
  toggleDevTools: () => undefined,
  quit: () => undefined,
}

function flatten(items: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return items.flatMap((item) => [
    item,
    ...(Array.isArray(item.submenu) ? flatten(item.submenu) : []),
  ])
}

function labels(items: MenuItemConstructorOptions[]): string[] {
  return flatten(items)
    .map((item) => item.label)
    .filter((label): label is string => label !== undefined)
}

function roles(items: MenuItemConstructorOptions[]): string[] {
  return flatten(items)
    .map((item) => item.role)
    .filter((role): role is NonNullable<typeof role> => role !== undefined)
}

describe("applicationMenuTemplate", () => {
  it("offers updates and reload in a packaged Windows build", () => {
    const menu = applicationMenuTemplate({
      platform: "win32",
      updatesEnabled: true,
      dev: false,
      actions,
    })
    expect(labels(menu)).toEqual(
      expect.arrayContaining(["Check for Updates…", "Reload Page", "Quit"])
    )
    expect(labels(menu)).not.toContain("Restart App")
    expect(labels(menu)).not.toContain("Toggle DevTools")
  })

  it("offers developer actions but not updates in development", () => {
    const menu = applicationMenuTemplate({
      platform: "win32",
      updatesEnabled: false,
      dev: true,
      actions,
    })
    expect(labels(menu)).toEqual(
      expect.arrayContaining(["Restart App", "Toggle DevTools", "Reload Page"])
    )
    expect(labels(menu)).not.toContain("Check for Updates…")
  })

  it("keeps the macOS role menus", () => {
    const menu = applicationMenuTemplate({
      platform: "darwin",
      updatesEnabled: true,
      dev: false,
      actions,
    })
    expect(roles(menu)).toEqual(
      expect.arrayContaining(["appMenu", "editMenu", "windowMenu"])
    )
    expect(labels(menu)).toContain("Check for Updates…")
  })
})
