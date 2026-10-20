/**
 * The platform's native application menu (File/Edit/View).
 *
 * The title-bar "Application" menu and the tray share their rows in
 * `app-menu.ts`; this file only owns the OS-level menu. Here updates and
 * developer actions are omitted when they cannot work, rather than leaving
 * menu items that always fail.
 */
import type { MenuItemConstructorOptions } from "electron"

export interface MenuActions {
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
