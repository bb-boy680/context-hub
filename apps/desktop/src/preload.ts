/**
 * The only Electron API the page gets.
 *
 * The window is sandboxed with context isolation, so the page never sees
 * `ipcRenderer` itself — only the few calls exposed here.
 */
import { contextBridge, ipcRenderer } from "electron"

import {
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
import { installTitlebarMenu } from "./preload-menu.ts"
import type { UpdateState } from "./update-state.ts"

const desktop: DesktopBridge = {
  info: () => ipcRenderer.invoke(DESKTOP_INFO_CHANNEL) as Promise<DesktopInfo>,
  pickFolder: () =>
    ipcRenderer.invoke(PICK_FOLDER_CHANNEL) as Promise<string | null>,
  updateState: () =>
    ipcRenderer.invoke(UPDATE_STATE_CHANNEL) as Promise<UpdateState>,
  update: () => ipcRenderer.invoke(UPDATE_START_CHANNEL) as Promise<void>,
  onMenuAction: (listener) => {
    const handler = (_event: unknown, action: DesktopMenuAction): void =>
      listener(action)
    ipcRenderer.on(APP_MENU_ACTION_CHANNEL, handler)
    return () => {
      ipcRenderer.removeListener(APP_MENU_ACTION_CHANNEL, handler)
    }
  },
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
