/**
 * One row's provenance, as a single quiet line: a small icon, how the skill got
 * here, and where it lives now. The place carries the accent colour because it
 * is the part that differs from row to row; everything else stays in the
 * background so a card of these reads as metadata, not as chrome.
 */
import { HardDriveIcon, PackageIcon, StoreIcon, type LucideIcon } from "lucide-react"

import { useI18n } from "@workspace/extensions/react"

import { locationLabel, sourceLabel } from "./library.ts"
import type { Skill, SkillSource } from "./types.ts"

/** The mark for how a skill reached this machine. */
const SOURCE_ICONS: Record<SkillSource, LucideIcon> = {
  local: HardDriveIcon,
  registry: StoreIcon,
  builtin: PackageIcon,
}

export function ProvenanceLine({ skill }: { skill: Skill }) {
  const { t } = useI18n()
  const Icon = SOURCE_ICONS[skill.source] ?? HardDriveIcon

  return (
    /* max-w-full clamps the line to its container: without it a fixed-width
       cell's nowrap text sets the box's minimum to the full line, so nothing
       ever shrinks and the text paints over the neighbouring column. */
    <span className="inline-flex max-w-full min-w-0 items-center gap-1.5 text-[12.5px] leading-[15px]">
      <Icon className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
      <span className="truncate font-medium text-muted-foreground">
        {sourceLabel(skill.source, t)}
      </span>
      <span aria-hidden className="shrink-0 text-muted-foreground/45">
        ·
      </span>
      {/* Shrinks with an ellipsis rather than painting over the next column:
          a longer label, or another language, must not overlap its neighbour. */}
      <span className="truncate font-semibold text-amber-600 dark:text-amber-400">
        {locationLabel(skill.location, t)}
      </span>
    </span>
  )
}
