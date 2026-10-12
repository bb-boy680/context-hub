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
 * @param active — whether the surface this stack belongs to is the one on
 * screen; the seam is drawn in that surface's own colour either way, and this
 * says which colour that is.
 * @param max — how many marks to draw before the last tile carries the count.
 */
export function AvatarStack({
  marks,
  active,
  max = DEFAULT_MAX,
}: {
  marks: readonly AvatarMark[]
  active: boolean
  max?: number
}) {
  const shown = marks.slice(0, max)
  const more = marks.length - shown.length
  const slots = more === 0 ? shown.length : max + 1
  const tile = "absolute top-0 flex items-center justify-center overflow-hidden rounded-full"
  const seam = `pointer-events-none absolute inset-0 rounded-full ring-2 ring-inset ${
    active ? "ring-foreground dark:ring-accent" : "ring-secondary"
  }`
  const at = (index: number) => ({ left: STEP * index, width: TILE, height: TILE })

  return (
    <span
      className="relative shrink-0"
      style={{ width: STEP * (slots - 1) + TILE, height: TILE }}
    >
      {shown.map((mark, index) => {
        const Mark = mark.icon
        return (
          <span key={mark.id} className={tile} style={at(index)}>
            <Mark className="size-5" aria-hidden />
            <span className={seam} aria-hidden />
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
          <span className={seam} aria-hidden />
        </span>
      )}
    </span>
  )
}
