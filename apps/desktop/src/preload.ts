/**
 * The only Electron API the page gets.
 *
 * The window is sandboxed with context isolation, so the page never sees
 * `ipcRenderer` itself — only the few calls exposed here.
 */
import { contextBridge, ipcRenderer } from "electron"

import {
  APP_LANGUAGE_CHANNEL,
  APP_MENU_ACTION_CHANNEL,
  DESKTOP_INFO_CHANNEL,
  PICK_FOLDER_CHANNEL,
  UPDATE_CHANGED_CHANNEL,
  UPDATE_START_CHANNEL,
  UPDATE_STATE_CHANNEL,
  type DesktopBridge,
  type DesktopInfo,
  type DesktopMenuAction,
} from "./bridge.ts"
import { createMenuActionQueue } from "./menu-action-queue.ts"
import { installTitlebarMenu } from "./preload-menu.ts"
import type { UpdateState } from "./update-state.ts"

/* Listen from preload time: the page's subscriber arrives later, and a row
   chosen in that window must still run once it does. */
const menuActions = createMenuActionQueue<DesktopMenuAction>()
ipcRenderer.on(
  APP_MENU_ACTION_CHANNEL,
  (_event: unknown, action: DesktopMenuAction): void => {
    menuActions.push(action)
  }
)

const desktop: DesktopBridge = {
  info: () => ipcRenderer.invoke(DESKTOP_INFO_CHANNEL) as Promise<DesktopInfo>,
  pickFolder: () =>
    ipcRenderer.invoke(PICK_FOLDER_CHANNEL) as Promise<string | null>,
  updateState: () =>
    ipcRenderer.invoke(UPDATE_STATE_CHANNEL) as Promise<UpdateState>,
  update: () => ipcRenderer.invoke(UPDATE_START_CHANNEL) as Promise<void>,
  onMenuAction: (listener) => menuActions.subscribe(listener),
  setLanguage: (zh) => ipcRenderer.send(APP_LANGUAGE_CHANNEL, zh),
  subscribe: (listener) => {
    const handler = (_event: unknown, state: UpdateState): void => listener(state)
    ipcRenderer.on(UPDATE_CHANGED_CHANNEL, handler)
    return () => {
      ipcRenderer.removeListener(UPDATE_CHANGED_CHANNEL, handler)
    }
  },
}

contextBridge.exposeInMainWorld("contextHub", { desktop })

installTitlebarMenu()
