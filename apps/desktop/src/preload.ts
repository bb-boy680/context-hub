/**
 * The only Electron API the page gets.
 *
 * The window is sandboxed with context isolation, so the page never sees
 * `ipcRenderer` itself — only the few calls exposed here.
 */
import { contextBridge, ipcRenderer } from "electron"

import {
  DESKTOP_INFO_CHANNEL,
  UPDATE_CHANGED_CHANNEL,
  UPDATE_START_CHANNEL,
  UPDATE_STATE_CHANNEL,
  type DesktopBridge,
  type DesktopInfo,
} from "./bridge.ts"
import type { UpdateState } from "./update-state.ts"

const desktop: DesktopBridge = {
  info: () => ipcRenderer.invoke(DESKTOP_INFO_CHANNEL) as Promise<DesktopInfo>,
  updateState: () =>
    ipcRenderer.invoke(UPDATE_STATE_CHANNEL) as Promise<UpdateState>,
  update: () => ipcRenderer.invoke(UPDATE_START_CHANNEL) as Promise<void>,
  subscribe: (listener) => {
    const handler = (_event: unknown, state: UpdateState): void => listener(state)
    ipcRenderer.on(UPDATE_CHANGED_CHANNEL, handler)
    return () => {
      ipcRenderer.removeListener(UPDATE_CHANGED_CHANNEL, handler)
    }
  },
}

contextBridge.exposeInMainWorld("contextHub", { desktop })
