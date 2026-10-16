import type { AssetScope } from "@context-hub/extensions"

import type { SkillOrigin as SkillSource } from "./store.ts"
import type { SkillUpstream, SkillCheck } from "./store.ts"

/**
 * Where one skill lives, as the row and the lightbox show it: only in the hub's
 * library, only in a place an agent keeps skills in, or in both — a library
 * skill the hub installed into a place is one skill in two places, not two
 * skills. `"both"` and `"library"` are the hub's own two cases; everything else
 * is the id of a place, the way the extension that contributed it named it.
 */
export type SkillLocation = "library" | "both" | SkillPlaceId

/** One place an agent keeps skills in, named by the extension that registers it. */
export type SkillPlaceId = string

/** One place holding a row's files, with where to find them. */
export interface SkillHold {
  id: SkillPlaceId
  /** Which root the directory sits under. */
  scope: AssetScope
  /** The place's directory inside that root, `/`-separated. */
  dir: string
}

/** How a skill reached this machine; the first half of a row's provenance line. */
export type { SkillOrigin as SkillSource } from "./store.ts"
/** Where a skill's files were installed from, when anything recorded it. */
export type { SkillUpstream, SkillCheck } from "./store.ts"

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
  /** The places holding this row's files; absent when only the library does. */
  places?: SkillHold[]
  /** The workspace holds this library skill, installed by the hub as a link. */
  installed: boolean
  /**
   * Which side holds the link when the library and a place both reach the same
   * files: the library, for one linked in from a workspace; otherwise the place
   * that holds a link into the library. Taking the link back is what an action
   * on such a row does.
   */
  linkAt?: "library" | SkillPlaceId
  /**
   * The places holding a skill of their own under this id, so the name is taken
   * there: installing the library's copy into one of them is not possible.
   */
  takenAt?: SkillPlaceId[]
  /** A link the hub made whose library skill is gone; only cleanup can follow. */
  stale?: boolean
  /**
   * What recorded where the files were installed from. Absent on a skill
   * written here or copied in by hand, and then no update can be checked.
   */
  upstream?: SkillUpstream
  /** The last check of that source: what it held, and the files here then. */
  checked?: SkillCheck
  /**
   * A skill the workspace holds that the library also holds under this id; the
   * library's copy is the one to manage, so this row offers nothing to do.
   */
  inLibrary?: boolean
  /** Token estimate, present once the body has been read. */
  tokens?: string
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
