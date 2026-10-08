import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CodeIcon,
  DownloadIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  ImageIcon,
  LibraryIcon,
  MoreHorizontalIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  PowerIcon,
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

import { skillKey } from "./library.ts"
import { mediaKind, setPreviewsSuspended } from "./media.ts"
import { ProvenanceLine } from "./provenance-line.tsx"
import { seedTags, tagTone } from "./tags.ts"
import type { MediaItem, Skill } from "./types.ts"
import type { SkillDetail, SkillStore, WorkspaceSkillDetail } from "./store.ts"

import { useI18n } from "@workspace/extensions/react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Spinner } from "@workspace/ui/components/spinner"

/** Frontmatter lines a preview shows: the fields the skill actually carries. */
function frontmatterLines(skill: Skill): string[] {
  const tags = skill.tags.length > 0 ? `tags: [${skill.tags.join(", ")}]` : null
  return [
    "---",
    `name: ${skill.name}`,
    `description: ${skill.summary}`,
    ...(tags === null ? [] : [tags]),
    "---",
  ]
}

/** SKILL.md as the editor renders it: frontmatter, a heading, steps, then guardrails. */
function skillFile(skill: Skill): { text: string; className: string }[] {
  const lowercase = skill.summary.charAt(0).toLowerCase() + skill.summary.slice(1)

  return [
    ...frontmatterLines(skill).map((line) => ({
      text: line,
      className: line === "---" ? "text-muted-foreground" : "text-secondary-foreground",
    })),
    { text: "", className: "text-muted-foreground" },
    { text: `# ${titleCase(skill.name)}`, className: "font-semibold text-foreground" },
    { text: "", className: "text-muted-foreground" },
    { text: `Apply this skill to ${lowercase}.`, className: "text-secondary-foreground" },
    { text: "", className: "text-muted-foreground" },
    { text: "## Steps", className: "font-semibold text-foreground" },
    { text: "1. Read the request and the target files", className: "text-secondary-foreground" },
    { text: "2. Apply the rules this skill defines", className: "text-secondary-foreground" },
    { text: "3. Report what changed and why", className: "text-secondary-foreground" },
    { text: "", className: "text-muted-foreground" },
    { text: "## Guardrails", className: "font-semibold text-foreground" },
    { text: "- Never invent facts that are not in the source", className: "text-secondary-foreground" },
  ]
}

/** The skill folder; the active row is the file shown in the editor. */
const fileTree = [
  { name: "skill", kind: "folder", depth: 0 },
  { name: "SKILL.md", kind: "file", depth: 1, active: true },
  { name: "reference.md", kind: "file", depth: 1 },
  { name: "examples", kind: "folder", depth: 1 },
  { name: "basic.md", kind: "file", depth: 2 },
  { name: "scripts", kind: "folder", depth: 1 },
  { name: "extract.py", kind: "file", depth: 2 },
] as const

