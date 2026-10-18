/**
 * The update schedule's decisions: when a check is due, which skills an
 * automatic update may replace, and what one check does to the library.
 *
 * The timer itself is not exercised here; these are the pieces it runs.
 */
import { describe, expect, it } from "vitest"

import type { SkillPage, SkillSummary } from "../src/store.ts"
import {
  DEFAULT_SKILL_UPDATE_SETTINGS,
  msUntilDue,
  readSkillUpdateSettings,
  runScheduledCheck,
  updatableNames,
  updateOutdated,
} from "../src/update-settings.ts"

/** One catalog row, with a recorded source and check answer when asked for. */
function row(
  name: string,
  upstream?: string,
  latest?: string,
  current = latest
): SkillSummary {
  return {
    name,
    description: `${name} skill`,
    tags: [],
    source: "registry",
    enabled: true,
    assets: [],
    updatedAt: "",
    ...(upstream === undefined
      ? {}
      : {
          upstream: {
            source: "owner/repo",
            sourceType: "git",
            skillPath: `skills/${name}/SKILL.md`,
            hash: upstream,
          },
        }),
    ...(latest === undefined
      ? {}
      : {
          checked: {
            at: "2026-01-01T00:00:00.000Z",
            latest,
            currentHash: current ?? latest,
          },
        }),
  }
}

function page(rows: SkillSummary[]): SkillPage {
  return {
    items: rows,
    total: rows.length,
    counts: { all: rows.length, local: 0, builtin: 0, registry: rows.length },
    root: "/tmp/skills",
  }
}

/** A store that records which skills it was asked to update. */
function updatingStore(rows: SkillSummary[], failing: string[] = []) {
  const updated: string[] = []
  return {
    updated,
    store: {
      list: async () => page(rows),
      updateFromUpstream: async (name: string) => {
        if (failing.includes(name)) throw new Error("source is down")
        updated.push(name)
      },
    },
  }
}

/** A store that records the order of a check and the updates after it. */
function checkingStore(rows: SkillSummary[], failing: string[] = []) {
  const calls: string[] = []
  const { store, updated } = updatingStore(rows, failing)
  return {
    calls,
    updated,
    store: {
      ...store,
      checkUpdates: async () => {
        calls.push("check")
        return { checked: rows.length, outdated: 0, modified: 0, failed: [] }
      },
    },
  }
}

describe("reading the stored settings", () => {
  it("defaults an absent or unreadable value", () => {
    expect(readSkillUpdateSettings(null), "null").toEqual(DEFAULT_SKILL_UPDATE_SETTINGS)
    expect(readSkillUpdateSettings("nonsense"), "a string").toEqual(
      DEFAULT_SKILL_UPDATE_SETTINGS
    )
    expect(readSkillUpdateSettings({}), "an empty object").toEqual(
      DEFAULT_SKILL_UPDATE_SETTINGS
    )
  })

  it("keeps every field it understands", () => {
    expect(
      readSkillUpdateSettings({
        check: "daily",
        dailyAt: "09:30",
        autoDownload: true,
        lastCheckAt: "2026-01-01T00:00:00.000Z",
      })
    ).toEqual({
      check: "daily",
      dailyAt: "09:30",
      autoDownload: true,
      lastCheckAt: "2026-01-01T00:00:00.000Z",
    })
  })

  it("rejects a timing, a time, and a value this build does not know", () => {
    expect(
      readSkillUpdateSettings({
        check: "weekly",
        dailyAt: "25:00",
        autoDownload: "yes",
        lastCheckAt: "never",
      })
    ).toEqual(DEFAULT_SKILL_UPDATE_SETTINGS)
  })

  it("drops only an unreadable timestamp", () => {
    expect(
      readSkillUpdateSettings({
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

describe("which skills an automatic update may replace", () => {
  it("takes only a skill whose source moved and whose files were not edited", () => {
    expect(
      updatableNames([
        row("a", "old", "new", "old"),
        row("b", "old", "new", "edited"),
        row("c", "same", "same", "same"),
        row("d"),
        row("e", "old"),
      ])
    ).toEqual(["a"])
  })
})

describe("updating what the source moved past", () => {
  it("installs every untouched outdated skill and reports what it could not", async () => {
    const { store, updated } = updatingStore(
      [row("a", "old", "new", "old"), row("b", "old", "new", "edited"), row("c", "old", "new", "old")],
      ["c"]
    )

    const outcome = await updateOutdated(store)

    expect(updated, "stores asked").toEqual(["a"])
    expect(outcome.updated, "reported success").toEqual(["a"])
    expect(outcome.failed.map((entry) => entry.name), "reported failure").toEqual(["c"])
    expect(outcome.failed[0]?.reason).toBe("source is down")
  })
})

describe("one scheduled check", () => {
  it("only asks the sources when automatic download is off", async () => {
    const { store, calls, updated } = checkingStore([row("a", "old", "new", "old")])

    const outcome = await runScheduledCheck(store, false)

    expect(calls, "calls").toEqual(["check"])
    expect(updated, "updates").toEqual([])
    expect(outcome).toEqual({ updated: [], failed: [] })
  })

  it("updates after asking when automatic download is on", async () => {
    const { store, calls, updated } = checkingStore([row("a", "old", "new", "old")])

    const outcome = await runScheduledCheck(store, true)

    expect(calls, "calls").toEqual(["check"])
    expect(updated, "updates").toEqual(["a"])
    expect(outcome.updated).toEqual(["a"])
  })
})
