/**
 * The update schedule's decisions: when a check is due, which packs an
 * automatic update may replace, and what one check does to the library.
 *
 * The route itself is not exercised here; these are the pieces the timer and
 * the page's own buttons run, driven through a source that answers from memory.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Context } from "@deepseek-ai/cordis"

import type { PluginRecord, PluginUpdateSummary } from "../src/revision.ts"
import {
  DEFAULT_PLUGIN_UPDATE_SETTINGS,
  mergeUpdatePass,
  msUntilDue,
  readPluginUpdateSettings,
  runScheduledCheck,
  startUpdateSchedule,
  updatableNames,
  updateOutdated,
  type PluginUpdateSource,
} from "../src/update-settings.ts"

const AT = "2026-01-01T00:00:00.000Z"

/** One library record, with a recorded source and a check answer when asked for. */
function record(
  name: string,
  revision = "same",
  latest?: string,
  current = revision
): PluginRecord {
  return {
    name,
    version: "0.1.0",
    description: `${name} pack`,
    tags: [],
    source: { kind: "url", url: "owner/repo", revision },
    hash: revision,
    icon: "",
    assets: [],
    installedAt: AT,
    updatedAt: AT,
    ...(latest === undefined
      ? {}
      : { checked: { at: AT, latest, currentHash: current } }),
  }
}

/** A pack collected from a directory, which no source can be asked about. */
function local(name: string, latest: string): PluginRecord {
  return {
    ...record(name),
    source: { kind: "local", path: `/tmp/${name}` },
    checked: { at: AT, latest, currentHash: "same" },
  }
}

/** A source that records which packs it was asked to update. */
function updatingSource(records: readonly PluginRecord[], failing: string[] = []) {
  const updated: string[] = []
  return {
    updated,
    source: {
      list: async () => records,
      update: async (name: string) => {
        if (failing.includes(name)) throw new Error("source is down")
        updated.push(name)
      },
    },
  }
}

/** A source that records the order of a check and the updates after it. */
function checkingSource(records: readonly PluginRecord[], failing: string[] = []) {
  const calls: string[] = []
  const { source, updated } = updatingSource(records, failing)
  return {
    calls,
    updated,
    source: {
      ...source,
      checkUpdates: async () => {
        calls.push("check")
        return { checked: records.length, outdated: 0, modified: 0, failed: [], unanswerable: [] }
      },
    },
  }
}

/** The source a scheduled pass uses, with every call written down. */
function scheduleSource(records: readonly PluginRecord[] = []) {
  const calls: string[] = []
  const source: PluginUpdateSource = {
    list: async () => records,
    checkUpdates: async () => {
      calls.push("check")
      return { checked: 0, outdated: 0, modified: 0, failed: [], unanswerable: [] }
    },
    update: async (name: string) => {
      calls.push(`update:${name}`)
    },
    reload: async () => {
      calls.push("reload")
    },
  }
  return { calls, source }
}

