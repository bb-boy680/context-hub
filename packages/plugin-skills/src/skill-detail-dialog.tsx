import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardPasteIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  ImageIcon,
  ImagePlusIcon,
  LibraryIcon,
  LinkIcon,
  MinusIcon,
  MoreHorizontalIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  UploadIcon,
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

import { SkillFileTree, fileTreeKey } from "./file-tree.tsx"
import { parseSkillFile } from "./frontmatter.ts"
import { formatAge, holdsOf, inLibrary, placeOf, placePath, skillKey, useReadablePlaces, type SkillPlaceView } from "./library.ts"
import { mediaKind, setPreviewsSuspended } from "./media.ts"
import { ProvenanceLine } from "./provenance-line.tsx"
import type { MediaItem, Skill } from "./types.ts"
import type {
  PlaceSkillDetail,
  SkillDetail,
  SkillFileEntry,
  SkillPlaceRef,
  SkillStore,
  SkillUpdateCheck,
} from "./store.ts"

import { useI18n } from "@workspace/extensions/react"
import type { AssetScope } from "@workspace/extensions"
import { CodeCard, DialogSplit, PlaceList, TagEditor } from "@workspace/extensions/components"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Markdown } from "@workspace/ui/components/markdown"
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Spinner } from "@workspace/ui/components/spinner"
import { toast } from "@workspace/ui/components/toast"

function titleCase(value: string) {
  return value
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

/**
 * A stage with nothing to play or show renders the skill's own document instead.
 * It scrolls on the vertical axis only: `overflow-y-auto` alone computes
 * `overflow-x` to `auto` as well, and a wrapped line that is one glyph too wide
 * then paints a second scrollbar across the stage. The padding sits on the
 * scroller so the text clears the thumb rather than running under it.
 */
function DocumentStage({ text }: { text: string }) {
  return (
    <div className="size-full scrollbar-gutter-stable overflow-x-hidden overflow-y-auto bg-surface-raised px-8 py-6">
      <Markdown className="mx-auto max-w-[640px] text-[13px] leading-[21px] text-secondary-foreground">
        {text}
      </Markdown>
    </div>
  )
}

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

/** Ratio a slide takes before its media reports its own. */
const FALLBACK_MEDIA_RATIO = 16 / 9

/** One slide: the image itself, or a video carrying its own play control. */
function MediaSlide({
  item,
  doc,
  active,
}: {
  item?: MediaItem
  /** The skill's document, shown when the skill has no media at all. */
  doc: string
  /** The slide Swiper currently shows; drives the video's own play state. */
  active: boolean
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const [playing, setPlaying] = React.useState(false)
  const [muted, setMuted] = React.useState(false)
  const [progress, setProgress] = React.useState(0)
  /* Media arrives in any shape — the skills here ship portrait videos — so the
     stage takes the frame's own ratio and grows until one axis runs out. */
  const [ratio, setRatio] = React.useState(FALLBACK_MEDIA_RATIO)
  const { t } = useI18n()

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

  const seek = (ratio: number) => {
    const video = videoRef.current
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return
    video.currentTime = ratio * video.duration
    setProgress(ratio)
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
        /* `100cqh` is the stage area, which the media pane marks as a size
           container: the frame keeps its ratio and stops at whichever axis runs
           out, so a portrait video fills the height and a landscape one the
           width. A document has no ratio to keep, so it takes the whole stage. */
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
          <DocumentStage text={doc} />
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
              setProgress(
                event.currentTarget.currentTime / (event.currentTarget.duration || 1)
              )
            }
            className="size-full object-cover"
          />
        ) : (
          <img
            src={item.src}
            alt=""
            onLoad={(event) => {
              const media = event.currentTarget
              if (media.naturalHeight > 0) {
                setRatio(media.naturalWidth / media.naturalHeight)
              }
            }}
            className="size-full object-cover"
          />
        )}
        {item?.kind === "video" ? (
          /* Control bar sits over a scrim so the video itself stays unobstructed. */
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-[#0f172ad9] to-transparent px-4 pt-8 pb-3">
          <button
            type="button"
            aria-label={playing ? t("skills.media.pause") : t("skills.media.play")}
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
            aria-label={t("skills.media.seek")}
            onChange={(event) => seek(Number(event.target.value) / 100)}
            className="h-4 min-w-0 flex-1 cursor-pointer accent-white"
          />
          <button
            type="button"
            aria-label={t(muted ? "skills.media.unmute" : "skills.media.mute")}
            onClick={toggleMute}
            className="flex size-6 shrink-0 items-center justify-center rounded-full text-white transition-colors hover:bg-white/20"
          >
            {muted ? (
              <VolumeXIcon className="size-4" />
            ) : (
              <Volume2Icon className="size-4" />
            )}
          </button>
        </div>
      ) : null}
      </div>
    </div>
  )
}

/**
 * Thumbnail for a video. The active one keeps playing muted; the rest hold a
 * frame near the start, so the strip neither goes black nor decodes every
 * video in the gallery.
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

/** Slides the lightbox opens with: the gallery when the skill has one, else its cover. */
function seedItems(skill: Skill): MediaItem[] {
  const sources = skill.gallery?.length
    ? skill.gallery
    : skill.cover
      ? [skill.cover]
      : []
  return sources.map((src, index) => ({
    id: `seed-${index}`,
    kind: mediaKind(src),
    src,
  }))
}

/** What the lightbox can do with its media, depending on where the skill lives. */
interface MediaSource {
  items: MediaItem[]
  /** A library write is in flight. */
  busy: boolean
  /** Files to upload, from a file picker, a drop, or the clipboard. */
  addFiles(files: ArrayLike<File>): Promise<void>
  /** Store a pasted URL or data: URL; rejects with a displayable message. */
  addUrl(src: string): Promise<void>
  remove(id: string): Promise<void>
}

/**
 * The assets the library holds for a skill, with uploads and deletions going
 * through the store, so what the user sees is what is on disk.
 */
