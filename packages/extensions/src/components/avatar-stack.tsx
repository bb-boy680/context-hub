/**
 * A row of marks where each one overlaps the one before it, with a count when
 * the row runs out of room. The marks are round, like the avatars they stand
 * for, and the count sits in a muted disc of its own size.
 *
 * It is geometry, not an avatar: a mark may be a brand icon a plugin contributes
 * or a picture, and the stack draws whichever it is at the size the canvas
 * fixes. The ring around each mark is drawn in the colour of the surface behind
 * it, because a mark sitting on a pill has to look cut out of that pill rather
 * than framed.
 */
import type { ReactNode } from "react"

import type { ExtensionIcon } from "../types.ts"

/** The 20px disc each mark occupies, and the 13px step between them. */
const TILE = 20
const STEP = 13

/** Past this many marks a stack keeps the first few and counts the rest. */
const DEFAULT_MAX = 5

/** One mark a stack draws: an id to key it by and the icon itself. */
export interface AvatarMark {
  id: string
  icon: ExtensionIcon
}

/**
 * The marks of one stack, each overlapping the one before it.
 *
 * @param marks — what to stack, in the order it reads.
 * @param seam — the ring that cuts each mark out of the surface behind it, as
 * the utility naming that surface's colour: `ring-secondary` on the tab row's
 * trough, `ring-card` on a card. Only the caller knows what it sits on.
 * @param label — names the marks for assistive technology, since the marks
 * themselves are decoration. Omitting it leaves the stack unlabelled.
 * @param max — how many marks to draw before the last tile carries the count.
 */
export function AvatarStack({
  marks,
  seam,
  label,
  max = DEFAULT_MAX,
}: {
  marks: readonly AvatarMark[]
  seam: string
  label?: string
  max?: number
}) {
  /* Nothing to stack is nothing to draw: the geometry below would otherwise
     leave a sliver of empty box where the marks would have been. */
  if (marks.length === 0) return null

  const shown = marks.slice(0, max)
  const more = marks.length - shown.length
  const slots = more === 0 ? shown.length : max + 1
  const tile = "absolute top-0 flex items-center justify-center overflow-hidden rounded-full"
  const edge = `pointer-events-none absolute inset-0 rounded-full ring-2 ring-inset ${seam}`
  const at = (index: number) => ({ left: STEP * index, width: TILE, height: TILE })

  return (
    <span
      className="relative inline-flex shrink-0"
      style={{ width: STEP * (slots - 1) + TILE, height: TILE }}
      aria-label={label}
      title={label}
    >
      {shown.map((mark, index) => {
        const Mark = mark.icon
        return (
          <span key={mark.id} className={tile} style={at(index)}>
            <Mark className="size-5" aria-hidden />
            <span className={edge} aria-hidden />
          </span>
        )
      })}
      {more === 0 ? null : (
        <span
          key="more"
          className={`${tile} bg-muted text-muted-foreground`}
          style={at(max)}
        >
          <span className="font-mono text-[10px] leading-none">{`+${more}`}</span>
          <span className={edge} aria-hidden />
        </span>
      )}
    </span>
  )
}

/**
 * A record's provenance as one line: the caller's own words about where it
 * came from, a seam, and the marks of the agents holding it.
 *
 * The line is drawn by every detail panel and dialog, so it lives here rather
 * than three times beside them. Without any marks there is nothing to separate,
 * so the lead stands alone.
 *
 * @param lead — what the caller says about the record, e.g. its source.
 * @param marks — the agents holding it, as their own icons.
 * @param label — names the marks for assistive technology.
 * @param seam — the ring that cuts each mark out of the surface behind it.
 */
export function MarksLine({
  lead,
  marks,
  label,
  seam = "ring-card",
}: {
  lead?: ReactNode
  marks: readonly AvatarMark[]
  label?: string
  seam?: string
}) {
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-2">
      {lead}
      {marks.length === 0 ? null : (
        <>
          <span aria-hidden className="text-muted-soft">
            ·
          </span>
          <AvatarStack marks={marks} seam={seam} label={label} />
        </>
      )}
    </span>
  )
}
