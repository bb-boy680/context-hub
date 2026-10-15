/**
 * A muted looping preview for a card or a list row.
 *
 * It plays only while it is on screen, the tab is visible, no full-screen surface
 * covers the catalog, and a free preview slot exists, so a page of video covers
 * cannot keep every decoder busy. Scrolling a preview out of view pauses it.
 *
 * This is what makes a video a cover: a card draws the first asset a record has,
 * whatever kind it is, and hands a video here rather than to an `<img>`.
 */
import * as React from "react"

import {
  acquirePreview,
  previewsSuspended,
  registerPreview,
  releasePreview,
} from "./media.ts"

export function AutoplayVideo({
  src,
  className,
  onAspect,
}: {
  src: string
  className?: string
  /** Natural width/height ratio, for layouts that size themselves to the asset. */
  onAspect?: (ratio: number) => void
}) {
  const ref = React.useRef<HTMLVideoElement | null>(null)

  React.useEffect(() => {
    const video = ref.current
    if (!video) return
    let onScreen = false
    if (video.readyState >= 1 && video.videoWidth > 0) {
      onAspect?.(video.videoWidth / video.videoHeight)
    }

    const sync = () => {
      if (!onScreen || document.hidden || previewsSuspended()) {
        releasePreview(video)
        video.pause()
        return
      }
      if (acquirePreview(video)) {
        void video.play().catch(() => releasePreview(video))
      }
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry?.isIntersecting ?? false
        sync()
      },
      { threshold: 0.25 }
    )
    observer.observe(video)
    document.addEventListener("visibilitychange", sync)
    const unregister = registerPreview(sync)
    /* The observer reports the initial state, so nothing plays before it does. */
    return () => {
      observer.disconnect()
      document.removeEventListener("visibilitychange", sync)
      unregister()
      releasePreview(video)
    }
  }, [src, onAspect])

  return (
    <video
      ref={ref}
      src={src}
      muted
      loop
      playsInline
      preload="metadata"
      onLoadedMetadata={(event) => {
        const video = event.currentTarget
        onAspect?.(video.videoWidth / video.videoHeight)
      }}
      className={className}
    />
  )
}
