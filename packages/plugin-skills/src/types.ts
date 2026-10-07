/** Where a skill came from; the badge on the card and in the lightbox. */
export type SkillSource = "Built-in" | "Workspace" | "skill.sh"

/** One skill row, shared by the catalog page and the detail lightbox. */
export type Skill = {
  name: string
  /** Short line the grid card shows. */
  summary: string
  /** Full line the list row and the lightbox show. */
  description: string
  tags: string[]
  source: SkillSource
  tokens: string
  triggers: number
  updated: string
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
