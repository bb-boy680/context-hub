/** Where a skill came from; the badge on the card and in the lightbox. */
export type { SkillOrigin as SkillSource } from "./store.ts"

/** One skill row, shared by the catalog page and the detail lightbox. */
export type Skill = {
  /** Stable id from the library; the row key and the target of every action. */
  id: string
  name: string
  /** Short line the grid card shows. */
  summary: string
  /** Full line the list row and the lightbox show. */
  description: string
  tags: string[]
  source: string
  /** Token estimate, present once the body has been read. */
  tokens?: string
  /** Matches recorded for the skill; absent for a skill with no history. */
  triggers?: number
  /** Display-ready age, e.g. "2 hours ago". */
  updated: string
  /** The stored record's own timestamp; moves on every write, so the lightbox
      re-reads the record when it changes. Absent on bundled rows. */
  stamp?: string
  enabled: boolean
  /** Card thumbnail. */
  cover?: string
  /** Lightbox slides in order; a missing gallery falls back to `cover`. */
  gallery?: string[]
}

/** One lightbox slide. */
export type MediaItem = {
  id: string
  kind: "image" | "video"
  src: string
}
