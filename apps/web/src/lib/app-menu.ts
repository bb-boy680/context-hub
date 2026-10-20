/**
 * The page half of the desktop application menu.
 *
 * The menu bar and its popup live in the Electron shell; the main process
 * sends the row that was chosen, and this module maps it to the page's own
 * capabilities. Keeping the mapping here lets it be tested without a DOM.
 */
import type { DesktopMenuAction } from "./desktop.ts"

/** Where the About row lands: the settings page's own About group. */
export const ABOUT_PATH = "/settings#about"

export interface AppMenuActions {
  about(): void
  /** Re-reads the skill and plugin libraries. */
  reloadResources(): Promise<void>
  /** Fetches the official market index again. */
  refreshPlugins(): Promise<void>
}

/**
 * Run one action. Async work is returned so the caller can report its outcome;
 * `about` is synchronous and returns nothing.
 */
export function runAppMenuAction(
  action: DesktopMenuAction,
  actions: AppMenuActions
): void | Promise<void> {
  switch (action) {
    case "about":
      actions.about()
      return
    case "reload-resources":
      return actions.reloadResources()
    case "refresh-plugins":
      return actions.refreshPlugins()
  }
}
