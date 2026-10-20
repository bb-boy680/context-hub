/**
 * What a set of places holds of one prompt, as the page reads it.
 *
 * A provider answers `PromptHeld` — a map of the form or option keys it has —
 * and nothing here knows what any one key means. That is what lets the page
 * draw a tick for a form it has never heard of.
 */
import type { PromptHeld, PromptPlace } from "./provider.ts"

/** Whether a place holds anything at all, including a place with no answer yet. */
export function holdsSomething(held: PromptHeld | undefined): boolean {
  return held !== undefined && Object.values(held).some(Boolean)
}

/** One agent that holds a prompt, as its mark. */
export interface HeldMark {
  /** The agent's id: two scopes of one agent are one mark. */
  readonly id: string
  readonly icon: PromptPlace["icon"]
  /** The labels of the places that hold it, joined the way a title reads. */
  readonly label: string
}

/**
 * The marks for the agents holding one prompt.
 *
 * A place is one agent under one root, and a row of marks answers "which
 * agents", not "which files": the workspace and machine-wide places of one
 * agent share an icon and a name, so they share a mark.
 *
 * @param places — every place a delivery can go to, in reading order.
 * @param holds — what each place holds, keyed by place id.
 * @param labelOf — a place's name in the active locale.
 */
export function heldMarks(
  places: readonly PromptPlace[],
  holds: Readonly<Record<string, PromptHeld>>,
  labelOf: (place: PromptPlace) => string
): HeldMark[] {
  const marks = new Map<string, { icon: PromptPlace["icon"]; labels: string[] }>()
  for (const place of places) {
    if (!holdsSomething(holds[place.id])) continue
    const seen = marks.get(place.agent)
    if (seen === undefined) {
      marks.set(place.agent, { icon: place.icon, labels: [labelOf(place)] })
      continue
    }
    const label = labelOf(place)
    if (!seen.labels.includes(label)) seen.labels.push(label)
  }
  return [...marks].map(([id, mark]) => ({
    id,
    icon: mark.icon,
    label: mark.labels.join(" · "),
  }))
}
