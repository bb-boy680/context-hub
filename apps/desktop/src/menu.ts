/**
 * Native menus. Templates stay data so tests can read them without Electron.
 *
 * Updates and developer actions are omitted when they cannot work, rather than
 * leaving menu items that always fail.
 */
import type { MenuItemConstructorOptions } from "electron"

export interface MenuActions {
  openWindow: () => void
  reloadPage: () => void
  checkForUpdates: () => void
  restartApp: () => void
  toggleDevTools: () => void
  quit: () => void
}

export interface ApplicationMenuOptions {
  platform: NodeJS.Platform
  updatesEnabled: boolean
  dev: boolean
  actions: MenuActions
}

function updateItems(options: ApplicationMenuOptions): MenuItemConstructorOptions[] {
  if (!options.updatesEnabled) return []
  return [
    {
      label: "Check for Updates…",
      click: () => options.actions.checkForUpdates(),
    },
  ]
}

/** The application menu for the current platform and build form. */
export function applicationMenuTemplate(
  options: ApplicationMenuOptions
): MenuItemConstructorOptions[] {
  const updateItemsNow = updateItems(options)
  const devItems: MenuItemConstructorOptions[] = options.dev
    ? [
        { type: "separator" },
        { label: "Restart App", click: () => options.actions.restartApp() },
        {
          label: "Toggle DevTools",
          accelerator: "CmdOrCtrl+Shift+I",
          click: () => options.actions.toggleDevTools(),
        },
      ]
    : []

  if (options.platform === "darwin") {
    return [
      { role: "appMenu" },
      { role: "editMenu" },
      {
        label: "View",
        submenu: [
          {
            label: "Reload Page",
            accelerator: "CmdOrCtrl+R",
            click: () => options.actions.reloadPage(),
          },
          ...updateItemsNow,
          ...devItems,
        ],
      },
      { role: "windowMenu" },
    ]
  }

  return [
    {
      label: "File",
      submenu: [
        {
          label: "Reload Page",
          accelerator: "CmdOrCtrl+R",
          click: () => options.actions.reloadPage(),
        },
        ...updateItemsNow,
        ...devItems,
        { type: "separator" },
        { label: "Quit", click: () => options.actions.quit() },
      ],
    },
    { role: "editMenu" },
    ...(options.dev
      ? [
          {
            label: "View",
            submenu: [
              {
                label: "Toggle DevTools",
                accelerator: "CmdOrCtrl+Shift+I",
                click: () => options.actions.toggleDevTools(),
              },
            ],
          },
        ]
      : []),
  ]
}

/** The tray menu; it stays reachable after the window is hidden. */
export function trayMenuTemplate(options: {
  updatesEnabled: boolean
  dev: boolean
  actions: MenuActions
}): MenuItemConstructorOptions[] {
  return [
    { label: "Open Context Hub", click: () => options.actions.openWindow() },
    ...(options.updatesEnabled
      ? [
          { type: "separator" as const },
          {
            label: "Check for Updates",
            click: () => options.actions.checkForUpdates(),
          },
        ]
      : []),
    ...(options.dev
      ? [{ label: "Restart App", click: () => options.actions.restartApp() }]
      : []),
    { type: "separator" },
    { label: "Quit", click: () => options.actions.quit() },
  ]
}
