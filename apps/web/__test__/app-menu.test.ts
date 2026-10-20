/**
 * The page's half of the application menu.
 *
 * The menu itself lives in the Electron shell; these tests fix what each row
 * does once the shell hands it to the page.
 */
import { describe, expect, it, vi } from "vitest"

import { ABOUT_PATH, runAppMenuAction } from "../src/lib/app-menu"

function actions() {
  return {
    about: vi.fn(),
    reloadResources: vi.fn(async () => undefined),
    refreshPlugins: vi.fn(async () => undefined),
  }
}

describe("runAppMenuAction", () => {
  it("keeps About on the settings page's About group", () => {
    expect(ABOUT_PATH).toBe("/settings#about")
    const deps = actions()
    runAppMenuAction("about", deps)
    expect(deps.about).toHaveBeenCalledTimes(1)
  })

  it("returns the resource reload promise", async () => {
    const deps = actions()
    await runAppMenuAction("reload-resources", deps)
    expect(deps.reloadResources).toHaveBeenCalledTimes(1)
  })

  it("returns the market refresh promise", async () => {
    const deps = actions()
    await runAppMenuAction("refresh-plugins", deps)
    expect(deps.refreshPlugins).toHaveBeenCalledTimes(1)
  })
})
