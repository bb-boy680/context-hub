/**
 * Names and shapes the desktop main process and its preload both use.
 *
 * Kept free of Electron imports so the sandboxed preload can bundle the same
 * file as the main process.
 */
import type { UpdateState } from "./update-state.ts"

/** Renderer → main: which build this is and whether it has an update feed. */
export const DESKTOP_INFO_CHANNEL = "context-hub:desktop-info"

/** Renderer → main: the current update state, and the sidebar action. */
export const UPDATE_STATE_CHANNEL = "context-hub:update-state"
export const UPDATE_START_CHANNEL = "context-hub:update-start"

/** Preload → main: open the title-bar menu at a point in the page. */
export const APP_MENU_CHANNEL = "context-hub:app-menu"

/** Main → renderer: a menu row whose work belongs to the page. */
export const APP_MENU_ACTION_CHANNEL = "context-hub:app-menu-action"

/** Linux window controls; the other platforms draw their native buttons. */
export const WINDOW_MINIMIZE_CHANNEL = "context-hub:window-minimize"
export const WINDOW_MAXIMIZE_CHANNEL = "context-hub:window-maximize"
export const WINDOW_CLOSE_CHANNEL = "context-hub:window-close"
export const WINDOW_STATE_CHANNEL = "context-hub:window-state"

/** The height of the shell's own title bar, in CSS pixels. */
export const TITLEBAR_HEIGHT = 40

/** The menu rows the page has to carry out itself. */
export type DesktopMenuAction = "about" | "reload-resources" | "refresh-plugins"

/** Main → renderer: the state changed. */
export const UPDATE_CHANGED_CHANNEL = "context-hub:update-changed"

/** What the page can ask about the carrier it runs in. */
export interface DesktopInfo {
  version: string
  /** `process.platform`: win32, darwin or linux. */
  platform: string
  /** False in development and in builds without `app-update.yml`. */
  updatesEnabled: boolean
}

/** The shape preload exposes as `window.contextHub.desktop`. */
export interface DesktopBridge {
  info(): Promise<DesktopInfo>
  updateState(): Promise<UpdateState>
  /** available → start the download; ready → install now. */
  update(): Promise<void>
  /** Run a menu row that is the page's to carry out. */
  onMenuAction(listener: (action: DesktopMenuAction) => void): () => void
  subscribe(listener: (state: UpdateState) => void): () => void
}
