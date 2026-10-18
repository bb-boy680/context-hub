/**
 * When this plugin checks its sources, and what it does with what it finds.
 *
 * The decisions are pure functions so the plugin's timer and the page's own
 * check buttons share one answer. The timer itself lives with the plugin, not
 * with the settings page: closing the page must not stop a schedule the person
 * chose, and disabling the plugin must take the schedule with it.
 *
 * Unlike the skills library, this one reaches its records over the plugin route,
 * so the calls a pass makes arrive as a source rather than as one store. That
 * keeps this file free of React and of the route's own module, and lets a test
 * drive the schedule with no network at all.
 */
import type { Context } from "@deepseek-ai/cordis"

import {
  modified,
  outdated,
  type PluginRecord,
  type PluginUpdateSummary,
} from "./revision.ts"

/** How a person asked update checks to be started. */
export type PluginCheckTiming = "manual" | "startup" | "daily"

/** What this plugin remembers about update checks, under its own settings key. */
export interface PluginUpdateSettings {
  check: PluginCheckTiming
  /** Local time of the daily check, `HH:MM`. */
  dailyAt: string
  autoDownload: boolean
  /** When the last daily check ran; absent for the other timings. */
  lastCheckAt?: string
}

/** What an untouched install does: nothing automatically. */
export const DEFAULT_PLUGIN_UPDATE_SETTINGS: PluginUpdateSettings = {
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
export function readPluginUpdateSettings(value: unknown): PluginUpdateSettings {
  const record =
    typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {}
  return {
    check:
      record.check === "startup" || record.check === "daily"
        ? record.check
        : "manual",
    dailyAt: isTimeOfDay(record.dailyAt)
      ? record.dailyAt
      : DEFAULT_PLUGIN_UPDATE_SETTINGS.dailyAt,
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
  timing: PluginCheckTiming,
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

/** The packs an automatic update may replace: ahead upstream, untouched here. */
export function updatableNames(records: readonly PluginRecord[]): string[] {
  return records.filter((row) => outdated(row) && !modified(row)).map((row) => row.name)
}

/** What one automatic update pass changed, and what it could not. */
export interface PluginUpdatePass {
  updated: string[]
  failed: { name: string; reason: string }[]
}

/**
 * The calls a check pass makes.
 *
 * `reload` is the shared read's, because a pass ends by refreshing every page
 * watching the library.
 */
export interface PluginUpdateSource {
  list(): Promise<readonly PluginRecord[]>
  checkUpdates(): Promise<PluginUpdateSummary>
  update(name: string): Promise<unknown>
  reload(): Promise<void>
}

/**
 * Install the source's current revision over every untouched outdated pack.
 *
 * A pack edited here is deliberately left alone: an update would overwrite that
 * edit, so it stays for the person to decide. One failure does not stop the
 * rest.
 */
export async function updateOutdated(
  source: Pick<PluginUpdateSource, "list" | "update">
): Promise<PluginUpdatePass> {
  const records = await source.list()
  const updated: string[] = []
  const failed: PluginUpdatePass["failed"] = []
  for (const name of updatableNames(records)) {
    try {
      await source.update(name)
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
  source: Pick<PluginUpdateSource, "checkUpdates" | "list" | "update">,
  autoDownload: boolean
): Promise<PluginUpdatePass> {
  await source.checkUpdates()
  if (!autoDownload) return { updated: [], failed: [] }
  return updateOutdated(source)
}

/**
 * Fold an automatic pass into the summary the page's toast reports.
 *
 * Every pack the pass updated is no longer outdated, and every failure is one
 * the person should hear about alongside the source's own.
 */
export function mergeUpdatePass(
  summary: PluginUpdateSummary,
  pass: PluginUpdatePass
): PluginUpdateSummary {
  return {
    ...summary,
    outdated: Math.max(0, summary.outdated - pass.updated.length),
    failed: [...summary.failed, ...pass.failed],
  }
}

/**
 * Run update checks for as long as this plugin stays loaded.
 *
 * `manual` never arms anything. `startup` runs once per activation; `daily` runs
 * at the person's chosen local time and re-arms after each run. A form that
 * cannot reach the route still arms: the failure is reported and stamped the
 * same way, so a source that is down is not asked again on every refresh.
 *
 * @param ctx — this plugin's context; the schedule is disposed with it.
 * @param pluginId — the settings namespace the schedule reads and stamps.
 * @param source — the calls a check pass makes.
 */
export function startUpdateSchedule(
  ctx: Context,
  pluginId: string,
  source: PluginUpdateSource
): void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let running = false
  let startupDone = false
  let disposed = false
  let lastTiming: PluginCheckTiming | undefined
  let lastDailyAt: string | undefined

  const read = () => readPluginUpdateSettings(ctx.settings.plugin(pluginId))

  const stopTimer = (): void => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }

  const report = (message: string): void => {
    ctx.get("host")?.log("warn", `plugins: ${message}`)
  }

  async function run(): Promise<void> {
    if (running || disposed) return
    running = true
    try {
      const outcome = await runScheduledCheck(source, read().autoDownload)
      if (outcome.failed.length > 0) {
        report(
          `could not update ${outcome.failed
            .map((entry) => entry.name)
            .join(", ")}`
        )
      }
      /* The page's shared read watches this library; tell it what changed. */
      await source.reload()
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
