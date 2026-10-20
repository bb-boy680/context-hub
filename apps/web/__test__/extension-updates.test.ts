/**
 * The extension market's update settings and one check pass.
 *
 * The scheduler itself is a timer over these pure pieces; what is checked here
 * is the normalization the settings page relies on, and that a check installs
 * exactly the updates the settings allow.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ExtensionMarketIndex } from "@context-hub/core/extension-market"
import type { ExtensionView } from "@context-hub/extensions"

import {
  DEFAULT_EXTENSION_UPDATE_SETTINGS,
  readExtensionUpdateSettings,
  runExtensionCheck,
} from "../src/lib/extension-updates"
import {
  installMarketExtension,
  refreshExtensionMarket,
} from "../src/lib/extension-market"

vi.mock("../src/lib/extension-market", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/extension-market")>()
  return {
    ...actual,
    refreshExtensionMarket: vi.fn(),
    installMarketExtension: vi.fn(),
  }
})

const PLUGIN = {
  id: "demo.one",
  title: "One",
  description: "First",
  icon: "https://example.test/one.svg",
  author: "Acme",
  versions: [
    {
      version: "2.0.0",
      engines: { contextHub: ">=0.0.1 <0.7.0" },
      source: { type: "git" as const, url: "https://example.test/repo" },
    },
  ],
}

const INDEX: ExtensionMarketIndex = { format: 1, title: "Market", plugins: [PLUGIN] }

const VIEW: ExtensionView = {
  manifest: {
    id: "demo.one",
    name: "One",
    version: "1.0.0",
    engines: { contextHub: ">=0.0.1 <0.7.0" },
    kind: "code",
    category: "integration",
    description: "First",
    icon: () => null,
  },
  enabled: true,
  status: "active",
  points: [],
  provides: [],
  stored: true,
}

function context(
  settings: unknown,
  entries: ExtensionView[] = [VIEW]
): Parameters<typeof runExtensionCheck>[0] {
  return {
    host: { version: "0.5.0", log: () => undefined },
    settings: { plugin: () => settings },
    extensions: { snapshot: () => ({ entries, revision: 1 }) },
  } as unknown as Parameters<typeof runExtensionCheck>[0]
}

beforeEach(() => {
  vi.mocked(refreshExtensionMarket).mockResolvedValue(INDEX)
  vi.mocked(installMarketExtension).mockReset()
  vi.mocked(installMarketExtension).mockResolvedValue({
    id: PLUGIN.id,
    version: "2.0.0",
    enabled: true,
    fresh: false,
  })
})

describe("readExtensionUpdateSettings", () => {
  it("uses the defaults for an absent or unusable value", () => {
    expect(readExtensionUpdateSettings(null)).toEqual(DEFAULT_EXTENSION_UPDATE_SETTINGS)
    expect(readExtensionUpdateSettings("daily")).toEqual(DEFAULT_EXTENSION_UPDATE_SETTINGS)
    expect(readExtensionUpdateSettings({})).toEqual(DEFAULT_EXTENSION_UPDATE_SETTINGS)
  })

  it("keeps the fields this build understands", () => {
    expect(
      readExtensionUpdateSettings({
        check: "daily",
        dailyAt: "07:30",
        autoUpdate: true,
        lastCheckAt: "2026-10-20T07:30:00.000Z",
      })
    ).toEqual({
      check: "daily",
      dailyAt: "07:30",
      autoUpdate: true,
      lastCheckAt: "2026-10-20T07:30:00.000Z",
    })
  })

  it("falls back per field instead of rejecting the document", () => {
    expect(
      readExtensionUpdateSettings({
        check: "weekly",
        dailyAt: "25:00",
        autoUpdate: "yes",
        lastCheckAt: "not a date",
      })
    ).toEqual(DEFAULT_EXTENSION_UPDATE_SETTINGS)
    expect(readExtensionUpdateSettings({ check: "startup" })).toEqual({
      check: "startup",
      dailyAt: "14:00",
      autoUpdate: false,
    })
  })
})

describe("runExtensionCheck", () => {
  it("reports the installed plugins that have an update", async () => {
    const outcome = await runExtensionCheck(context(null))

    expect(refreshExtensionMarket).toHaveBeenCalledTimes(1)
    expect(outcome).toEqual({ checked: 1, updated: [], failed: [] })
    expect(installMarketExtension).not.toHaveBeenCalled()
  })

  it("installs a compatible target when automatic updates are on", async () => {
    const outcome = await runExtensionCheck(context({ autoUpdate: true }))

    expect(installMarketExtension).toHaveBeenCalledTimes(1)
    expect(installMarketExtension).toHaveBeenCalledWith(
      expect.objectContaining({
        plugin: PLUGIN,
        version: PLUGIN.versions[0],
        hubVersion: "0.5.0",
      })
    )
    expect(outcome.updated).toEqual(["demo.one"])
  })

  it("never installs a listing whose only version is incompatible", async () => {
    vi.mocked(refreshExtensionMarket).mockResolvedValue({
      ...INDEX,
      plugins: [
        {
          ...PLUGIN,
          versions: [
            {
              ...PLUGIN.versions[0]!,
              version: "9.0.0",
              engines: { contextHub: ">=9.0.0" },
            },
          ],
        },
      ],
    })

    const outcome = await runExtensionCheck(context({ autoUpdate: true }))

    expect(outcome.checked).toBe(1)
    expect(installMarketExtension).not.toHaveBeenCalled()
  })

  it("keeps installing after one update fails", async () => {
    const second: ExtensionView = {
      ...VIEW,
      manifest: { ...VIEW.manifest, id: "demo.two", name: "Two" },
    }
    vi.mocked(refreshExtensionMarket).mockResolvedValue({
      ...INDEX,
      plugins: [
        PLUGIN,
        {
          ...PLUGIN,
          id: "demo.two",
          title: "Two",
        },
      ],
    })
    vi.mocked(installMarketExtension)
      .mockRejectedValueOnce(new Error("clone failed"))
      .mockResolvedValueOnce({
        id: "demo.two",
        version: "2.0.0",
        enabled: true,
        fresh: false,
      })

    const outcome = await runExtensionCheck(context({ autoUpdate: true }, [VIEW, second]))

    expect(outcome.updated).toEqual(["demo.two"])
    expect(outcome.failed).toEqual([{ name: "demo.one", reason: "clone failed" }])
    expect(installMarketExtension).toHaveBeenCalledTimes(2)
  })
})