/** The settings service the scheduler reads and stamps, without a kernel. */
function fakeContext(value: unknown) {
  let current = value
  const writes: unknown[] = []
  let cleanup: (() => void) | undefined
  const ctx = {
    settings: {
      plugin: () => current,
      setPlugin: (_id: string, next: unknown) => {
        current = next
        writes.push(next)
      },
    },
    get: (name: string) => (name === "host" ? { log: () => undefined } : undefined),
    on: () => () => undefined,
    effect: (callback: () => (() => void) | void) => {
      cleanup = callback() ?? undefined
    },
  }
  return {
    ctx: ctx as unknown as Context,
    writes,
    value: (): unknown => current,
    stop: (): void => cleanup?.(),
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe("reading the stored settings", () => {
  it("defaults an absent or unreadable value", () => {
    expect(readPluginUpdateSettings(null), "null").toEqual(DEFAULT_PLUGIN_UPDATE_SETTINGS)
    expect(readPluginUpdateSettings("nonsense"), "a string").toEqual(
      DEFAULT_PLUGIN_UPDATE_SETTINGS
    )
    expect(readPluginUpdateSettings({}), "an empty object").toEqual(
      DEFAULT_PLUGIN_UPDATE_SETTINGS
    )
  })

  it("keeps every field it understands", () => {
    expect(
      readPluginUpdateSettings({
        check: "daily",
        dailyAt: "09:30",
        autoDownload: true,
        lastCheckAt: AT,
      })
    ).toEqual({
      check: "daily",
      dailyAt: "09:30",
      autoDownload: true,
      lastCheckAt: AT,
    })
  })

  it("rejects a timing, a time, and a value this build does not know", () => {
    expect(
      readPluginUpdateSettings({
        check: "hourly",
        dailyAt: "25:00",
        autoDownload: "yes",
        lastCheckAt: "never",
      })
    ).toEqual(DEFAULT_PLUGIN_UPDATE_SETTINGS)
  })

  it("drops only an unreadable timestamp", () => {
    expect(
      readPluginUpdateSettings({
        check: "daily",
        dailyAt: "14:00",
        autoDownload: true,
        lastCheckAt: 42,
      })
    ).toEqual({ check: "daily", dailyAt: "14:00", autoDownload: true })
  })
})

describe("when a check is due", () => {
  /** A local wall-clock moment on 2026-01-02. */
  const at = (hour: number, minute: number) =>
    new Date(2026, 0, 2, hour, minute, 0, 0)
  const iso = (hour: number, minute: number) => at(hour, minute).toISOString()

  it("never runs a manual check by itself", () => {
    expect(msUntilDue("manual", undefined, at(9, 0).getTime(), "14:00")).toBeNull()
  })

  it("runs a startup check immediately", () => {
    expect(msUntilDue("startup", undefined, at(9, 0).getTime(), "14:00")).toBe(0)
    expect(msUntilDue("startup", iso(8, 0), at(9, 0).getTime(), "14:00")).toBe(0)
  })

  it("waits for today's time when it has not arrived", () => {
    expect(msUntilDue("daily", undefined, at(13, 0).getTime(), "14:00")).toBe(
      60 * 60 * 1000
    )
    expect(
      msUntilDue("daily", iso(9, 0), at(13, 0).getTime(), "14:00"),
      "a manual check does not skip the scheduled slot"
    ).toBe(60 * 60 * 1000)
    expect(msUntilDue("daily", undefined, at(0, 0).getTime(), "14:00")).toBe(
      14 * 60 * 60 * 1000
    )
  })

  it("runs once when today's time was missed", () => {
    expect(msUntilDue("daily", undefined, at(15, 0).getTime(), "14:00")).toBe(0)
    expect(
      msUntilDue("daily", iso(9, 0), at(15, 0).getTime(), "14:00"),
      "the last check was before the slot"
    ).toBe(0)
    expect(msUntilDue("daily", "not a date", at(15, 0).getTime(), "14:00")).toBe(0)
  })

  it("waits for tomorrow after a check covered today's slot", () => {
    expect(
      msUntilDue("daily", iso(14, 1), at(15, 0).getTime(), "14:00")
    ).toBe(23 * 60 * 60 * 1000)
  })
})

describe("which packs an automatic update may replace", () => {
  it("takes only a pack whose source moved and whose files were not edited", () => {
    expect(
      updatableNames([
        record("a", "old", "new", "old"),
        record("b", "old", "new", "edited"),
        record("c", "same", "same", "same"),
        record("d", "old"),
        local("e", "new"),
      ])
    ).toEqual(["a"])
  })
})

describe("updating what the source moved past", () => {
  it("installs every untouched outdated pack and reports what it could not", async () => {
    const { source, updated } = updatingSource(
      [
        record("a", "old", "new", "old"),
        record("b", "old", "new", "edited"),
        record("c", "old", "new", "old"),
      ],
      ["c"]
    )

    const outcome = await updateOutdated(source)

    expect(updated, "stores asked").toEqual(["a"])
    expect(outcome.updated, "reported success").toEqual(["a"])
    expect(outcome.failed.map((entry) => entry.name), "reported failure").toEqual(["c"])
    expect(outcome.failed[0]?.reason).toBe("source is down")
  })
})

describe("one scheduled check", () => {
  it("only asks the sources when automatic download is off", async () => {
    const { source, calls, updated } = checkingSource([record("a", "old", "new", "old")])

    const outcome = await runScheduledCheck(source, false)

    expect(calls, "calls").toEqual(["check"])
    expect(updated, "updates").toEqual([])
    expect(outcome).toEqual({ updated: [], failed: [] })
  })

  it("updates after asking when automatic download is on", async () => {
    const { source, calls, updated } = checkingSource([record("a", "old", "new", "old")])

    const outcome = await runScheduledCheck(source, true)

    expect(calls, "calls").toEqual(["check"])
    expect(updated, "updates").toEqual(["a"])
    expect(outcome.updated).toEqual(["a"])
  })
})

describe("folding an automatic pass into the page's summary", () => {
  const summary: PluginUpdateSummary = {
    checked: 3,
    outdated: 2,
    modified: 0,
    failed: [],
    unanswerable: [],
  }

  it("removes what was updated and adds what failed", () => {
    expect(
      mergeUpdatePass(summary, {
        updated: ["a"],
        failed: [{ name: "b", reason: "source is down" }],
      })
    ).toEqual({
      ...summary,
      outdated: 1,
      failed: [{ name: "b", reason: "source is down" }],
    })
  })

  it("never reports a negative outdated count", () => {
    expect(mergeUpdatePass({ ...summary, outdated: 0 }, { updated: ["a"], failed: [] }).outdated).toBe(0)
  })
})

describe("the schedule", () => {
  it("runs a startup check once and reloads the shared read", async () => {
    vi.useFakeTimers()
    const fake = fakeContext({
      check: "startup",
      dailyAt: "14:00",
      autoDownload: false,
    })
    const { source, calls } = scheduleSource()

    startUpdateSchedule(fake.ctx, "hub.plugin.catalog", source)
    await vi.advanceTimersByTimeAsync(0)

    expect(calls).toEqual(["check", "reload"])
    expect(fake.writes, "startup does not stamp").toEqual([])
    fake.stop()
  })

  it("runs the daily check at the chosen local time and stamps it", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 2, 13, 0, 0))
    const fake = fakeContext({
      check: "daily",
      dailyAt: "14:00",
      autoDownload: false,
    })
    const { source, calls } = scheduleSource()

    startUpdateSchedule(fake.ctx, "hub.plugin.catalog", source)
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)

    expect(calls).toEqual(["check", "reload"])
    const stored = fake.value() as { lastCheckAt?: string }
    expect(typeof stored.lastCheckAt).toBe("string")
    expect(Number.isNaN(Date.parse(stored.lastCheckAt ?? ""))).toBe(false)
    fake.stop()
  })

  it("stamps a failed daily check instead of retrying on every change", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 2, 13, 0, 0))
    const fake = fakeContext({
      check: "daily",
      dailyAt: "14:00",
      autoDownload: false,
    })
    const source: PluginUpdateSource = {
      list: async () => [],
      checkUpdates: async () => {
        throw new Error("source is down")
      },
      update: async () => undefined,
      reload: async () => undefined,
    }

    startUpdateSchedule(fake.ctx, "hub.plugin.catalog", source)
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)

    expect(fake.writes).toHaveLength(1)
    expect((fake.value() as { lastCheckAt?: string }).lastCheckAt).toBeTruthy()
    fake.stop()
  })
})
