/**
 * The media a card and a detail pane share: what kind of thing a source is, how
 * many covers may decode at once, and what ratio each was measured at.
 *
 * A playing video decodes frames continuously, so the cap keeps a scrolling grid
 * from stacking decoders; a full-screen surface over the catalog suspends them
 * all. The ratios are remembered so a re-mounted card lays out without a jump,
 * and they live here rather than in a page because two pages draw the same asset.
 *
 * Nothing here renders. The controls that use it are in `media-gallery.tsx`, and
 * every screen imports both through this package rather than from a plugin.
 */
import { assetKind } from "@workspace/core"

/** Cover previews allowed to decode at once; later requests queue for a slot. */
const MAX_PLAYING = 6

const playing = new Set<HTMLVideoElement>()
const pending = new Set<HTMLVideoElement>()
/** Every mounted preview's `sync`, so a global pause can stop them all. */
const previews = new Set<() => void>()
let suspended = false

/** Whether previews are globally paused, e.g. while the detail lightbox is open. */
export function previewsSuspended(): boolean {
  return suspended
}

/**
 * Register a preview's `sync` callback.
 *
 * @param sync — re-reads visibility and the cap, then plays or pauses.
 * @returns a disposer removing the callback.
 */
export function registerPreview(sync: () => void): () => void {
  previews.add(sync)
  return () => previews.delete(sync)
}

/**
 * Pause or resume every cover preview at once.
 *
 * @param next — `true` while a full-screen surface covers the catalog.
 */
export function setPreviewsSuspended(next: boolean): void {
  if (suspended === next) return
  suspended = next
  for (const sync of previews) sync()
}

/** data: URLs carry their own mime type; anything else is guessed from the extension. */
export function mediaKind(src: string): "image" | "video" {
  return assetKind(src, /^data:([^;,]+)/i.exec(src)?.[1] ?? "")
}

/** Natural aspect ratios already measured, so a re-mounted card lays out without a jump. */
const aspects = new Map<string, number>()

/**
 * The ratio measured for a source earlier in this session.
 *
 * @param src — the asset URL.
 * @returns width/height, or `undefined` before it was first measured.
 */
export function knownAspect(src: string): number | undefined {
  return aspects.get(src)
}

/**
 * Remember an asset's measured ratio for later mounts.
 *
 * @param src — the asset URL.
 * @param ratio — width/height; non-finite or non-positive values are ignored.
 */
export function rememberAspect(src: string, ratio: number): void {
  if (!Number.isFinite(ratio) || ratio <= 0) return
  aspects.set(src, ratio)
}

/**
 * Take a playback slot, or queue the preview until another one frees a slot.
 *
 * @param video — the preview element asking to play.
 * @returns whether it may play now.
 */
export function acquirePreview(video: HTMLVideoElement): boolean {
  if (playing.has(video)) return true
  if (playing.size >= MAX_PLAYING) {
    pending.add(video)
    return false
  }
  playing.add(video)
  return true
}

/**
 * Give a slot back and start the longest-waiting preview, if any.
 *
 * @param video — the preview that stopped playing or left the viewport.
 */
export function releasePreview(video: HTMLVideoElement): void {
  playing.delete(video)
  pending.delete(video)
  if (suspended) return
  const next = pending.values().next()
  if (next.done) return
  pending.delete(next.value)
  playing.add(next.value)
  void next.value.play().catch(() => playing.delete(next.value))
}
