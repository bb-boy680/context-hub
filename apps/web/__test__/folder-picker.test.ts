/**
 * Behaviour of the browser's own folder dialog — the only one a page can open.
 *
 * The page is told the folder's name and nothing else, so the three answers a
 * person can produce are the whole of this function: a folder, a dismissal, and
 * a browser that offers no such dialog. All three are reachable here by standing
 * a `window` up in place of the one a browser would have supplied, which is why
 * this file needs neither a DOM nor a component to render.
 */
import { afterEach, describe, expect, it } from "vitest"

import { pickFolder } from "../src/lib/folder-picker.ts"

const restores: (() => void)[] = []

/** Put a `window` on the global for one case, and take it away again. */
function withWindow(value: unknown): void {
  const held = globalThis as { window?: unknown }
  const original = held.window
  held.window = value
  restores.push(() => {
    if (original === undefined) delete held.window
    else held.window = original
  })
}

afterEach(() => {
  for (const restore of restores.splice(0)) restore()
})

describe("pickFolder", () => {
  it("says so when the browser has no folder dialog", async () => {
    withWindow({})
    expect(await pickFolder()).toBe("unsupported")
  })

  it("answers the folder's name, and nothing else about it", async () => {
    withWindow({ showDirectoryPicker: async () => ({ name: "marketing-site", kind: "directory" }) })
    expect(await pickFolder()).toEqual({ name: "marketing-site" })
  })

  /* Dismissing the dialog rejects; there is nothing to report. */
  it("answers nothing when the dialog is dismissed", async () => {
    withWindow({
      showDirectoryPicker: async () => {
        throw new DOMException("The user aborted a request.", "AbortError")
      },
    })
    expect(await pickFolder()).toBeNull()
  })
})
