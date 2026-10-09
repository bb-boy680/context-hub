/**
 * One row's provenance, as a single quiet line: a small icon, how the skill got
 * here, and where it lives now. The place is the part that differs from row to
 * row, so it carries the weight; the rest stays in the background and a card of
 * these reads as metadata rather than as chrome.
 */
import { HardDriveIcon, PackageIcon, StoreIcon, type LucideIcon } from "lucide-react"

import { useContributions, useI18n } from "@workspace/extensions/react"

import { placeLabel, sourceLabel } from "./library.ts"
import type { Skill, SkillSource } from "./types.ts"

/** The mark for how a skill reached this machine. */
const SOURCE_ICONS: Record<SkillSource, LucideIcon> = {
  local: HardDriveIcon,
  registry: StoreIcon,
  builtin: PackageIcon,
}

export function ProvenanceLine({ skill }: { skill: Skill }) {
  const { t } = useI18n()
  /* The places are contributions, so this line names them the way their own
     extension does without every caller passing them down. */
  const places = useContributions("skillLocation")
  const Icon = SOURCE_ICONS[skill.source] ?? HardDriveIcon

  return (
    /* max-w-full clamps the line to its container: without it a fixed-width
       cell's nowrap text sets the box's minimum to the full line, so nothing
       ever shrinks and the text paints over the neighbouring column. */
    <span className="inline-flex max-w-full min-w-0 items-center gap-[5px] text-[12px] leading-[15px]">
      <Icon className="size-[13px] shrink-0 text-muted-soft" aria-hidden />
      <span className="truncate text-muted-foreground">
        {sourceLabel(skill.source, t)}
      </span>
      <span aria-hidden className="shrink-0 text-muted-soft">
        ·
      </span>
      {/* Shrinks with an ellipsis rather than painting over the next column:
          a longer label, or another language, must not overlap its neighbour. */}
      <span className="truncate font-semibold text-foreground">
        {placeLabel(skill, t, places)}
      </span>
    </span>
  )
}
