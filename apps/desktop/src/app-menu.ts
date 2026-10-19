/**
 * The menu the title-bar button opens.
 *
 * This is only the template: the main process owns the native popup, the
 * update check and quitting. Rows whose work belongs to the page are sent back
 * to the renderer instead of being carried out here.
 */
import type { MenuItemConstructorOptions } from "electron"

import type { DesktopMenuAction } from "./bridge.ts"

export interface AppMenuOptions {
  /** Whether the page is showing Chinese; the labels follow it. */
  zh: boolean
  updatesEnabled: boolean
  send(action: DesktopMenuAction): void
  checkForUpdates(): void
  quit(): void
}

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
      label: zh ? "退出" : "Quit",
      click: options.quit,
    },
  ]
}
