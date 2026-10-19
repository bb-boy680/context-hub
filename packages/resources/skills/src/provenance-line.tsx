/**
 * One row's provenance, as a single quiet line: a small icon, how the skill got
 * here, and the places that hold it. The marks are the part that differs from
 * row to row — the same stack the scope tabs wear, capped the same way — so a
 * row answers "which agents have this" without being opened.
 */
import { HardDriveIcon, LibraryIcon, PackageIcon, StoreIcon, type LucideIcon } from "lucide-react"

import { useI18n } from "@context-hub/extensions/react"
import { AvatarStack } from "@context-hub/extensions/components"

import { holdsOf, locationLabel, sourceLabel, useReadablePlaces } from "./library.ts"
import type { Skill, SkillSource } from "./types.ts"

/** The mark for how a skill reached this machine. */
const SOURCE_ICONS: Record<SkillSource, LucideIcon> = {
  local: HardDriveIcon,
  registry: StoreIcon,
  builtin: PackageIcon,
}

export function ProvenanceLine({ skill }: { skill: Skill }) {
  const { t } = useI18n()
  /* The places come from the skills registry, so this line names them the way
     their own extension does without every caller passing them down. */
  const places = useReadablePlaces()
  const Icon = SOURCE_ICONS[skill.source] ?? HardDriveIcon
  const holds = holdsOf(skill)
  /* A place this build no longer reads still holds the row's files, so it keeps
     a mark rather than quietly disappearing from the line. */
  const icons = new Map(places.map((place) => [place.id, place.icon]))
  const marks = holds.map((hold) => ({
    id: hold.id,
    icon: icons.get(hold.id) ?? LibraryIcon,
  }))

  return (
    /* max-w-full clamps the line to its container: without it a fixed-width
       cell's nowrap text sets the box's minimum to the full line, so nothing
       ever shrinks and the text paints over the neighbouring column. */
    <span className="inline-flex max-w-full min-w-0 items-center gap-[5px] text-[12px] leading-[15px]">
      <Icon className="size-[13px] shrink-0 text-muted-soft" aria-hidden />
      {/* The one part that gives way when the line runs out of room: a card's
         foot is 128px wide and the marks are 13px apart, so at five places the
         source is elided, and at six it is gone and the icon says it alone. */}
      <span className="min-w-0 truncate text-muted-foreground">
        {sourceLabel(skill.source, t)}
        <span aria-hidden className="text-muted-soft"> · </span>
      </span>
      {holds.length === 0 ? (
        <span className="truncate font-semibold text-foreground">
          {t("skills.location.library")}
        </span>
      ) : (
        <AvatarStack
          marks={marks}
          seam="ring-card"
          label={holds
            .map((hold) => locationLabel(hold.id, t, places))
            .join(" · ")}
        />
      )}
    </span>
  )
}