function useMediaItems(
  skill: Skill,
  store: SkillStore | null,
  detail: SkillDetail | null,
  onChanged: () => void
): MediaSource {
  const [preview, setPreview] = React.useState<MediaItem[]>(() => seedItems(skill))
  const [busy, setBusy] = React.useState(false)
  const objectUrls = React.useRef<string[]>([])
  const nextId = React.useRef(1)

  React.useEffect(
    () => () => {
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url))
    },
    []
  )

  const items = React.useMemo(() => {
    if (store === null || detail === null) return preview
    return detail.assetDetails.map((asset) => ({
      id: asset.ref,
      kind: asset.kind,
      src: store.assetUrl(asset.ref),
    }))
  }, [store, detail, preview])

  const addFiles = React.useCallback(
    async (files: ArrayLike<File>) => {
      const list = Array.from(files)
      if (store !== null && detail !== null) {
        setBusy(true)
        try {
          for (const file of list) await store.putAsset(detail.id, file)
          onChanged()
        } finally {
          setBusy(false)
        }
        return
      }
      const added: MediaItem[] = []
      for (const file of list) {
        const kind = file.type.startsWith("video/")
          ? "video"
          : file.type.startsWith("image/")
            ? "image"
            : null
        if (!kind) continue
        const url = URL.createObjectURL(file)
        objectUrls.current.push(url)
        added.push({ id: `media-${nextId.current++}`, kind, src: url })
      }
      setPreview((current) => [...current, ...added])
    },
    [store, detail, onChanged]
  )

  const addUrl = React.useCallback(
    async (src: string) => {
      if (store === null || detail === null) {
        setPreview((current) => [
          ...current,
          { id: `media-${nextId.current++}`, kind: mediaKind(src), src },
        ])
        return
      }
      setBusy(true)
      try {
        await store.addAssetSource(detail.id, src)
        onChanged()
      } finally {
        setBusy(false)
      }
    },
    [store, detail, onChanged]
  )

  const remove = React.useCallback(
    async (id: string) => {
      if (store !== null && detail !== null) {
        setBusy(true)
        try {
          await store.deleteAsset(detail.id, id)
          onChanged()
        } finally {
          setBusy(false)
        }
        return
      }
      setPreview((current) => current.filter((item) => item.id !== id))
    },
    [store, detail, onChanged]
  )

  return { items, busy, addFiles, addUrl, remove }
}

/**
 * Swiper mutates its own copy of these params, so one shared template is safe;
 * shorthand booleans would replace the module defaults wholesale.
 */
const navigationParams = { prevEl: null, nextEl: null }

/**
 * Media column of the lightbox. Swiper owns paging, the thumbnails and the
 * keyboard shortcuts; the slides and the actions behind them come from the caller.
 */