function titleCase(value: string) {
  return value
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

function MarkdownPreview({ skill }: { skill: Skill }) {
  return (
    <div className="flex size-full flex-col justify-center gap-0.5 bg-surface-raised px-4 font-mono text-[10.5px] leading-[14px]">
      {frontmatterLines(skill).map((line, index) => (
        <span
          key={index}
          className={
            line === "---"
              ? "truncate text-muted-foreground/70"
              : "truncate text-secondary-foreground/80"
          }
        >
          {line}
        </span>
      ))}
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

/** One slide: the image itself, or a video carrying its own play control. */
function MediaSlide({
  item,
  skill,
  active,
}: {
  item?: MediaItem
  skill: Skill
  /** The slide Swiper currently shows; drives the video's own play state. */
  active: boolean
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const [playing, setPlaying] = React.useState(false)
  const [muted, setMuted] = React.useState(false)
  const [progress, setProgress] = React.useState(0)
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
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-[#0f172a]">
      {!item ? (
        <MarkdownPreview skill={skill} />
      ) : item.kind === "video" ? (
        <video
          ref={videoRef}
          src={item.src}
          playsInline
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
        <img src={item.src} alt="" className="size-full object-cover" />
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
  /** Whether uploads reach the library; a preview-only form keeps them in memory. */
  persists: boolean
  /** A library write is in flight. */
  busy: boolean
  addFiles(files: FileList): Promise<void>
  /** Store a pasted URL or data: URL; rejects with a displayable message. */
  addUrl(src: string): Promise<void>
  remove(id: string): Promise<void>
}

/**
 * Library assets when a store answers, the bundled gallery otherwise. Uploads
 * and deletions go through the store, so what the user sees is what is on disk.
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
    async (files: FileList) => {
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

  return { items, persists: store !== null, busy, addFiles, addUrl, remove }
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
function MediaPane({ skill, source }: { skill: Skill; source: MediaSource }) {
  const { t } = useI18n()
  const { items, busy, persists } = source
  const [activeIndex, setActiveIndex] = React.useState(0)
  const [thumbs, setThumbs] = React.useState<SwiperClass | null>(null)
  const [dragOver, setDragOver] = React.useState(false)
  const [addOpen, setAddOpen] = React.useState(false)
  const [link, setLink] = React.useState("")
  const [addError, setAddError] = React.useState<string | null>(null)
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

  const addFiles = (files: FileList) => {
    void source.addFiles(files)
    setAddOpen(false)
  }

  const addLink = () => {
    const value = link.trim()
    if (value === "") return
    void source.addUrl(value).then(
      () => {
        setLink("")
        setAddError(null)
        setAddOpen(false)
      },
      (failure: unknown) => {
        /* A refused fetch is a TypeError; the store's own refusals carry a reason. */
        if (failure instanceof TypeError) setAddError(t("skills.media.add.failed"))
        else setAddError(failure instanceof Error ? failure.message : String(failure))
      }
    )
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragOver(false)
        addFiles(event.dataTransfer.files)
      }}
      className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-4 bg-secondary px-4 py-6 ${
        dragOver ? "ring-2 ring-primary ring-inset" : ""
      }`}
    >
      <div className="relative w-full max-w-[720px]">
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
          className="w-full outline-none"
        >
          {(count > 0 ? items : [undefined]).map((item, index) => (
            <SwiperSlide key={item?.id ?? "empty"}>
              <MediaSlide item={item} skill={skill} active={index === activeIndex} />
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
            if (!next) setAddError(null)
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
          <PopoverContent align="start" side="top" className="w-80 gap-2.5 p-3">
            <span className="text-xs font-semibold text-muted-foreground">
              {t("skills.media.add.title")}
            </span>
            <div className="flex items-center gap-2">
              <Input
                value={link}
                onChange={(event) => setLink(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") addLink()
                }}
                placeholder={t("skills.media.add.placeholder")}
                aria-label={t("skills.media.add.placeholder")}
                className="h-8 flex-1"
              />
              <Button size="sm" className="h-8 px-3" disabled={busy} onClick={addLink}>
                {t("skills.media.add.action")}
              </Button>
            </div>
            {addError !== null ? (
              <p className="text-[11px] leading-[15px] text-destructive">{addError}</p>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="h-8 justify-start gap-2 border-input bg-transparent dark:bg-transparent"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              {busy ? <Spinner className="size-3.5" /> : <UploadIcon className="size-3.5" />}
              {t("skills.media.add.file")}
            </Button>
            <p className="text-[11px] leading-[15px] text-muted-foreground">
              {persists ? t("skills.media.add.hint") : t("skills.media.add.hintPreview")}
            </p>
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

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-[30px] items-center justify-between border-b border-border last:border-b-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xs font-medium">{value}</dd>
    </div>
  )
}

/** Category chips with inline add and remove; new names join the tint set by hash. */
function CategoryEditor({
  tags,
  onChange,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
}) {
  const { t } = useI18n()
  const [open, setOpen] = React.useState(false)
  const [value, setValue] = React.useState("")
  const available = seedTags.filter((tag) => !tags.includes(tag))

  const add = (tag: string) => {
    const next = tag.trim()
    if (next === "" || tags.includes(next)) return
    onChange([...tags, next])
    setValue("")
  }

  return (
    <section className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-muted-foreground">
        {t("skills.detail.category")}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className={`group/tag flex h-5 shrink-0 items-center gap-0.5 rounded-full pr-1.5 pl-2 text-xs font-medium ${tagTone(tag).chip} ${tagTone(tag).label}`}
          >
            {tag}
            <button
              type="button"
              aria-label={`${t("skills.detail.category.remove")} ${tag}`}
              onClick={() => onChange(tags.filter((item) => item !== tag))}
              className="flex size-3.5 items-center justify-center rounded-full opacity-50 transition-opacity hover:opacity-100"
            >
              <XIcon className="size-2.5" />
            </button>
          </span>
        ))}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <button
                type="button"
                aria-label={t("skills.detail.category.add")}
                className="flex size-5 shrink-0 items-center justify-center rounded-full border border-dashed border-input text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
              />
            }
          >
            <PlusIcon className="size-3" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-60 gap-2 p-2">
            <Input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") add(value)
              }}
              placeholder={t("skills.detail.category.placeholder")}
              aria-label={t("skills.detail.category.placeholder")}
              className="h-8"
            />
            {available.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {available.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => add(tag)}
                    className={`flex h-5 shrink-0 items-center rounded-full px-2 text-xs font-medium transition-opacity hover:opacity-80 ${tagTone(tag).chip} ${tagTone(tag).label}`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            ) : null}
          </PopoverContent>
        </Popover>
      </div>
    </section>
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
  onDelete,
  children,
}: {
  name: string
  /** Where the skill's directory sits, or `null` when this form has no library. */
  path: string | null
  onDelete: () => Promise<void>
  children: React.ReactElement
}) {
  const { t } = useI18n()
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [failure, setFailure] = React.useState<string | null>(null)

  const confirm = () => {
    setBusy(true)
    setFailure(null)
    void (async () => {
      try {
        await onDelete()
      } catch (reason) {
        /* The dialog unmounts on success, so a failure is the only state left. */
        setFailure(reason instanceof Error ? reason.message : String(reason))
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
        className="w-80 gap-2.5 rounded-lg bg-dialog px-4 py-3.5 shadow-[0_8px_24px_#0F172A29] ring-glass-border backdrop-blur-xl"
      >
        <PopoverArrow className="size-3 rotate-45 border-b border-l border-glass-border bg-dialog" />
        <span className="text-[13.5px] leading-[17px] font-semibold">
          {t("skills.delete.title").replace("{name}", name)}
        </span>
        <span className="text-xs leading-[15px] text-muted-foreground">
          {t("skills.delete.text")}
        </span>
        {path !== null && (
          <span className="truncate font-mono text-[11.5px] leading-[14px] text-secondary-foreground">
            {path}
          </span>
        )}
        {failure !== null && (
          <span className="text-xs leading-[15px] text-destructive">
            {failure}
          </span>
        )}
        <div className="flex items-center justify-end gap-2 pt-0.5">
          <Button
            variant="outline"
            size="sm"
            className="border-border bg-transparent px-3 text-xs dark:border-input dark:bg-transparent"
            disabled={busy}
            onClick={() => setOpen(false)}
          >
            {t("skills.action.cancel")}
          </Button>
          <Button
            size="sm"
            className="bg-destructive px-3 text-xs text-white hover:bg-destructive/90"
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

function InfoPanel({
  skill,
  reason,
  path,
  onDelete,
  onToggle,
  onAdopt,
  onViewFiles,
  onTagsChange,
}: {
  skill: Skill
  /** Why this skill cannot be installed here, ready to show; `null` when it can. */
  reason: string | null
  /** The skill's directory, spelled as a person would write it. */
  path: string | null
  /** `null` when this form has no library to delete from. */
  onDelete: (() => Promise<void>) | null
  onToggle: () => void
  /** Copy a skill this workspace wrote into the library. */
  onAdopt: () => void
  onViewFiles: () => void
  onTagsChange: (tags: string[]) => void
}) {
  const { t } = useI18n()

  return (
    <div className="flex w-[360px] min-h-0 shrink-0 flex-col gap-4 border-l border-border p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <DialogTitle className="truncate text-base leading-[19px] font-semibold">
            {skill.name}
          </DialogTitle>
          <div className="flex items-center gap-2">
            <ProvenanceLine skill={skill} />
            {/* The line above already names the place; this adds only the age. */}
            {skill.updated === "" ? null : (
              <DialogDescription className="truncate text-xs text-muted-foreground">
                {`${t("skills.detail.updated")} ${skill.updated}`}
              </DialogDescription>
            )}
          </div>
        </div>
        <DialogClose
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("skills.action.close")}
            />
          }
        >
          <XIcon className="text-muted-foreground" />
        </DialogClose>
      </div>

      <div className="h-px shrink-0 bg-border" />

      {/* A description can outrun the panel; it scrolls so the actions stay put. */}
      <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-2">
        <CategoryEditor tags={skill.tags} onChange={onTagsChange} />

        <section className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-muted-foreground">
            {t("skills.detail.description")}
          </span>
          <p className="text-[13px] leading-[1.5]">{skill.description}</p>
        </section>

        <div className="h-px shrink-0 bg-border" />

        <dl className="flex flex-col">
          <MetaRow label={t("skills.detail.tokens")} value={skill.tokens ?? "—"} />
          <MetaRow
            label={t("skills.detail.triggers")}
            value={skill.triggers === undefined ? "—" : String(skill.triggers)}
          />
          {/* The hub records no age for a skill it does not hold, so none is shown. */}
          {skill.updated === "" ? null : (
            <MetaRow label={t("skills.detail.updatedShort")} value={skill.updated} />
          )}
        </dl>
      </div>

      <div className="flex items-center gap-2">
        <Button className="h-9 w-[156px] gap-[7px]" onClick={onViewFiles}>
          <FileTextIcon />
          {t("skills.detail.files.action")}
        </Button>
        {/* A skill the workspace wrote can become a library copy. */}
        {skill.location === "workspace" && skill.inLibrary !== true ? (
          <Button
            variant="outline"
            className="h-9 flex-1 gap-[7px] border-border bg-transparent px-2.5 text-secondary-foreground"
            onClick={onAdopt}
          >
            <LibraryIcon />
            {t("skills.action.adopt")}
          </Button>
        ) : !skill.installed && skill.location !== "library" ? null : (
          <Button
            variant={skill.installed || skill.stale ? "outline" : "default"}
            className={
              skill.installed || skill.stale
                ? "h-9 flex-1 gap-[7px] border-border bg-transparent px-2.5 text-secondary-foreground"
                : "h-9 flex-1 gap-[7px] px-2.5"
            }
            /* Installing is unavailable when there is no folder, or when the
               workspace already wrote a skill of its own under this name. */
            disabled={!skill.installed && !skill.stale && reason !== null}
            title={!skill.installed && !skill.stale ? (reason ?? undefined) : undefined}
            onClick={onToggle}
          >
            {skill.stale ? <Trash2Icon /> : skill.installed ? <PowerIcon /> : <DownloadIcon />}
            {t(
              skill.stale
                ? "skills.action.cleanup"
                : skill.installed
                  ? "skills.action.remove"
                  : "skills.action.install"
            )}
          </Button>
        )}
      </div>

      {onDelete !== null && (
        <DeleteBubble name={skill.name} path={path} onDelete={onDelete}>
          <Button
            variant="outline"
            className="h-9 w-full gap-[7px] border-destructive/35 bg-transparent px-2.5 text-destructive hover:bg-destructive/5 hover:text-destructive aria-expanded:bg-transparent aria-expanded:text-destructive dark:border-destructive/35 dark:bg-transparent"
          >
            <Trash2Icon />
            {t("skills.detail.delete")}
          </Button>
        </DeleteBubble>
      )}
    </div>
  )
}

/** Slides in from the right over the info panel, leaving the media strip dimmed behind it. */
function FilesPanel({
  skill,
  tree,
  content,
  open,
  onBack,
}: {
  skill: Skill
  /** One row per entry: a folder, or a file with its own text when selected. */
  tree: { path: string; name: string; depth: number; directory: boolean; active: boolean }[]
  content: string
  open: boolean
  onBack: () => void
}) {
  const { t } = useI18n()
  const lines = content.split("\n")

  return (
    <div
      aria-hidden={!open}
      className={`absolute inset-y-0 right-0 z-20 flex w-[880px] max-w-full flex-col bg-dialog shadow-[-20px_0_48px_#0F172A47] transition-transform duration-300 ease-out ${
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
        <div className="flex w-[224px] shrink-0 flex-col gap-0.5 overflow-auto">
          {tree.map((node) => (
            <span
              key={node.path}
              className={`flex h-7 items-center gap-2 rounded-md pr-2 text-[13px] ${
                node.depth === 0
                  ? "pl-2"
                  : node.depth === 1
                    ? "pl-6"
                    : "pl-10"
              } ${
                node.active
                  ? "bg-muted font-medium text-foreground"
                  : "text-secondary-foreground"
              }`}
            >
              {node.directory ? (
                node.depth === 0 ? (
                  <FolderOpenIcon className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
                )
              ) : node.name.endsWith(".py") ? (
                <CodeIcon className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <FileTextIcon
                  className={`size-3.5 shrink-0 ${
                    node.active ? "text-foreground" : "text-muted-foreground"
                  }`}
                />
              )}
              <span className="truncate">{node.name}</span>
            </span>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-surface-raised">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3.5">
            <FileTextIcon className="size-3.5 text-muted-foreground" />
            <span className="text-[13px] font-medium">SKILL.md</span>
            <MoreHorizontalIcon className="ml-auto size-4 text-muted-foreground" />
          </div>
          <div className="flex-1 overflow-auto py-3 font-mono">
            {lines.map((line, index) => (
              <div key={index} className="flex h-5 items-center px-3.5">
                <span className="w-6 shrink-0 text-right text-[11px] text-muted-foreground">
                  {index + 1}
                </span>
                <span className="pl-3 text-[11.5px] whitespace-pre text-secondary-foreground">
                  {line}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** One row of the files panel, from either the library's tree or the bundle's sample. */
interface FileRow {
  path: string
  name: string
  depth: number
  directory: boolean
  active: boolean
}

/** The files the panel lists: the library's own tree, the workspace's, or the bundled example. */
function useFileRows(
  skill: Skill,
  detail: SkillDetail | null,
  held: WorkspaceSkillDetail | null,
  sample: boolean
): { rows: FileRow[]; content: string } {
  return React.useMemo(() => {
    if (detail !== null) {
      return {
        rows: detail.files.map((file) => ({
          path: file.path,
          name: file.path.split("/").at(-1) ?? file.path,
          depth: file.depth,
          directory: file.directory,
          active: file.path === "SKILL.md",
        })),
        content: `---\nname: ${detail.name}\ndescription: ${detail.description}\ntags: [${detail.tags.join(", ")}]\n---\n\n${detail.body}`,
      }
    }
    /* A workspace skill is read where it lives, so its manifest is shown as written. */
    if (held !== null) {
      return {
        rows: held.files.map((file) => ({
          path: file.path,
          name: file.path.split("/").at(-1) ?? file.path,
          depth: file.depth,
          directory: file.directory,
          active: file.path === "SKILL.md",
        })),
        content: held.text,
      }
    }
    /* Nothing to read: only a form with no library at all falls back to the example. */
    if (!sample) return { rows: [], content: "" }
    return {
      rows: fileTree.map((node) => ({
        path: node.name,
        name: node.name,
        depth: node.depth,
        directory: node.kind === "folder",
        active: "active" in node && node.active,
      })),
      content: skillFile(skill)
        .map((line) => line.text)
        .join("\n"),
    }
  }, [skill, detail, held, sample])
}

function LightboxBody({
  skill,
  detail,
  held,
  store,
  root,
  reason,
  onToggle,
  onAdopt,
  onDelete,
  onTagsChange,
  onChanged,
}: {
  skill: Skill
  /** The stored record, present when a library answered. */
  detail: SkillDetail | null
  /** The workspace's own record, present when the skill lives there. */
  held: WorkspaceSkillDetail | null
  store: SkillStore | null
  /** The skills root as the library spells it, for the delete question. */
  root: string | null
  /** Why this skill cannot be installed here, ready to show; `null` when it can. */
  reason: string | null
  onToggle: () => void
  /** Copy a skill this workspace wrote into the library. */
  onAdopt: () => void
  onDelete: (() => Promise<void>) | null
  onTagsChange: (tags: string[]) => void
  /** The stored record changed; the caller re-reads its page. */
  onChanged: () => void
}) {
  const [filesOpen, setFilesOpen] = React.useState(false)
  const media = useMediaItems(skill, store, detail, onChanged)
  const files = useFileRows(skill, detail, held, store === null)
  const path =
    root === null ? null : `${root.replaceAll("\\", "/")}/${skill.id}`

  /* The catalog stays mounted behind the dialog; stop its previews decoding. */
  React.useEffect(() => {
    setPreviewsSuspended(true)
    return () => setPreviewsSuspended(false)
  }, [])

  return (
    <div className="relative flex h-full min-h-0">
      <MediaPane skill={skill} source={media} />
      <InfoPanel
        skill={skill}
        reason={reason}
        path={path}
        onDelete={onDelete}
        onToggle={onToggle}
        onAdopt={onAdopt}
        onViewFiles={() => setFilesOpen(true)}
        onTagsChange={onTagsChange}
      />
      <div
        className={`pointer-events-none absolute inset-0 z-10 bg-scrim transition-opacity duration-300 ${
          filesOpen ? "opacity-100" : "opacity-0"
        }`}
      />
      <FilesPanel
        skill={skill}
        tree={files.rows}
        content={files.content}
        open={filesOpen}
        onBack={() => setFilesOpen(false)}
      />
    </div>
  )
}

/** Detail lightbox for one skill; opens on click from either view. */
export function SkillDetailDialog({
  skill,
  store,
  root,
  reason,
  onToggle,
  onAdopt,
  onDelete,
  onTagsChange,
  onChanged,
  onOpenChange,
}: {
  skill: Skill | null
  /** The library behind the catalog, or `null` while the bundle is on screen. */
  store: SkillStore | null
  /** Where the library keeps its skills, as it spells the path. */
  root: string | null
  /** Why this skill cannot be installed here, ready to show; `null` when it can. */
  reason: string | null
  onToggle: () => void
  /** Copy a skill this workspace wrote into the library. */
  onAdopt: (skill: Skill) => void
  /** Delete the skill and everything the hub stores for it. */
  onDelete: (skill: Skill) => Promise<void>
  onTagsChange: (tags: string[]) => void
  /** The stored record changed; the caller re-reads its page. */
  onChanged: () => void
  onOpenChange: (open: boolean) => void
}) {
  const [loaded, setLoaded] = React.useState<{ id: string; detail: SkillDetail } | null>(null)
  const [held, setHeld] = React.useState<{ id: string; detail: WorkspaceSkillDetail } | null>(null)
  const id = skill?.id ?? null
  const at = skill?.location ?? null

  /* Load the stored record whenever the lightbox opens on a library skill, and
     again after a write moves its timestamp. A skill the workspace holds has no
     library record, and asking for one is a request that can only fail. */
  React.useEffect(() => {
    if (store === null || id === null || at === "workspace" || at === null) return
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
  }, [store, id, at, skill?.stamp])

  /* Only the record for the skill on screen counts; a stale one is ignored. */
  const detail = loaded !== null && loaded.id === id ? loaded.detail : null

  /* A skill the workspace holds lives outside the library, so its own manifest
     and files are read from the folder the hub is pointed at. */
  React.useEffect(() => {
    if (store === null || id === null || at !== "workspace") return
    let live = true
    void (async () => {
      try {
        const found = await store.workspaceSkill(id)
        if (live && found !== null) setHeld({ id, detail: found })
      } catch {
        /* An unreadable skill leaves the panel on the catalog row it came from. */
      }
    })()
    return () => {
      live = false
    }
  }, [store, id, at])

  const workspace = held !== null && held.id === id ? held.detail : null

  return (
    <Dialog open={skill !== null} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(740px,calc(100vh-48px))] w-[min(1136px,calc(100vw-48px))] flex-col gap-0 overflow-hidden rounded-xl bg-dialog p-0 shadow-[0_24px_56px_#0F172A3D] ring-glass-border backdrop-blur-xl sm:max-w-none"
      >
        {skill ? (
          <LightboxBody
            key={skillKey(skill)}
            skill={skill}
            detail={detail}
            held={workspace}
            store={store}
            root={root}
            reason={reason}
            onToggle={onToggle}
            onAdopt={() => onAdopt(skill)}
            /* The library cannot delete a skill it does not hold. */
            onDelete={
              store === null || skill.location === "workspace" ? null : () => onDelete(skill)
            }
            onTagsChange={onTagsChange}
            onChanged={onChanged}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
