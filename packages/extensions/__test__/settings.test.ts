/**
 * Settings live in one state document and are read back field by field: a
 * hand-edited value must not take the whole document down with it.
 */
import { describe, expect, it } from "vitest"

import { builtinExtensions } from "../src/builtin/index.ts"
import type { PlatformHost } from "../src/host.ts"
import { createHubKernel } from "../src/kernel.ts"
import {
  DEFAULT_SETTINGS,
  SETTINGS_DOCUMENT,
  readSettings,
} from "../src/settings.ts"

/** A host whose storage remembers one document, and every write it receives. */
function hostWith(
  initial?: unknown
): { host: PlatformHost; writes: [string, unknown][] } {
  const state = new Map<string, unknown>()
  if (initial !== undefined) state.set(SETTINGS_DOCUMENT, initial)
  const writes: [string, unknown][] = []
  return {
    writes,
    host: {
      form: "Test",
      version: "0.5.0",
      capabilities: { code: true, filesystem: false, network: false },
      storage: {
        read: (key) => state.get(key) ?? null,
        write: (key, value) => {
          state.set(key, value)
          writes.push([key, value])
        },
      },
      net: null,
      files: null,
      log: () => undefined,
    },
  }
}

describe("reading a settings document", () => {
  it("defaults an absent or unreadable document", () => {
    expect(readSettings(null), "null").toEqual(DEFAULT_SETTINGS)
    expect(readSettings("nonsense"), "a string").toEqual(DEFAULT_SETTINGS)
    expect(readSettings([]), "an array").toEqual(DEFAULT_SETTINGS)
  })

  it("keeps the fields it can read and defaults the rest", () => {
    expect(readSettings({ installMode: "link" }), "partial").toEqual({
      ...DEFAULT_SETTINGS,
      installMode: "link",
    })
    expect(
      readSettings({
        layout: "list",
        installMode: "copy",
        downloadRemoteImages: false,
      }),
      "complete"
    ).toEqual({
      layout: "list",
      installMode: "copy",
      downloadRemoteImages: false,
      plugins: {},
    })
  })

  it("does not accept a value this build does not know", () => {
    expect(
      readSettings({
        layout: "cards",
        installMode: "symlink",
        downloadRemoteImages: "yes",
      }),
      "unknown values"
    ).toEqual(DEFAULT_SETTINGS)
  })
})

describe("the settings service", () => {
  it("is available as soon as the kernel is composed", async () => {
    const { host } = hostWith()
    const kernel = await createHubKernel({ host, extensions: builtinExtensions })

    expect(kernel.ctx.settings.state, "initial settings").toEqual(DEFAULT_SETTINGS)
  })

  it("writes a changed field once and announces it once", async () => {
    const { host, writes } = hostWith()
    const kernel = await createHubKernel({ host, extensions: builtinExtensions })
    let announced = 0
    kernel.ctx.on("settings/change", () => {
      announced += 1
    })

    kernel.ctx.settings.set({ layout: "list" })

    expect(kernel.ctx.settings.state.layout, "new layout").toBe("list")
    expect(writes, "stored document").toEqual([
      [SETTINGS_DOCUMENT, { ...DEFAULT_SETTINGS, layout: "list" }],
    ])
    expect(announced, "announcements").toBe(1)
  })

  it("does not write a patch that changes nothing", async () => {
    const { host, writes } = hostWith()
    const kernel = await createHubKernel({ host, extensions: builtinExtensions })
    let announced = 0
    kernel.ctx.on("settings/change", () => {
      announced += 1
    })

    kernel.ctx.settings.set({ layout: DEFAULT_SETTINGS.layout })

    expect(writes, "writes").toEqual([])
    expect(announced, "announcements").toBe(0)
  })

  it("reads the stored document back on the next kernel", async () => {
    const { host } = hostWith({
      layout: "list",
      installMode: "copy",
      downloadRemoteImages: false,
    })
    const kernel = await createHubKernel({ host, extensions: builtinExtensions })

    expect(kernel.ctx.settings.state, "restored settings").toEqual({
      layout: "list",
      installMode: "copy",
      downloadRemoteImages: false,
      plugins: {},
    })
  })
})

describe("plugin settings", () => {
  it("reads a document without a namespace, or with one that is not an object", () => {
    expect(readSettings({}).plugins, "absent").toEqual({})
    expect(readSettings({ plugins: ["not", "an", "object"] }).plugins, "an array").toEqual({})
    expect(readSettings({ plugins: "nope" }).plugins, "a string").toEqual({})
  })

  it("stores one plugin's value and announces it once", async () => {
    const { host, writes } = hostWith()
    const kernel = await createHubKernel({ host, extensions: builtinExtensions })
    let announced = 0
    kernel.ctx.on("settings/change", () => {
      announced += 1
    })

    kernel.ctx.settings.setPlugin("hub.skill.catalog", {
      check: "daily",
      autoDownload: true,
    })

    expect(kernel.ctx.settings.plugin("hub.skill.catalog"), "read back").toEqual({
      check: "daily",
      autoDownload: true,
    })
    expect(writes, "stored document").toEqual([
      [
        SETTINGS_DOCUMENT,
        {
          ...DEFAULT_SETTINGS,
          plugins: {
            "hub.skill.catalog": { check: "daily", autoDownload: true },
          },
        },
      ],
    ])
    expect(announced, "announcements").toBe(1)
  })

  it("keeps plugin values when a shell setting is written afterwards", async () => {
    const { host, writes } = hostWith()
    const kernel = await createHubKernel({ host, extensions: builtinExtensions })
    kernel.ctx.settings.setPlugin("hub.skill.catalog", { check: "daily" })
    kernel.ctx.settings.set({ layout: "list" })

    expect(writes.at(-1)?.[1], "last write").toEqual({
      ...DEFAULT_SETTINGS,
      layout: "list",
      plugins: { "hub.skill.catalog": { check: "daily" } },
    })
  })

  it("does not write a plugin value that did not change", async () => {
    const { host, writes } = hostWith()
    const kernel = await createHubKernel({ host, extensions: builtinExtensions })
    kernel.ctx.settings.setPlugin("hub.skill.catalog", { check: "daily" })
    writes.length = 0

    kernel.ctx.settings.setPlugin("hub.skill.catalog", { check: "daily" })

    expect(writes, "writes").toEqual([])
  })

  it("reads plugin values back on the next kernel", async () => {
    const { host } = hostWith()
    const first = await createHubKernel({ host, extensions: builtinExtensions })
    first.ctx.settings.setPlugin("hub.skill.catalog", { check: "hourly" })

    const second = await createHubKernel({ host, extensions: builtinExtensions })

    expect(second.ctx.settings.plugin("hub.skill.catalog"), "restored").toEqual({
      check: "hourly",
    })
  })
})
