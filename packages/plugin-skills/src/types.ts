/**
 * Where one skill lives, as the row and the lightbox show it: only in the hub's
 * library, only in the workspace folder, or in both — a library skill the hub
 * installed into the workspace is one skill in two places, not two skills.
 */
export type SkillLocation = "library" | "workspace" | "both"

/** How a skill reached this machine; the first half of a row's provenance line. */
export type { SkillOrigin as SkillSource } from "./store.ts"
/** Where a skill's files were installed from, when anything recorded it. */
export type { SkillUpstream } from "./store.ts"

import type { SkillOrigin as SkillSource } from "./store.ts"
import type { SkillUpstream } from "./store.ts"

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
  /** How it got here: imported from a folder, or downloaded from a registry. */
  source: SkillSource
  /** Location, which is what the row's provenance line names. */
  location: SkillLocation
  /** The workspace holds this library skill, installed by the hub as a link. */
  installed: boolean
  /**
   * Which side holds the link when a skill is in both places: the workspace,
   * for one the hub installed; the library, for one linked in from a workspace.
   * Taking the link back is what an action on such a row does.
   */
  linkAt?: "library" | "workspace"
  /**
   * The workspace holds a skill of its own under this id, so the name is taken:
   * installing the library's copy under it is not possible.
   */
  taken?: boolean
  /** A link the hub made whose library skill is gone; only cleanup can follow. */
  stale?: boolean
  /**
   * What recorded where the files were installed from. Absent on a skill
   * written here or copied in by hand, and then no update can be checked.
   */
  upstream?: SkillUpstream
  /**
   * A skill the workspace holds that the library also holds under this id; the
   * library's copy is the one to manage, so this row offers nothing to do.
   */
  inLibrary?: boolean
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
