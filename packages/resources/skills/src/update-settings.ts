/**
 * When this plugin checks its sources, and what it does with what it finds.
 *
 * The decisions are pure functions so the plugin's timer and the page's own
 * check button share one answer. The timer itself lives with the plugin, not
 * with the settings page: closing the page must not stop a schedule the person
 * chose, and disabling the plugin must take the schedule with it.
 */
import type { Context } from "@deepseek-ai/cordis"

import { modified, outdated, type SkillStore, type SkillSummary } from "./store.ts"

/** How a person asked update checks to be started. */
export type SkillCheckTiming = "manual" | "startup" | "daily"

/** What this plugin remembers about update checks, under its own settings key. */
export interface SkillUpdateSettings {
  check: SkillCheckTiming
  /** Local time of the daily check, `HH:MM`. */
  dailyAt: string
  autoDownload: boolean
  /** When the last daily check ran; absent for the other timings. */
  lastCheckAt?: string
}

/** What an untouched install does: nothing automatically. */
export const DEFAULT_SKILL_UPDATE_SETTINGS: SkillUpdateSettings = {
  check: "manual",
  dailyAt: "14:00",
  autoDownload: false,
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Whether a value is a local wall-clock time this build can schedule. */
function isTimeOfDay(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

/**
 * Read a stored value, keeping every field this build understands.
 *
 * @param value — the stored value, as the settings document returned it.
 * @returns the settings it describes.
 */
export function readSkillUpdateSettings(value: unknown): SkillUpdateSettings {
  const record =
    typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {}
  return {
    check:
      record.check === "startup" || record.check === "daily"
        ? record.check
        : "manual",
    dailyAt: isTimeOfDay(record.dailyAt)
      ? record.dailyAt
      : DEFAULT_SKILL_UPDATE_SETTINGS.dailyAt,
    autoDownload: record.autoDownload === true,
    ...(typeof record.lastCheckAt === "string" &&
    !Number.isNaN(Date.parse(record.lastCheckAt))
      ? { lastCheckAt: record.lastCheckAt }
      : {}),
  }
}

/**
 * How long until this timing next wants a check.
 *
 * A daily check is anchored to a local wall-clock time rather than to a period
 * since the last run: the person chose 14:00, so that is when it happens. When
 * that slot has already passed and no check covered it, the answer is 0 — the
 * schedule catches up once instead of waiting a whole day.
 *
 * @param timing — the chosen timing.
 * @param lastCheckAt — when the last scheduled check ran, if it ever did.
 * @param now — the current time in milliseconds.
 * @param dailyAt — local `HH:MM` time the daily check is due.
 * @returns milliseconds to wait, or `null` when this timing never runs by itself.
 */
export function msUntilDue(
  timing: SkillCheckTiming,
  lastCheckAt: string | undefined,
  now: number,
  dailyAt: string
): number | null {
  if (timing === "manual") return null
  if (timing === "startup") return 0
  const slot = new Date(now)
  const [hour, minute] = dailyAt.split(":").map(Number)
  slot.setHours(hour, minute, 0, 0)
  if (now < slot.getTime()) return slot.getTime() - now
  const last = lastCheckAt === undefined ? Number.NaN : Date.parse(lastCheckAt)
  if (Number.isNaN(last) || last < slot.getTime()) return 0
  return slot.getTime() + DAY_MS - now
}

/** The skills an automatic update may replace: ahead upstream, untouched here. */
export function updatableNames(rows: readonly SkillSummary[]): string[] {
  return rows.filter((row) => outdated(row) && !modified(row)).map((row) => row.name)
}

/** What one automatic update pass changed, and what it could not. */
export interface UpdateOutcome {
  updated: string[]
  failed: { name: string; reason: string }[]
}

/**
 * Install the source's current revision over every untouched outdated skill.
 *
 * A skill edited here is deliberately left alone: an update would overwrite
 * that edit, so it stays for the person to decide. One failure does not stop
 * the rest.
 */
export async function updateOutdated(
  store: Pick<SkillStore, "list" | "updateFromUpstream">
): Promise<UpdateOutcome> {
  const page = await store.list()
  const updated: string[] = []
  const failed: UpdateOutcome["failed"] = []
  for (const name of updatableNames(page.items)) {
    try {
      await store.updateFromUpstream(name)
      updated.push(name)
    } catch (error) {
      failed.push({
        name,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return { updated, failed }
}

/** Check every source, then update what the settings allow. */
export async function runScheduledCheck(
  store: Pick<SkillStore, "checkUpdates" | "list" | "updateFromUpstream">,
  autoDownload: boolean
): Promise<UpdateOutcome> {
  await store.checkUpdates()
  if (!autoDownload) return { updated: [], failed: [] }
  return updateOutdated(store)
}

/**
 * Run update checks for as long as this plugin stays loaded.
 *
 * `manual` never arms anything. `startup` runs once per activation; `daily` runs
 * at the person's chosen local time and re-arms after each run. A form with no
 * skill library has nothing to ask, so it arms nothing either.
 *
 * @param ctx — this plugin's context; the schedule is disposed with it.
 * @param pluginId — the settings namespace the schedule reads and stamps.
 */
export function startUpdateSchedule(ctx: Context, pluginId: string): void {
  if (ctx.get("hub.skills") === undefined) return

  let timer: ReturnType<typeof setTimeout> | undefined
  let running = false
  let startupDone = false
  let disposed = false
  let lastTiming: SkillCheckTiming | undefined
  let lastDailyAt: string | undefined

  const read = () => readSkillUpdateSettings(ctx.settings.plugin(pluginId))

  const stopTimer = (): void => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }

  const report = (message: string): void => {
    ctx.get("host")?.log("warn", `skills: ${message}`)
  }

  async function run(): Promise<void> {
    const store = ctx.get("hub.skills")
    if (store === undefined || running || disposed) return
    running = true
    try {
      const outcome = await runScheduledCheck(store, read().autoDownload)
      if (outcome.failed.length > 0) {
        report(
          `could not update ${outcome.failed
            .map((entry) => entry.name)
            .join(", ")}`
        )
      }
      /* The page's shared read watches this library; tell it what changed. */
      await ctx.get("catalog.skills")?.reload()
    } catch (error) {
      report(`update check failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      const latest = read()
      if (!disposed && latest.check === "daily") {
        /* Stamped even when the check failed: a source that is down must not be
           asked again on every refresh. */
        ctx.settings.setPlugin(pluginId, {
          ...latest,
          lastCheckAt: new Date().toISOString(),
        })
      }
      running = false
      if (!disposed) tick()
    }
  }

  function tick(): void {
    stopTimer()
    if (disposed || running) return
    const current = read()
    if (current.check === "manual") return
    if (current.check === "startup") {
      if (startupDone) return
      startupDone = true
      void run()
      return
    }
    const wait = msUntilDue(
      current.check,
      current.lastCheckAt,
      Date.now(),
      current.dailyAt
    )
    if (wait === null) return
    timer = setTimeout(() => {
      timer = undefined
      void run()
    }, wait)
  }

  const onChange = (): void => {
    const current = read()
    if (lastTiming === current.check && lastDailyAt === current.dailyAt) return
    lastTiming = current.check
    lastDailyAt = current.dailyAt
    tick()
  }

  ctx.effect(() => {
    const initial = read()
    lastTiming = initial.check
    lastDailyAt = initial.dailyAt
    const off = ctx.on("settings/change", onChange)
    tick()
    return () => {
      disposed = true
      off()
      stopTimer()
    }
  })
}
