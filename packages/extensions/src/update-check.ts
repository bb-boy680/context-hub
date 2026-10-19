/**
 * The timing rules every update scheduler shares.
 *
 * Skills, plugin packs, and the extension market each have their own settings
 * shape, but the question "when is this check due" has one answer. A daily
 * check is anchored to a local wall-clock time rather than to a period since
 * the last run: the person chose 14:00, so that is when it happens. When that
 * slot has already passed and no check covered it, the answer is 0 — the
 * schedule catches up once instead of waiting a whole day.
 */

/** How a person asked update checks to be started. */
export type UpdateCheckTiming = "manual" | "startup" | "daily"

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * How long until this timing next wants a check.
 *
 * @param timing — the chosen timing.
 * @param lastCheckAt — when the last scheduled check ran, if it ever did.
 * @param now — the current time in milliseconds.
 * @param dailyAt — local `HH:MM` time the daily check is due.
 * @returns milliseconds to wait, or `null` when this timing never runs by itself.
 */
export function msUntilDue(
  timing: UpdateCheckTiming,
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