function MediaPane({
  doc,
  source,
}: {
  /** The skill's document, shown on a stage with no media. */
  doc: string
  source: MediaSource
}) {
  const { t } = useI18n()
  const { items, busy } = source
  const [activeIndex, setActiveIndex] = React.useState(0)
  const [thumbs, setThumbs] = React.useState<SwiperClass | null>(null)
  const [dragOver, setDragOver] = React.useState(false)
  const [addOpen, setAddOpen] = React.useState(false)
  /* The second entry of the upload menu opens its link field in place, rather
     than stacking a second surface on top of the first. */
  const [addFace, setAddFace] = React.useState<"menu" | "link">("menu")
  const [notice, setNotice] = React.useState<string | null>(null)
  const [link, setLink] = React.useState("")
  const mainRef = React.useRef<SwiperClass | null>(null)
  const fileRef = React.useRef<HTMLInputElement | null>(null)
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

  /* An upload appends a slide; show it, and after a removal keep a neighbour. */
  React.useEffect(() => {
    if (count > lastCount.current) mainRef.current?.slideTo(count - 1)
    else if (count < lastCount.current) {
      mainRef.current?.slideTo(Math.min(activeIndex, Math.max(0, count - 1)))
    }
    lastCount.current = count
  }, [count, activeIndex])

  /*
   * Swiper's own keyboard module listens while events bubble, and the dialog
   * stops them on the way up, so take the arrow keys during capture instead.
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

  /* A screenshot should not have to be saved as a file first, so the paste
     listener is document-wide while this pane is mounted. A file copied in a
     file manager arrives the same way, video included.
     A paste into a field is that field's business: the link box takes a URL, and
     running the listener there would answer a pasted URL with "that is text,
     not an image". */
  React.useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return
      }
      const data = event.clipboardData
      if (data === null) return
      const picked: File[] = []
      for (const item of Array.from(data.items)) {
        if (item.kind !== "file") continue
        if (!item.type.startsWith("image/") && !item.type.startsWith("video/")) continue
        const file = item.getAsFile()
        if (file !== null) picked.push(file)
      }
      if (picked.length === 0) {
        if (data.getData("text") !== "") setNotice(t("skills.media.paste.text"))
        return
      }
      event.preventDefault()
      setNotice(t("skills.media.paste.done").replace("{count}", String(picked.length)))
      void source.addFiles(picked)
    }

    document.addEventListener("paste", onPaste)
    return () => document.removeEventListener("paste", onPaste)
  }, [source, t])

  /* Whatever the upload just said stops saying it on its own. */
  React.useEffect(() => {
    if (notice === null) return
    const timer = window.setTimeout(() => setNotice(null), 4000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const addFiles = (files: ArrayLike<File>) => {
    void source.addFiles(files)
    setAddOpen(false)
  }

  const addLink = () => {
    const value = link.trim()
    if (value === "") return
    void source.addUrl(value).then(
      () => {
        setLink("")
        setAddOpen(false)
      },
      (failure: unknown) => {
        /* A refused fetch is a TypeError; the store's own refusals carry a reason. */
        toast.add({
          type: "error",
          title:
            failure instanceof TypeError
              ? t("skills.media.add.failed")
              : failure instanceof Error
                ? failure.message
                : String(failure),
        })
      }
    )
  }

  return (
    <div
      onDragEnter={(event) => {
        event.preventDefault()
        setDragOver(true)
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        /* `dragleave` also fires when the pointer moves onto a child — and the
           overlay is a child, so acting on those would switch the target off the
           moment it appears. Only a leave that leaves the pane counts. */
        const next = event.relatedTarget
        if (next instanceof Node && event.currentTarget.contains(next)) return
        setDragOver(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragOver(false)
        addFiles(event.dataTransfer.files)
      }}
      className={`relative flex min-h-0 min-w-0 flex-1 flex-col items-center gap-3.5 px-7 py-6 ${
        dragOver ? "ring-2 ring-primary ring-inset" : ""
      }`}
    >
      {/* Dropping is a gesture on the whole media area: it does not go through
          the menu, and it does not need the + to be pressed first. */}
      {dragOver ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2.5 bg-primary/8">
          <ImagePlusIcon className="size-7 text-primary" aria-hidden />
          <span className="text-[15px] font-semibold">{t("skills.media.drop.title")}</span>
          <span className="text-[13px] text-muted-foreground">
            {t("skills.media.drop.formats")}
          </span>
        </div>
      ) : null}
      {notice === null ? null : (
        <span className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full bg-foreground px-3.5 py-1.5 text-[12px] font-medium text-background">
          {notice}
        </span>
      )}
      {/* The stage takes every pixel the strip and the hint leave behind: a
          fixed 16:9 box in this column left a band of empty panel above and
          below it. A slide keeps its own ratio inside the stage, so the frames
          here — portrait videos, mostly — use the full height. */}
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
              <MediaSlide
                item={item}
                doc={doc}
                active={index === activeIndex}
              />
            </SwiperSlide>
          ))}
        </Swiper>

        {count > 1 ? (
          <>
            <span className="absolute top-4 left-4 z-10 flex h-[26px] items-center gap-1.5 rounded-full bg-[#0f172acc] px-2.5 text-[11px] font-semibold text-white">
              <ImageIcon className="size-3.5" />
              {`${activeIndex + 1} / ${count}`}
            </span>
            <button
              ref={prevRef}
              type="button"
              aria-label={t("skills.media.previous")}
              className="absolute top-1/2 left-3 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-foreground shadow-[0_2px_8px_#0F172A33] transition-opacity [&.swiper-button-disabled]:opacity-40"
            >
              <ChevronLeftIcon className="size-4" />
            </button>
            <button
              ref={nextRef}
              type="button"
              aria-label={t("skills.media.next")}
              className="absolute top-1/2 right-3 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-foreground shadow-[0_2px_8px_#0F172A33] transition-opacity [&.swiper-button-disabled]:opacity-40"
            >
              <ChevronRightIcon className="size-4" />
            </button>
          </>
        ) : null}
      </div>

      <div className="flex max-w-full items-center gap-2.5">
        {count > 0 ? (
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
                    aria-label={`${
                      item.kind === "video"
                        ? t("skills.media.video")
                        : t("skills.media.image")
                    } ${index + 1}`}
                    aria-current={index === activeIndex}
                    /* Swiper's Thumbs module answers pointer taps; this keeps the keyboard working. */
                    onClick={() => mainRef.current?.slideTo(index)}
                    className={`relative block size-full overflow-hidden rounded-md ring-inset ${
                      index === activeIndex
                        ? "ring-2 ring-primary"
                        : "ring-1 ring-glass-border"
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
                  <button
                    type="button"
                    aria-label={t("skills.media.remove")}
                    onClick={() => void source.remove(item.id)}
                    className="absolute top-1 right-1 z-10 flex size-4 items-center justify-center rounded-full bg-[#0f172acc] text-white opacity-0 transition-opacity group-focus-within/thumb:opacity-100 group-hover/thumb:opacity-100 hover:bg-[#0f172a]"
                  >
                    <XIcon className="size-2.5" />
                  </button>
                </div>
              </SwiperSlide>
            ))}
          </Swiper>
        ) : null}

        <Popover
          open={addOpen}
          onOpenChange={(next) => {
            setAddOpen(next)
            if (!next) setAddFace("menu")
          }}
        >
          <PopoverTrigger
            render={
              <button
                type="button"
                aria-label={t("skills.media.upload")}
                className="flex h-11 w-[72px] shrink-0 items-center justify-center rounded-md bg-card text-muted-foreground transition-colors hover:text-foreground"
              />
            }
          >
            <PlusIcon className="size-[18px]" />
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="top"
            className={
              addFace === "menu"
                ? "w-[240px] gap-0 overflow-hidden rounded-md bg-card p-0 shadow-soft ring-1 ring-border"
                : "w-[240px] gap-2.5 rounded-md bg-card p-3 shadow-soft ring-1 ring-border"
            }
          >
            {addFace === "menu" ? (
              /* Each entry is its own row, divided by the same hairline the rest
                 of the app uses; the menu carries no padding, so the dividers
                 run the full width. */
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                  className="flex h-12 w-full items-center gap-2.5 border-b border-border px-3 text-left transition-colors hover:bg-accent disabled:opacity-50"
                >
                  <UploadIcon className="size-4 shrink-0 text-copy" aria-hidden />
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate text-[13px] leading-[17px] font-medium">
                      {t("skills.media.add.file")}
                    </span>
                    <span className="truncate text-[11.5px] leading-[15px] text-muted-soft">
                      {t("skills.media.add.fileHint")}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setAddFace("link")}
                  className="flex h-12 w-full items-center gap-2.5 border-b border-border px-3 text-left transition-colors hover:bg-accent"
                >
                  <LinkIcon className="size-4 shrink-0 text-copy" aria-hidden />
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate text-[13px] leading-[17px] font-medium">
                      {t("skills.media.add.link")}
                    </span>
                    <span className="truncate text-[11.5px] leading-[15px] text-muted-soft">
                      {t("skills.media.add.linkHint")}
                    </span>
                  </span>
                </button>
                {/* Paste is a gesture, not an entry: it says what to press and
                    takes no click, so it is a row rather than a button. */}
                <span className="flex h-12 w-full items-center gap-2.5 px-3">
                  <ClipboardPasteIcon className="size-4 shrink-0 text-copy" aria-hidden />
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate text-[13px] leading-[17px] font-medium">
                      {t("skills.media.add.paste")}
                    </span>
                    <span className="truncate text-[11.5px] leading-[15px] text-muted-soft">
                      {t("skills.media.add.pasteHint")}
                    </span>
                  </span>
                </span>
              </>
            ) : (
              <>
                <span className="text-[12px] font-semibold">
                  {t("skills.media.add.linkLabel")}
                </span>
                <div className="flex h-[34px] items-center gap-2 rounded-md border-2 border-primary px-2.5">
                  <LinkIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <input
                    autoFocus
                    value={link}
                    onChange={(event) => setLink(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") addLink()
                    }}
                    placeholder={t("skills.media.add.placeholder")}
                    aria-label={t("skills.media.add.linkLabel")}
                    className="min-w-0 flex-1 bg-transparent font-mono text-[11px] outline-none placeholder:text-muted-soft"
                  />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    className="h-7 rounded-full border-border bg-transparent px-3 text-[12.5px] font-semibold dark:border-input dark:bg-transparent"
                    onClick={() => setAddFace("menu")}
                  >
                    {t("skills.action.cancel")}
                  </Button>
                  <Button
                    className="h-7 rounded-full px-3 text-[12.5px] font-semibold"
                    disabled={busy}
                    onClick={addLink}
                  >
                    {t("skills.media.add.action")}
                  </Button>
                </div>
              </>
            )}
          </PopoverContent>
        </Popover>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files)
            event.target.value = ""
          }}
        />
      </div>

      <p className="text-xs leading-[15px] text-muted-foreground">
        {t("skills.media.hint")}
      </p>
    </div>
  )
}

/**
 * The delete question, anchored to the button it belongs to. Deleting takes the
 * skill's directory with it, so the bubble names the folder before it confirms —
 * and stays open with the reason when the write is refused.
 */
function DeleteBubble({
  name,
  path,
  inPlace,
  onDelete,
  children,
}: {
  name: string
  /** Where the skill's directory sits, or `null` when this form has no library. */
  path: string | null
  /** Whether this question is about a place's directory rather than the library's. */
  inPlace: boolean
  onDelete: () => Promise<void>
  children: React.ReactElement
}) {
  const { t } = useI18n()
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const confirm = () => {
    setBusy(true)
    void (async () => {
      try {
        await onDelete()
      } catch (reason) {
        /* The dialog unmounts on success, so a failure leaves this bubble up
           with the button ready; why it failed is said where every other
           refusal is. */
        toast.add({
          type: "error",
          title: reason instanceof Error ? reason.message : String(reason),
        })
        setBusy(false)
      }
    })()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={children} />
      <PopoverContent
        side="top"
        align="end"
        sideOffset={7}
        className="w-80 gap-3 rounded-md bg-popover p-4 shadow-none ring-1 ring-border"
      >
        <PopoverArrow className="size-[17px] rotate-45 border-b border-l border-border bg-popover" />
        <span className="text-[14px] leading-[18px] font-semibold">
          {t("skills.delete.title").replace("{name}", name)}
        </span>
        <span className="text-[12.5px] leading-[17px] text-copy">
          {t(inPlace ? "skills.delete.workspaceText" : "skills.delete.text")}
        </span>
        {path === null ? null : (
          /* The directory reads as data, so it sits on its own quiet surface
             rather than in the running text. */
          <span className="rounded-md bg-surface-raised px-2.5 py-2 font-mono text-[11px] leading-[15px] text-copy">
            {path}
          </span>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            className="h-8 rounded-full border-border bg-transparent px-[14px] text-[12.5px] font-semibold dark:border-input dark:bg-transparent"
            disabled={busy}
            onClick={() => setOpen(false)}
          >
            {t("skills.action.cancel")}
          </Button>
          {/* Red stays a text and outline colour here: the destructive button is
              outlined, so nothing in the panel is a red block. */}
          <Button
            variant="outline"
            className="h-8 rounded-full border-destructive/35 bg-transparent px-[14px] text-[12.5px] font-semibold text-destructive hover:bg-destructive/5 hover:text-destructive dark:border-destructive/35 dark:bg-transparent"
            disabled={busy}
            onClick={confirm}
          >
            {t("skills.delete.confirm")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Where a browser can read the recorded source, when the record names
 * something public: an `owner/repo` the CLI installed from, or a URL as given.
 * A local path or an ssh remote stays plain text — there is nothing to open.
 */
function sourceHref(skill: Skill): string | null {
  const upstream = skill.upstream
  if (upstream === undefined) return null
  if (/^https?:\/\//.test(upstream.source)) return upstream.source
  if (upstream.sourceType !== "github" || !/^[\w.-]+\/[\w.-]+$/.test(upstream.source)) {
    return null
  }
  const path = upstream.skillPath
  return path === "" ? `https://github.com/${upstream.source}` : `https://github.com/${upstream.source}/tree/HEAD/${path}`
}

/**
 * The source line for a library skill: the package its files came from, and the
 * one action that follows from it. Reading the source means a clone of the
 * whole package, so nothing runs on its own — a person asks, and the last
 * answer a check left on the row seeds what this row shows until the next one.
 */
function SourceSection({
  skill,
  onCheck,
  onUpdate,
}: {
  skill: Skill
  onCheck: () => Promise<SkillUpdateCheck>
  onUpdate: () => Promise<void>
}) {
  const { t, state: locale } = useI18n()
  const upstream = skill.upstream
  /* The last recorded answer, as the check that took it left it. */
  const known = React.useMemo((): SkillUpdateCheck | null => {
    const checked = skill.checked
    if (checked === undefined || upstream === undefined) return null
    return {
      recordedHash: upstream.hash,
      currentHash: checked.currentHash,
      latestHash: checked.latest,
      outdated: checked.latest !== upstream.hash,
      modified: checked.currentHash !== upstream.hash,
    }
  }, [skill.checked, upstream])
  const [state, setState] = React.useState<
    | { kind: "idle" }
    | { kind: "checking" }
    | { kind: "applying" }
    | { kind: "checked"; result: SkillUpdateCheck }
  >(() =>
    known !== null && (known.outdated || known.modified)
      ? { kind: "checked", result: known }
      : { kind: "idle" }
  )

  const check = async () => {
    setState({ kind: "checking" })
    try {
      setState({ kind: "checked", result: await onCheck() })
    } catch (failure) {
      /* The row falls back to what it already knew, and why the check could not
         run is said the way every other refusal is. */
      setState({ kind: "idle" })
      toast.add({
        type: "error",
        title: failure instanceof Error ? failure.message : String(failure),
      })
    }
  }

  const apply = async () => {
    setState({ kind: "applying" })
    try {
      await onUpdate()
      setState({ kind: "idle" })
    } catch (failure) {
      setState({ kind: "idle" })
      toast.add({
        type: "error",
        title: failure instanceof Error ? failure.message : String(failure),
      })
    }
  }

  /* Nothing recorded where these files came from — a skill written here, or
     copied in by hand — so there is no line to show rather than an empty one;
     the provenance line above already says it is local. */
  if (!inLibrary(skill) || upstream === undefined) return null

  const busy = state.kind === "checking" || state.kind === "applying"
  const outdated = state.kind === "checked" && state.result.outdated
  /* A copy a person edited is worth saying whether or not the source moved on:
     it is the reason an update is not free, and the reason to keep a copy. */
  const modified = state.kind === "checked" && state.result.modified
  const text =
    state.kind === "checking"
      ? t("skills.update.checking")
      : state.kind === "applying"
        ? t("skills.update.applying")
        : state.kind === "checked"
          ? state.result.outdated
            ? t("skills.update.available")
            : state.result.modified
              ? t("skills.update.edited")
              : t("skills.update.current")
          : upstream.source
  const label = outdated ? t("skills.update.apply") : t("skills.update.check")
  const checkedAt = skill.checked?.at ?? null
  const href = sourceHref(skill)

  return (
    <div className="flex flex-col gap-1.5 border-b border-border py-2.5">
      <div className="flex h-[30px] items-center justify-between gap-2">
        <span className="text-[12.5px] text-muted-foreground">
          {t("skills.detail.source")}
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          aria-label={`${label} ${skill.name}`}
          onClick={() => void (outdated ? apply() : check())}
          className="h-[30px] shrink-0 gap-1.5 rounded-full border-border bg-transparent px-3 text-[12.5px] font-semibold text-foreground hover:bg-muted dark:border-input dark:bg-transparent"
        >
          {outdated ? (
            <DownloadIcon className="size-[13px]" />
          ) : (
            <RefreshCwIcon className="size-[13px]" />
          )}
          {label}
        </Button>
      </div>
      {href === null ? (
        <span className="truncate font-mono text-[12.5px] text-muted-foreground">
          {upstream.source}
        </span>
      ) : (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="flex h-[17px] min-w-0 items-center gap-1.5 text-[12.5px] text-primary hover:underline"
        >
          <span className="truncate">{upstream.source}</span>
          <ExternalLinkIcon className="size-[13px] shrink-0" />
        </a>
      )}
      {/* Only a newer revision makes the loss real, so only then is the
          warning worded as one. */}
      {outdated && modified ? (
        <span className="text-[12px] text-amber-600 dark:text-amber-400">
          {t("skills.update.modified")}
        </span>
      ) : null}
      {/* With no newer answer at hand, the age of the last one is the fact
          worth showing; a fresh check replaces this line with its result. */}
      {state.kind === "checked" || state.kind === "checking" ? (
        <span className="text-[12px] text-muted-soft">{text}</span>
      ) : checkedAt !== null ? (
        <span className="text-[12px] text-muted-soft">
          {t("skills.update.lastChecked").replace("{age}", formatAge(checkedAt, locale.active))}
        </span>
      ) : null}
    </div>
  )
}

/** The two scopes, in the order a list of places reads them. */
const SCOPES: readonly AssetScope[] = ["workspace", "global"]

/**
 * Every place this skill could live, with the row's own action on each: the way
 * into a place that does not hold it yet is here, not only the way out of the
 * ones that do. A place is a property of the skill — the card reads how many
 * hold it, and this section is what that count means.
 */
function PlacesSection({
  skill,
  path,
  places,
  blocked,
  onAdopt,
  onInstall,
  onRemove,
}: {
  skill: Skill
  /** The skill's directory, spelled as a person would write it; `null` when unknown. */
  path: string | null
  /** Every place an agent keeps skills in, as the contributions describe them. */
  places: readonly SkillPlaceView[]
  /** Why a workspace place cannot be written, ready to show; `null` when one can. */
  blocked: string | null
  onAdopt: (ref: SkillPlaceRef) => void
  onInstall: (ref: SkillPlaceRef) => void
  onRemove: (ref: SkillPlaceRef) => void
}) {
  const { t } = useI18n()
  const holds = holdsOf(skill)
  const own = inLibrary(skill)
  /* The library is one of the rows, so it is one of the count: a skill the hub
     holds is installed in one place even when no workspace link exists yet. */
  const installed = holds.length + (own ? 1 : 0)
  /* The icon and the label are the contribution's, since only the extension
     that knows a place can draw it. */
  const contributed = useReadablePlaces()
  const icons = React.useMemo(
    () => new Map(contributed.map((place) => [place.id, place.icon])),
    [contributed]
  )
  const byId = React.useMemo(
    () => new Map(places.map((place) => [place.id, place])),
    [places]
  )

  /* Rows are told apart by their marks and names; the one rule in this list
     separates the two scopes. */
  const row = "flex h-14 items-center gap-2.5"
  const plate =
    "flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-surface-raised ring-1 ring-border ring-inset"
  const label = "truncate text-[12.5px] leading-[15px] font-semibold"
  const where = "truncate font-mono text-[10.5px] leading-[14px] text-muted-foreground"
  /* One size for every row action: the design's 30px pill. */
  const pill = "h-[30px] shrink-0 gap-1.5 rounded-full px-3 text-[12.5px] font-semibold"
  /* Installing is the row's own action, so it reads as a soft fill; undoing it
     is what the row offers once the place holds the skill, and reads as one. */
  const soft = `${pill} bg-secondary text-foreground hover:bg-accent`
  const outlinePill = `${pill} border-border bg-transparent text-copy hover:bg-muted hover:text-foreground dark:border-input dark:bg-transparent`

  /* Held, the row offers the way out; not held, the way in — unless the place
     cannot take it: a workspace with no folder to write into, or a name another
     skill already holds there. */
  const rowAction = (id: string) => {
    const place = byId.get(id)
    if (place === undefined) return null
    const held = holds.some((hold) => hold.id === place.id)
    if (held) {
      return (
        <Button
          type="button"
          variant="outline"
          aria-label={`${t("skills.action.remove")} ${skill.name}`}
          onClick={() => onRemove({ scope: place.scope, dir: place.dir })}
          className={outlinePill}
        >
          <MinusIcon className="size-[13px]" />
          {t("skills.action.remove")}
        </Button>
      )
    }
    const taken = skill.takenAt?.includes(place.id) === true
    /* A workspace place has nothing to write into without a folder; a
       machine-wide one never needs one. */
    const unavailable = place.scope === "workspace" ? blocked : null
    return (
      <Button
        type="button"
        variant="ghost"
        aria-label={`${t("skills.action.install")} ${skill.name}`}
        disabled={taken || unavailable !== null}
        title={taken ? t("skills.workspace.taken") : (unavailable ?? undefined)}
        onClick={() => onInstall({ scope: place.scope, dir: place.dir })}
        className={soft}
      >
        <PlusIcon className="size-[13px]" />
        {t("skills.action.install")}
      </Button>
    )
  }

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[13px] leading-[16px] font-semibold">
          {t("skills.detail.places")}
        </span>
        <span className="text-[12.5px] text-muted-foreground">
          {t("skills.detail.places.held").replace("{count}", String(installed))}
        </span>
      </div>
      <ul className="flex flex-col gap-2.5">
        <li className={row}>
          <span className={plate}>
            <LibraryIcon className="size-[15px] text-copy" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className={label}>{t("skills.location.library")}</span>
            {path === null ? null : <span className={where}>{path}</span>}
          </span>
          {own ? (
            <span className="flex h-[22px] shrink-0 items-center rounded-full px-[9px] text-[11px] font-medium text-copy ring-1 ring-border">
              {t(skill.linkAt === "library" ? "skills.place.link" : "skills.place.body")}
            </span>
          ) : (
            <Button
              type="button"
              variant="ghost"
              aria-label={`${t("skills.action.adopt")} ${skill.name}`}
              onClick={() => {
                const hold = holds[0]
                if (hold !== undefined) onAdopt({ scope: hold.scope, dir: hold.dir })
              }}
              className={soft}
            >
              <PlusIcon className="size-[13px]" />
              {t("skills.action.adopt")}
            </Button>
          )}
        </li>
        {/* Every scope this build reads, drawn by the same list the menus use:
            a person who has learned one place list has learned them all. */}
        <PlaceList
          groups={SCOPES.map((scope) => ({
            label: t(`skills.group.${scope}`),
            options: places
              .filter((place) => place.scope === scope)
              .map((place) => ({
                id: place.id,
                icon: icons.get(place.id) ?? LibraryIcon,
                label: t(place.labelKey),
                where: placePath(place),
                selected: holds.some((hold) => hold.id === place.id),
              })),
          }))}
          words={{
            expand: (rest) => t("skills.place.expand").replace("{count}", String(rest)),
            collapse: t("skills.place.collapse"),
          }}
          action={(option) => rowAction(option.id)}
        />
      </ul>
    </section>
  )
}

function InfoPanel({
  skill,
  blocked,
  path,
  inPlace,
  places,
  onDelete,
  onAdopt,
  onInstallPlace,
  onRemovePlace,
  onCheckUpdate,
  onUpdate,
  onViewFiles,
  onTagsChange,
  tagSuggestions,
}: {
  skill: Skill
  /** Why a workspace place cannot be written, ready to show; `null` when one can. */
  blocked: string | null
  /** The skill's directory, spelled as a person would write it. */
  path: string | null
  /** Whether the directory above is a place's rather than the library's. */
  inPlace: boolean
  /** Every place an agent keeps skills in, with what each holds. */
  places: readonly SkillPlaceView[]
  /** `null` when this skill cannot be deleted from here. */
  onDelete: (() => Promise<void>) | null
  /** Copy a skill a place wrote into the library. */
  onAdopt: (ref: SkillPlaceRef) => void
  /** Link this skill into a place that does not hold it yet. */
  onInstallPlace: (ref: SkillPlaceRef) => void
  /** Take back the link that put it there. */
  onRemovePlace: (ref: SkillPlaceRef) => void
  /** Measure this skill against the source it was installed from; `undefined`
      on a form with no library, where there is nothing to compare. */
  onCheckUpdate?: () => Promise<SkillUpdateCheck>
  /** Install that source's current revision over this copy. */
  onUpdate?: () => Promise<void>
  onViewFiles: () => void
  onTagsChange: (tags: string[]) => void
  /** Every type in use across the library, for the editor's quick picks. */
  tagSuggestions: string[]
}) {
  const { t } = useI18n()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-[84px] shrink-0 items-start gap-3 border-b border-border px-5 pt-[22px]">
        <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
          <DialogTitle className="truncate text-[16px] leading-[21px] font-semibold">
            {skill.name}
          </DialogTitle>
          <DialogDescription className="flex min-w-0 items-center gap-2">
            <ProvenanceLine skill={skill} />
          </DialogDescription>
        </div>
        <DialogClose
          render={
            <Button
              variant="ghost"
              size="icon"
              className="mt-1 size-8 rounded-full"
              aria-label={t("skills.action.close")}
            />
          }
        >
          <XIcon className="size-4 text-copy" />
        </DialogClose>
      </div>

      {/* Everything between the heading and the footer scrolls: seven places
          alone outrun the panel, and the actions have to stay put. The bottom
          padding is what keeps the last line clear of the footer. */}
      <div className="flex min-h-0 min-w-0 flex-1 scrollbar-gutter-stable flex-col gap-[18px] overflow-y-auto px-5 pt-5 pb-5">
        {/* Description, then the categories, then where it lives, then where it
            came from — the order the panel is read in. */}
        <p className="text-[13px] leading-[1.5] text-copy">{skill.description}</p>

        <TagEditor
          tags={skill.tags}
          suggestions={tagSuggestions}
          onChange={onTagsChange}
          words={{
            add: t("skills.detail.category.add"),
            placeholder: t("skills.detail.category.placeholder"),
            remove: t("skills.detail.category.remove"),
          }}
        />

        <PlacesSection
          skill={skill}
          path={path}
          places={places}
          blocked={blocked}
          onAdopt={onAdopt}
          onInstall={onInstallPlace}
          onRemove={onRemovePlace}
        />

        {/* Where it came from, then when it last changed: the age answers the
            same question the source block asks, so it sits with it. */}
        <div className="flex flex-col">
          {onCheckUpdate === undefined || onUpdate === undefined ? null : (
            <SourceSection skill={skill} onCheck={onCheckUpdate} onUpdate={onUpdate} />
          )}
          {skill.updated === "" ? null : (
            <div className="flex h-[30px] items-center justify-between gap-2">
              <span className="text-[12.5px] text-muted-foreground">
                {t("skills.detail.updated")}
              </span>
              <span className="text-[12.5px] text-foreground">{skill.updated}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex h-16 shrink-0 items-center gap-2.5 border-t border-border px-5">
        <Button className="h-10 flex-1 gap-[7px] rounded-full text-[13.5px] font-semibold" onClick={onViewFiles}>
          <FileTextIcon className="size-[15px]" />
          {t("skills.detail.files.action")}
        </Button>
        {/* Deleting is another class of action, so it sits apart from the main
            one rather than in the same visual slot. */}
        {onDelete === null ? null : (
          <DeleteBubble
            name={skill.name}
            path={path}
            inPlace={inPlace}
            onDelete={onDelete}
          >
            <Button
              variant="outline"
              className="h-10 shrink-0 gap-[7px] rounded-full border-destructive/35 bg-transparent px-4 text-[13.5px] font-semibold text-destructive hover:bg-destructive/5 hover:text-destructive aria-expanded:bg-transparent aria-expanded:text-destructive dark:border-destructive/35 dark:bg-transparent"
            >
              <Trash2Icon className="size-[15px]" />
              {t("skills.detail.delete")}
            </Button>
          </DeleteBubble>
        )}
      </div>
    </div>
  )
}

/** Slides in from the right over the info panel, leaving the media strip dimmed behind it. */
function FilesPanel({
  skill,
  files,
  read,
  open,
  onBack,
}: {
  skill: Skill
  /** One entry per file and folder the skill directory holds. */
  files: SkillFileEntry[]
  /** Read one of those files, wherever this skill's files live. */
  read: (path: string) => Promise<string>
  open: boolean
  onBack: () => void
}) {
  const { t } = useI18n()
  /* SKILL.md is what a skill is for, so it is what opens first. */
  const fallback =
    files.find((file) => file.path === "SKILL.md")?.path ??
    files.find((file) => !file.directory)?.path ??
    null
  const [picked, setPicked] = React.useState<string | null>(null)
  /* Another skill's files make a remembered path meaningless; the fallback wins. */
  const current = picked !== null && files.some((file) => file.path === picked) ? picked : fallback
  /* What was read is kept with the file it came from, so a row that just
     changed shows its own state rather than the previous file's text. */
  const [content, setContent] = React.useState<{ path: string; text: string }>()

  React.useEffect(() => {
    if (current === null) return
    let live = true
    read(current).then(
      (text) => {
        if (live) setContent({ path: current, text })
      },
      (reason: unknown) => {
        /* The card has no text to show either way; why the read failed is said
           where every other refusal is. */
        toast.add({
          type: "error",
          title: reason instanceof Error ? reason.message : String(reason),
        })
      }
    )
    return () => {
      live = false
    }
  }, [current, read])

  const loaded = content !== undefined && content.path === current ? content : null
  const name = current === null ? "" : (current.split("/").at(-1) ?? current)

  return (
    <div
      aria-hidden={!open}
      className={`absolute inset-y-0 right-0 z-20 flex w-[880px] max-w-full flex-col border-l border-border bg-dialog transition-transform duration-300 ease-out ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="flex h-14 shrink-0 items-center gap-3 px-5">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("skills.detail.files.back")}
          onClick={onBack}
        >
          <ArrowLeftIcon />
        </Button>
        <span className="text-sm leading-[17px] font-semibold">
          {skill.name}
        </span>
        <span className="text-sm leading-[17px] text-muted-foreground">
          {`/ ${t("skills.detail.files")}`}
        </span>
        <DialogClose
          render={
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto shrink-0"
              aria-label={t("skills.action.close")}
            />
          }
        >
          <XIcon className="text-muted-foreground" />
        </DialogClose>
      </div>
      <div className="h-px shrink-0 bg-border" />

      <div className="flex min-h-0 flex-1 gap-5 p-5">
        <div className="flex w-[224px] shrink-0 flex-col overflow-auto">
          <SkillFileTree
            key={fileTreeKey(files)}
            files={files}
            selected={current ?? ""}
            onSelect={setPicked}
          />
        </div>

        <CodeCard
          title={name}
          path={current ?? ""}
          text={loaded === null ? undefined : loaded.text}
          trailing={<MoreHorizontalIcon className="size-4 shrink-0 text-muted-foreground" />}
          className="flex-1"
        >
          {loaded === null ? (
            <div className="flex items-center gap-2 p-3.5 text-xs text-muted-foreground">
              <Spinner />
              {t("skills.detail.files.loading")}
            </div>
          ) : null}
        </CodeCard>
      </div>
    </div>
  )
}

/** One row of the files panel, from either the library's tree or a place's. */
/** The files a skill holds, and the way to read any one of them. */
interface SkillFiles {
  files: SkillFileEntry[]
  read: (path: string) => Promise<string>
}

/** Nothing to show on a form with no library at all, and nothing to read. */
const NO_FILES: SkillFiles = {
  files: [],
  read: () => Promise.reject(new Error("this form has no skill library")),
}

/** The files the panel lists: the library's own tree, or the place's. */
function useSkillFiles(
  skill: Skill,
  store: SkillStore | null,
  detail: SkillDetail | null,
  held: PlaceSkillDetail | null
): SkillFiles {
  const attached = store !== null && (detail !== null || held !== null)
  const hold = holdsOf(skill)[0]
  const read = React.useCallback(
    (path: string): Promise<string> => {
      if (store === null) return Promise.reject(new Error("this form has no skill library"))
      /* A skill no library record holds is read where its place keeps it; the
         library's own files are also where a linked skill's files end up. */
      return hold === undefined || inLibrary(skill)
        ? store.readFile(skill.id, path)
        : store.placeFile(skill.id, path, { scope: hold.scope, dir: hold.dir })
    },
    [store, skill, hold]
  )
  return React.useMemo(() => {
    if (!attached) return NO_FILES
    return { files: detail?.files ?? held?.files ?? [], read }
  }, [attached, detail, held, read])
}

function LightboxBody({
  skill,
  detail,
  held,
  store,
  root,
  placePath,
  inPlace,
  blocked,
  places,
  onInstallPlace,
  onRemovePlace,
  onAdopt,
  onDelete,
  onCheckUpdate,
  onUpdate,
  onTagsChange,
  onChanged,
  tagSuggestions,
}: {
  skill: Skill
  /** The stored record, present when a library answered. */
  detail: SkillDetail | null
  /** The place's own record, present when the skill lives in one. */
  held: PlaceSkillDetail | null
  store: SkillStore | null
  /** The skills root as the library spells it, for the delete question. */
  root: string | null
  /** The place's skills root, as it reads; for a skill kept there. */
  placePath: string | null
  /** Whether the skill lives in a place rather than only in the library. */
  inPlace: boolean
  /** Why a workspace place cannot be written, ready to show; `null` when one can. */
  blocked: string | null
  /** Every place an agent keeps skills in, with what each holds. */
  places: readonly SkillPlaceView[]
  /** Link this skill into a place that does not hold it yet. */
  onInstallPlace: (ref: SkillPlaceRef) => void
  /** Take back the link that put it there. */
  onRemovePlace: (ref: SkillPlaceRef) => void
  /** Copy a skill a place wrote into the library. */
  onAdopt: (ref: SkillPlaceRef) => void
  onDelete: (() => Promise<void>) | null
  /** Measure this skill against the source it was installed from; `undefined`
      on a form with no library, where there is nothing to compare. */
  onCheckUpdate?: () => Promise<SkillUpdateCheck>
  /** Install that source's current revision over this copy. */
  onUpdate?: () => Promise<void>
  onTagsChange: (tags: string[]) => void
  /** The stored record changed; the caller re-reads its page. */
  onChanged: () => void
  /** Every type in use across the library, for the editor's quick picks. */
  tagSuggestions: string[]
}) {
  const [filesOpen, setFilesOpen] = React.useState(false)
  const media = useMediaItems(skill, store, detail, onChanged)
  const files = useSkillFiles(skill, store, detail, held)
  /* The stage's fallback is the document itself: the stored body, the workspace's
     own file without its frontmatter, or the row's heading and description. */
  const doc = React.useMemo(() => {
    const body =
      detail !== null
        ? detail.body
        : held !== null
          ? parseSkillFile(held.text).body
          : ""
    return body.trim() === ""
      ? `# ${titleCase(skill.name)}\n\n${skill.description}`
      : body
  }, [detail, held, skill])
  /* Each skill's directory: the library's for a library skill, the place's for
     one kept there. */
  const base = inPlace ? placePath : root
  const path = base === null ? null : `${base.replaceAll("\\", "/")}/${skill.id}`

  /* The catalog stays mounted behind the dialog; stop its previews decoding. */
  React.useEffect(() => {
    setPreviewsSuspended(true)
    return () => setPreviewsSuspended(false)
  }, [])

  return (
    <DialogSplit
      pane={<MediaPane doc={doc} source={media} />}
      panel={
        <InfoPanel
          skill={skill}
          blocked={blocked}
          path={path}
          inPlace={inPlace}
          places={places}
          onDelete={onDelete}
          onAdopt={onAdopt}
          onInstallPlace={onInstallPlace}
          onRemovePlace={onRemovePlace}
          onCheckUpdate={onCheckUpdate}
          onUpdate={onUpdate}
          onViewFiles={() => setFilesOpen(true)}
          onTagsChange={onTagsChange}
          tagSuggestions={tagSuggestions}
        />
      }
      overlay={
        <>
          <div
            className={`pointer-events-none absolute inset-0 z-10 bg-scrim transition-opacity duration-300 ${
              filesOpen ? "opacity-100" : "opacity-0"
            }`}
          />
          <FilesPanel
            skill={skill}
            files={files.files}
            read={files.read}
            open={filesOpen}
            onBack={() => setFilesOpen(false)}
          />
        </>
      }
    />
  )
}

/** Detail lightbox for one skill; opens on click from either view. */
export function SkillDetailDialog({
  skill,
  store,
  root,
  places,
  blocked,
  onInstallPlace,
  onRemovePlace,
  onAdopt,
  onDelete,
  onDeletePlace,
  onCheckUpdate,
  onUpdate,
  onTagsChange,
  onChanged,
  tagSuggestions,
  onOpenChange,
}: {
  skill: Skill | null
  /** The library behind the catalog, or `null` while the bundle is on screen. */
  store: SkillStore | null
  /** Where the library keeps its skills, as it spells the path. */
  root: string | null
  /** The places in use, which carry each one's directory and display path. */
  places: readonly SkillPlaceView[]
  /** Why a workspace place cannot be written, ready to show; `null` when one can. */
  blocked: string | null
  /** Link this skill into a place that does not hold it yet. */
  onInstallPlace: (skill: Skill, ref: SkillPlaceRef) => void
  /** Take back the link that put it there. */
  onRemovePlace: (skill: Skill, ref: SkillPlaceRef) => void
  /** Copy a skill a place wrote into the library. */
  onAdopt: (skill: Skill, ref: SkillPlaceRef) => void
  /** Delete the skill and everything the hub stores for it. */
  onDelete: (skill: Skill) => Promise<void>
  /** Delete a skill's directory from the place holding it. */
  onDeletePlace: (skill: Skill, ref: SkillPlaceRef) => Promise<void>
  /** Measure one skill against the source its files came from. */
  onCheckUpdate?: (skill: Skill) => Promise<SkillUpdateCheck>
  /** Install that source's current revision over this copy. */
  onUpdate?: (skill: Skill) => Promise<void>
  onTagsChange: (tags: string[]) => void
  /** The stored record changed; the caller re-reads its page. */
  onChanged: () => void
  /** Every type in use across the library, for the editor's quick picks. */
  tagSuggestions: string[]
  onOpenChange: (open: boolean) => void
}) {
  const [loaded, setLoaded] = React.useState<{ id: string; detail: SkillDetail } | null>(null)
  const [held, setHeld] = React.useState<{ id: string; detail: PlaceSkillDetail } | null>(null)
  const id = skill?.id ?? null
  /* Where the row's files live, and whether the library holds it too. */
  const place = skill === null ? null : placeOf(skill, places)
  const inLib = skill !== null && inLibrary(skill)
  const placeOnly = skill !== null && !inLib && place !== null
  const placeRef = place?.ref ?? null

  /* Load the stored record whenever the lightbox opens on a library skill, and
     again after a write moves its timestamp. A skill no library record holds
     has none, and asking for one is a request that can only fail. */
  React.useEffect(() => {
    if (store === null || id === null || !inLib) return
    let live = true
    void (async () => {
      try {
        const detail = await store.get(id)
        if (live) setLoaded({ id, detail })
      } catch {
        /* A removed or unreadable skill leaves the dialog on the catalog row. */
      }
    })()
    return () => {
      live = false
    }
  }, [store, id, inLib, skill?.stamp])

  /* Only the record for the skill on screen counts; a stale one is ignored. */
  const detail = loaded !== null && loaded.id === id ? loaded.detail : null

  /* A skill no library record holds lives outside the library, so its own
     manifest and files are read from the place that keeps them. */
  React.useEffect(() => {
    if (store === null || id === null || !placeOnly || placeRef === null) return
    let live = true
    void (async () => {
      try {
        const found = await store.placeSkill(id, placeRef)
        if (live && found !== null) setHeld({ id, detail: found })
      } catch {
        /* An unreadable skill leaves the panel on the catalog row it came from. */
      }
    })()
    return () => {
      live = false
    }
  }, [store, id, placeOnly, placeRef])

  const workspace = held !== null && held.id === id ? held.detail : null

  return (
    <Dialog open={skill !== null} onOpenChange={onOpenChange}>
      {skill ? (
        <LightboxBody
          key={skillKey(skill)}
          skill={skill}
          detail={detail}
          held={workspace}
          store={store}
          root={root}
          placePath={place?.display ?? null}
          inPlace={placeOnly}
          blocked={blocked}
          places={places}
          onInstallPlace={(ref) => onInstallPlace(skill, ref)}
          onRemovePlace={(ref) => onRemovePlace(skill, ref)}
          onAdopt={(ref) => onAdopt(skill, ref)}
          /* Each side deletes what it owns: the library its record, the place
             its directory. */
          onDelete={
            store === null
              ? null
              : placeOnly && placeRef !== null
                ? () => onDeletePlace(skill, placeRef)
                : () => onDelete(skill)
          }
          {...(onCheckUpdate === undefined || onUpdate === undefined
            ? {}
            : {
                onCheckUpdate: () => onCheckUpdate(skill),
                onUpdate: () => onUpdate(skill),
              })}
          onTagsChange={onTagsChange}
          onChanged={onChanged}
          tagSuggestions={tagSuggestions}
        />
      ) : null}
    </Dialog>
  )
}
