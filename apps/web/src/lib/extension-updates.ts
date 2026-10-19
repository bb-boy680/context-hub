/**
 * When the extension market is checked, and what a check does with the answer.
 *
 * The settings live in the same plugin-namespace document as the skills and
 * packs settings, not in `state/extensions.json`: that file only records which
 * extension is switched on. The schedule follows the page, like the other two
 * modules — closing the hub stops it, and there is no daemon.
 */
import type { ExtensionMarketIndex } from "@context-hub/core/extension-market"
import {
  OFFICIAL_MARKET_URL,
  msUntilDue,
  type HubKernel,
  type UpdateCheckTiming,
} from "@context-hub/extensions"

import {
  installMarketExtension,
  marketUpdatesFor,
  refreshExtensionMarket,
} from "./extension-market.ts"

/** Settings namespace under `state/settings.json`. */
export const EXTENSION_UPDATES_ID = "hub.extensions"

/** How a person asked market checks to be started. */
export type ExtensionCheckTiming = UpdateCheckTiming

/** What this module remembers about update checks, under its own settings key. */
export interface ExtensionUpdateSettings {
  check: ExtensionCheckTiming
  /** Local time of the daily check, `HH:MM`. */
  dailyAt: string
  autoUpdate: boolean
  /** When the last scheduled check ran; absent for the other timings. */
  lastCheckAt?: string
}

/** What an untouched install does: nothing automatically. */
export const DEFAULT_EXTENSION_UPDATE_SETTINGS: ExtensionUpdateSettings = {
  check: "manual",
  dailyAt: "14:00",
  autoUpdate: false,
}

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
export function readExtensionUpdateSettings(value: unknown): ExtensionUpdateSettings {
  const record =
    typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {}
  return {
    check:
      record.check === "startup" || record.check === "daily"
        ? record.check
        : "manual",
    dailyAt: isTimeOfDay(record.dailyAt)
      ? record.dailyAt
      : DEFAULT_EXTENSION_UPDATE_SETTINGS.dailyAt,
    autoUpdate: record.autoUpdate === true,
    ...(typeof record.lastCheckAt === "string" &&
    !Number.isNaN(Date.parse(record.lastCheckAt))
      ? { lastCheckAt: record.lastCheckAt }
      : {}),
  }
}

/** What one check found, and what it installed. */
export interface ExtensionCheckOutcome {
  /** Installed plugins the market has something to say about. */
  checked: number
  updated: string[]
  failed: { name: string; reason: string }[]
}

/**
 * Re-read the market and, when the setting allows, install compatible updates.
 *
 * A check never installs a listing whose only versions are incompatible; the
 * page still shows those, and the person decides. One failure does not stop
 * the rest of the pass.
 *
 * @param ctx — the running kernel.
 * @returns what the check found and did.
 */
export async function runExtensionCheck(
  ctx: HubKernel["ctx"]
): Promise<ExtensionCheckOutcome> {
  const index: ExtensionMarketIndex = await refreshExtensionMarket(OFFICIAL_MARKET_URL)
  const updates = marketUpdatesFor(
    ctx.extensions.snapshot().entries,
    index,
    ctx.host.version
  )
  const settings = readExtensionUpdateSettings(
    ctx.settings.plugin(EXTENSION_UPDATES_ID)
  )
  const updated: string[] = []
  const failed: ExtensionCheckOutcome["failed"] = []
  if (settings.autoUpdate) {
    for (const update of updates.values()) {
      if (update.target === null) continue
      try {
        await installMarketExtension({
          ctx,
          plugin: update.plugin,
          version: update.target,
          hubVersion: ctx.host.version,
        })
        updated.push(update.plugin.id)
      } catch (error) {
        failed.push({
          name: update.plugin.id,
          reason: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }
  return { checked: updates.size, updated, failed }
}

/**
 * Run market checks for as long as the hub page stays open.
 *
 * `manual` never arms anything. `startup` runs once per page load; `daily` runs
 * at the person's chosen local time and re-arms after each run. The timer is
 * disposed with the kernel, and a run that failed still stamps `lastCheckAt`
 * so a market that is down is not asked again on every refresh.
 *
 * @param ctx — the running kernel.
 */
export function startExtensionUpdateSchedule(ctx: HubKernel["ctx"]): void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let running = false
  let startupDone = false
  let disposed = false
  let lastTiming: ExtensionCheckTiming | undefined
  let lastDailyAt: string | undefined

  const read = () =>
    readExtensionUpdateSettings(ctx.settings.plugin(EXTENSION_UPDATES_ID))

  const stopTimer = (): void => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }

  const report = (message: string): void => {
    ctx.host.log("warn", `extensions: ${message}`)
  }

  async function run(): Promise<void> {
    if (running || disposed) return
    running = true
    try {
      const outcome = await runExtensionCheck(ctx)
      if (outcome.failed.length > 0) {
        report(
          `could not update ${outcome.failed
            .map((entry) => entry.name)
            .join(", ")}`
        )
      }
    } catch (error) {
      report(`update check failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      const latest = read()
      if (!disposed && latest.check === "daily") {
        ctx.settings.setPlugin(EXTENSION_UPDATES_ID, {
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
