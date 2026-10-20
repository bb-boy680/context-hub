/**
 * The commands shared by the title-bar menu and the tray menu.
 *
 * This is the only place the common rows are defined: the title-bar popup
 * shows them directly, and the tray prepends its way back to the window.
 * Labels follow the page language. An unavailable update feed keeps the row
 * in place but disabled, so both menus have the same shape everywhere.
 */
import type { MenuItemConstructorOptions } from "electron"

import type { DesktopMenuAction } from "./bridge.ts"

export interface AppMenuOptions {
  /** Whether the page is showing Chinese; the labels follow it. */
  zh: boolean
  updatesEnabled: boolean
  /** Runs a row whose work belongs to the page. */
  send(action: DesktopMenuAction): void
  checkForUpdates(): void
  restartApp(): void
  quit(): void
}

export interface TrayMenuOptions extends AppMenuOptions {
  openWindow(): void
}

/** The rows the title-bar menu and the tray have in common. */
export function appMenuTemplate(
  options: AppMenuOptions
): MenuItemConstructorOptions[] {
  const zh = options.zh
  return [
    {
      label: zh ? "关于 context-hub" : "About Context Hub",
      click: () => options.send("about"),
    },
    { type: "separator" },
    {
      label: zh ? "检测更新" : "Check for Updates",
      enabled: options.updatesEnabled,
      click: options.checkForUpdates,
    },
    {
      label: zh ? "重新加载" : "Reload",
      click: () => options.send("reload-resources"),
    },
    {
      label: zh ? "刷新插件" : "Refresh Plugins",
      click: () => options.send("refresh-plugins"),
    },
    { type: "separator" },
    {
      label: zh ? "重新启动" : "Restart App",
      click: options.restartApp,
    },
    {
      label: zh ? "退出" : "Quit",
      click: options.quit,
    },
  ]
}

/** The tray repeats every shared row and adds only the way back to the window. */
export function trayMenuTemplate(
  options: TrayMenuOptions
): MenuItemConstructorOptions[] {
  return [
    {
      label: options.zh ? "打开 Context Hub" : "Open Context Hub",
      click: options.openWindow,
    },
    { type: "separator" },
    ...appMenuTemplate(options),
  ]
}
