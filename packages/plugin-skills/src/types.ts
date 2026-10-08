/**
 * Where one skill lives, as the row and the lightbox show it: only in the hub's
 * library, only in the workspace folder, or in both — a library skill the hub
 * installed into the workspace is one skill in two places, not two skills.
 */
export type SkillLocation = "library" | "workspace" | "both"

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
  /** Location, which is what the badge names. */
  location: SkillLocation
  /** The workspace holds this library skill, installed by the hub as a link. */
  installed: boolean
  /**
   * The workspace holds a skill of its own under this id, so the name is taken:
   * installing the library's copy under it is not possible.
   */
  taken?: boolean
  /** A link the hub made whose library skill is gone; only cleanup can follow. */
  stale?: boolean
  /** Token estimate, present once the body has been read. */
  tokens?: string
  /** Matches recorded for the skill; absent for a skill with no history. */
  triggers?: number
  /** Display-ready age, e.g. "2 hours ago"; empty for a row with no record. */
  updated: string
  /** The stored record's own timestamp; moves on every write, so the lightbox
      re-reads the record when it changes. Absent on rows with no record. */
  stamp?: string
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
