/**
 * One collected plugin pack, as the library holds it, and the two answers a
 * person asks about it: has the source moved on, and have these files been
 * edited since.
 *
 * The two are separate because they need separate facts. `source` carries the
 * revision the source was at when the pack landed, which is the only thing a
 * later check can compare against the source; `hash` is the directory hash of
 * the files that landed, which is the only thing that answers "have these been
 * edited since". A record nobody has checked is ahead of nothing, and nothing
 * here asks a network.
 */
import { hasUpstream, installedRevision, type PluginCheck, type PluginOrigin } from "./contract.ts"

/** One row of the library. */
export interface PluginRecord {
  /** The pack's own name from its manifest, which is also its directory and its key. */
  name: string
  version: string
  description: string
  /** The categories the filter bar narrows by; a pack may carry several. */
  tags: string[]
  /** Where the pack came from, and the revision that landing was. */
  source: PluginOrigin
  /** Directory hash of the files as they landed, which answers "edited since". */
  hash: string
  /** Files the hub holds for this pack — the logo read out of it, and whatever a person adds. */
  assets: string[]
  /** ISO timestamp of the collection. */
  installedAt: string
  /** ISO timestamp of the last recorded change to the library's copy. */
  updatedAt: string
  /** The last time the source was asked about this pack, and what it held. */
  checked?: PluginCheck
}

/**
 * Whether the last check found the source ahead of the files here. A pack whose
 * source cannot be asked, or that nobody has asked about, is not ahead of
 * anything.
 */
export function outdated(record: PluginRecord): boolean {
  const latest = record.checked?.latest
  if (latest === undefined) return false
  const installed = installedRevision(record.source)
  return installed !== null && latest !== installed
}

/**
 * Whether the files here differ from the revision they were collected at — a
 * person's own edit, which an update would overwrite. This holds even when the
 * source has not moved on, so it is asked apart from {@link outdated}.
 */
export function modified(record: PluginRecord): boolean {
  const current = record.checked?.currentHash
  if (current === undefined) return false
  return current !== record.hash
}

/** Whether this pack's source can be asked about at all. */
export function checkable(record: PluginRecord): boolean {
  return hasUpstream(record.source)
}

/** What one batch check found across the library. */
export interface PluginUpdateSummary {
  /** Packs whose source answered and whose answer was recorded. */
  checked: number
  /** Of those, how many the source has moved past. */
  outdated: number
  /**
   * Of those, how many no longer match the revision they were collected at — a
   * person's own edit, which an update would overwrite. A source that has not
   * moved on does not make such a copy any less changed, so it is counted and
   * reported on its own.
   */
  modified: number
  /** Packs whose source could not be read, each with the reason; the rest still ran. */
  failed: { name: string; reason: string }[]
  /**
   * Packs this build cannot ask about at all, so a person is not left waiting
   * for an answer that is never coming.
   */
  unanswerable: string[]
}

/** One pack measured against its source. */
export interface PluginUpdateCheck {
  /** The revision recorded when the pack was collected or last updated. */
  recordedRevision: string | null
  /** The revision the source holds now. */
  latestRevision: string
  /** The directory hash of the files here, taken during this check. */
  currentHash: string
  /** The source holds a revision this copy does not have. */
  outdated: boolean
  /** The files here differ from the revision they were collected at. */
  modified: boolean
}
