/**
 * The media controls a record's own pictures are read through: one stage, a
 * strip of thumbnails under it, and the two arrows between them.
 *
 * Swiper owns paging, the thumbnails and the drag; what a slide holds and what
 * the strip can do with one come from the caller. A video is played here rather
 * than by the browser's own controls: the slide that is on screen plays and the
 * rest pause, and a thumbnail plays only while it is the current one — so a
 * record with several videos never decodes them all at once.
 *
 * The words are passed in rather than resolved here, because the two screens
 * that draw this speak different languages in different places.
 */
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ImageIcon,
  PauseIcon,
  PlayIcon,
  Volume2Icon,
  VolumeXIcon,
  XIcon,
} from "lucide-react"
import * as React from "react"
import { Navigation, Thumbs } from "swiper/modules"
import { Swiper, SwiperSlide } from "swiper/react"
import type { SwiperClass } from "swiper/react"
import "swiper/css"
import "swiper/css/thumbs"

/** One picture or video on a stage, named by whatever the record keys it under. */
export interface MediaItem {
  id: string
  kind: "image" | "video"
  src: string
}

/** The words this gallery's own controls read out. */
export interface MediaGalleryWords {
  play: string
  pause: string
  seek: string
  mute: string
  unmute: string
  previous: string
  next: string
  image: string
  video: string
  remove: string
}

/** Ratio a slide takes before its media reports its own. */
const FALLBACK_RATIO = 16 / 9

/** Start one video, falling back to muted when the browser blocks audible autoplay. */
async function startPlayback(video: HTMLVideoElement) {
  try {
    await video.play()
  } catch {
    video.muted = true
    try {
      await video.play()
    } catch {
      /* Still blocked: the slide keeps its own play button. */
    }
  }
}

/** One slide: the picture itself, or a video carrying its own controls. */
function MediaSlide({
  item,
  empty,
  active,
  words,
}: {
  item?: MediaItem
  /** What the stage shows when the record has no media at all. */
  empty: React.ReactNode
  /** The slide Swiper currently shows; drives the video's own play state. */
  active: boolean
  words: MediaGalleryWords
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const [playing, setPlaying] = React.useState(false)
  const [muted, setMuted] = React.useState(false)
  const [progress, setProgress] = React.useState(0)
  /* Media arrives in any shape — portrait videos are common — so the stage takes
     the frame's own ratio and grows until one axis runs out. */
  const [ratio, setRatio] = React.useState(FALLBACK_RATIO)

  /* Play the active slide and pause the rest; `playing` follows the video's own events. */
  React.useEffect(() => {
    const video = videoRef.current
    if (!video || item?.kind !== "video") return
    if (active) void startPlayback(video)
    else video.pause()
  }, [active, item?.id, item?.kind])

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) void startPlayback(video)
    else video.pause()
  }

  const seek = (position: number) => {
    const video = videoRef.current
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return
    video.currentTime = position * video.duration
    setProgress(position)
  }

  const toggleMute = () => {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
    setMuted(video.muted)
  }

  return (
    <div className="flex size-full items-center justify-center">
      <div
        /* `100cqh` is the stage area, which the caller marks as a size container:
           the frame keeps its ratio and stops at whichever axis runs out, so a
           portrait video fills the height and a landscape one the width. What has
           no ratio to keep takes the whole stage. */
        className={`relative overflow-hidden rounded-md ${
          item === undefined ? "size-full" : "max-h-full"
        }`}
        style={
          item === undefined
            ? undefined
            : {
                aspectRatio: String(ratio),
                width: `min(100%, calc(100cqh * ${ratio}))`,
              }
        }
      >
        {!item ? (
          empty
        ) : item.kind === "video" ? (
          <video
            ref={videoRef}
            src={item.src}
            playsInline
            onLoadedMetadata={(event) => {
              const media = event.currentTarget
              if (media.videoHeight > 0) setRatio(media.videoWidth / media.videoHeight)
            }}
            onClick={togglePlay}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onVolumeChange={() => setMuted(videoRef.current?.muted ?? false)}
            onTimeUpdate={(event) =>
              setProgress(event.currentTarget.currentTime / (event.currentTarget.duration || 1))
            }
            className="size-full object-cover"
          />
        ) : (
          <img
            src={item.src}
            alt=""
            onLoad={(event) => {
              const media = event.currentTarget
              if (media.naturalHeight > 0) setRatio(media.naturalWidth / media.naturalHeight)
            }}
            className="size-full object-cover"
          />
        )}
        {item?.kind === "video" ? (
          /* Control bar sits over a scrim so the video itself stays unobstructed. */
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-[#0f172ad9] to-transparent px-4 pt-8 pb-3">
            <button
              type="button"
              aria-label={playing ? words.pause : words.play}
              onClick={togglePlay}
              className="flex size-6 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/20"
            >
              {playing ? (
                <PauseIcon className="size-4 fill-white text-white" />
              ) : (
                <PlayIcon className="size-4 fill-white text-white" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              step={0.1}
              value={Math.round(progress * 1000) / 10}
              aria-label={words.seek}
              onChange={(event) => seek(Number(event.target.value) / 100)}
              className="h-4 min-w-0 flex-1 cursor-pointer accent-white"
            />
            <button
              type="button"
              aria-label={muted ? words.unmute : words.mute}
              onClick={toggleMute}
              className="flex size-6 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/20"
            >
              {muted ? <VolumeXIcon className="size-4" /> : <Volume2Icon className="size-4" />}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Thumbnail for a video. The current one keeps playing muted; the rest hold a
 * frame near the start, so the strip neither goes black nor decodes every video
 * in the gallery.
 */
function VideoThumb({ src, active }: { src: string; active: boolean }) {
  const ref = React.useRef<HTMLVideoElement | null>(null)

  React.useEffect(() => {
    const video = ref.current
    if (!video) return
    if (active) void video.play().catch(() => undefined)
    else video.pause()
  }, [active])

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
        if (active || !Number.isFinite(video.duration)) return
        video.currentTime = Math.min(0.5, video.duration / 2)
      }}
      className="size-full object-cover"
    />
  )
}

/**
 * Swiper mutates its own copy of these params, so one shared template is safe;
 * shorthand booleans would replace the module defaults wholesale.
 */
const navigationParams = { prevEl: null, nextEl: null }

/**
 * One record's pictures: the stage, the strip, and the arrows.
 *
 * @param items — the record's pictures, in its own order: the first is what it is
 * drawn by, so that is where a fresh gallery lands.
 * @param empty — what the stage holds when the record has no picture at all.
 * @param onRemove — drop one picture; a gallery nothing can be dropped from
 * draws no mark for it.
 * @param action — what sits at the end of the strip: the control that adds one.
 * @param words — the words this gallery's controls read out.
 */
export function MediaGallery({
  items,
  empty,
  onRemove,
  action,
  words,
}: {
  items: readonly MediaItem[]
  empty: React.ReactNode
  onRemove?: (id: string) => void
  action?: React.ReactNode
  words: MediaGalleryWords
}) {
  const [activeIndex, setActiveIndex] = React.useState(0)
  const [thumbs, setThumbs] = React.useState<SwiperClass | null>(null)
  const mainRef = React.useRef<SwiperClass | null>(null)
  const prevRef = React.useRef<HTMLButtonElement | null>(null)
  const nextRef = React.useRef<HTMLButtonElement | null>(null)
  const count = items.length
  const lastCount = React.useRef(count)

  /* The nav buttons sit beside the Swiper, so bind them once both exist. */
  React.useEffect(() => {
    const instance = mainRef.current
    const prev = prevRef.current
    const next = nextRef.current
    if (!instance || instance.destroyed || !prev || !next) return
    const { navigation } = instance.params
    if (typeof navigation !== "object") return
    if (navigation.prevEl === prev && navigation.nextEl === next) return
    navigation.prevEl = prev
    navigation.nextEl = next
    instance.navigation.init()
    instance.navigation.update()
  })

  /* A picture added is shown; after a removal a neighbour is, since the one that
     was on the stage is the one that left. */
  React.useEffect(() => {
    if (count > lastCount.current) mainRef.current?.slideTo(count - 1)
    else if (count < lastCount.current) {
      mainRef.current?.slideTo(Math.min(activeIndex, Math.max(0, count - 1)))
    }
    lastCount.current = count
  }, [count, activeIndex])

  /*
   * Swiper's own keyboard module listens while events bubble, and a dialog stops
   * them on the way up, so take the arrow keys during capture instead.
   */
  React.useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
      if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target as HTMLElement | null
      const tag = target?.tagName.toLowerCase()
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) return
      const instance = mainRef.current
      if (!instance || instance.destroyed) return
      event.preventDefault()
      if (event.key === "ArrowLeft") instance.slidePrev()
      else instance.slideNext()
    }
    document.addEventListener("keydown", handle, true)
    return () => document.removeEventListener("keydown", handle, true)
  }, [])

  return (
    <>
      {/* The stage takes every pixel the strip leaves behind: a fixed box left a
          band of empty panel above and below it. A slide keeps its own ratio
          inside the stage, so a portrait frame uses the full height. */}
      <div className="relative flex min-h-0 w-full flex-1 items-center justify-center [container-type:size]">
        <Swiper
          modules={[Navigation, Thumbs]}
          onSwiper={(instance) => {
            mainRef.current = instance
          }}
          onBeforeInit={(instance) => {
            /* Object form keeps Swiper's own navigation defaults. */
            const { navigation } = instance.params
            if (typeof navigation === "object") {
              navigation.prevEl = prevRef.current
              navigation.nextEl = nextRef.current
            }
          }}
          navigation={navigationParams}
          thumbs={{ swiper: thumbs !== null && !thumbs.destroyed ? thumbs : null }}
          slidesPerView={1}
          onSlideChange={(instance) => setActiveIndex(instance.activeIndex)}
          className="size-full outline-none"
        >
          {(count > 0 ? items : [undefined]).map((item, index) => (
            <SwiperSlide key={item?.id ?? "empty"}>
              <MediaSlide item={item} empty={empty} active={index === activeIndex} words={words} />
            </SwiperSlide>
          ))}
        </Swiper>

        {count > 1 ? (
          <>
            <span className="absolute top-4 left-4 z-10 flex h-[26px] items-center gap-1.5 rounded-full bg-[#0f172acc] px-2.5 text-[11px] font-semibold text-white">
              <ImageIcon className="size-3.5" />
              {`${String(activeIndex + 1)} / ${String(count)}`}
            </span>
            <button
              ref={prevRef}
              type="button"
              aria-label={words.previous}
              className="absolute top-1/2 left-3 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-foreground shadow-[0_2px_8px_#0F172A33] transition-opacity [&.swiper-button-disabled]:opacity-40"
            >
              <ChevronLeftIcon className="size-4" />
            </button>
            <button
              ref={nextRef}
              type="button"
              aria-label={words.next}
              className="absolute top-1/2 right-3 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-foreground shadow-[0_2px_8px_#0F172A33] transition-opacity [&.swiper-button-disabled]:opacity-40"
            >
              <ChevronRightIcon className="size-4" />
            </button>
          </>
        ) : null}
      </div>

      {count > 0 ? (
        <div className="flex max-w-full items-center gap-2.5">
          <Swiper
            modules={[Thumbs]}
            onSwiper={setThumbs}
            watchSlidesProgress
            slidesPerView="auto"
            spaceBetween={10}
            className="max-w-full"
          >
            {items.map((item, index) => (
              <SwiperSlide key={item.id} className="!w-[72px]">
                <div className="group/thumb relative h-11 w-full">
                  <button
                    type="button"
                    aria-label={`${item.kind === "video" ? words.video : words.image} ${String(index + 1)}`}
                    aria-current={index === activeIndex}
                    /* Swiper's Thumbs module answers pointer taps; this keeps the keyboard working. */
                    onClick={() => mainRef.current?.slideTo(index)}
                    className={`relative block size-full overflow-hidden rounded-md ring-inset ${
                      index === activeIndex ? "ring-2 ring-primary" : "ring-1 ring-glass-border"
                    }`}
                  >
                    {item.kind === "video" ? (
                      <span className="relative block size-full bg-[#0f172a]">
                        <VideoThumb src={item.src} active={index === activeIndex} />
                        <span className="absolute right-1 bottom-1 flex size-4 items-center justify-center rounded-full bg-[#0f172ab3]">
                          <PlayIcon className="size-2.5 fill-white text-white" />
                        </span>
                      </span>
                    ) : (
                      <img src={item.src} alt="" className="size-full object-cover" />
                    )}
                  </button>
                  {onRemove === undefined ? null : (
                    <button
                      type="button"
                      aria-label={words.remove}
                      onClick={() => onRemove(item.id)}
                      className="absolute top-1 right-1 z-10 flex size-4 items-center justify-center rounded-full bg-[#0f172acc] text-white opacity-0 transition-opacity group-focus-within/thumb:opacity-100 group-hover/thumb:opacity-100 hover:bg-[#0f172a]"
                    >
                      <XIcon className="size-2.5" />
                    </button>
                  )}
                </div>
              </SwiperSlide>
            ))}
          </Swiper>
          {action}
        </div>
      ) : (
        /* Nothing to page through: the strip is what the last control hangs on,
           so it stays a row of its own rather than disappearing with the slides. */
        <div className="flex max-w-full items-center gap-2.5">{action}</div>
      )}
    </>
  )
}
