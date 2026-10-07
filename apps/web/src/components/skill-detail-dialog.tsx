import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CodeIcon,
  DownloadIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  ImagePlusIcon,
  MoreHorizontalIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import * as React from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@workspace/ui/components/dialog"

type DetailSkill = {
  name: string
  summary: string
  description: string
  tags: string[]
  source: string
  tokens: string
  triggers: number
  updated: string
  cover?: string
}

const tagChipClass: Record<string, string> = {
  Documents: "bg-chip-documents text-tag-documents",
  Engineering: "bg-chip-engineering text-tag-engineering",
  Docs: "bg-chip-docs text-tag-docs",
  Data: "bg-chip-data text-tag-data",
  Design: "bg-chip-design text-tag-design",
  Integrations: "bg-chip-integrations text-tag-integrations",
  Quality: "bg-chip-quality text-tag-quality",
  Reliability: "bg-chip-reliability text-tag-reliability",
  Marketing: "bg-chip-marketing text-tag-marketing",
}

type MediaItem = { id: string; kind: "image" | "video"; src: string }

/** SKILL.md as the editor renders it: frontmatter, a heading, steps, then guardrails. */
function skillFile(skill: DetailSkill): { text: string; className: string }[] {
  const lowercase = skill.summary.charAt(0).toLowerCase() + skill.summary.slice(1)

  return [
    { text: "---", className: "text-muted-foreground" },
    { text: `name: ${skill.name}`, className: "text-secondary-foreground" },
    {
      text: `description: ${skill.summary}`,
      className: "text-secondary-foreground",
    },
    { text: `category: ${skill.tags[0]}`, className: "text-secondary-foreground" },
    { text: "---", className: "text-muted-foreground" },
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

function MarkdownPreview({ skill }: { skill: DetailSkill }) {
  return (
    <div className="flex size-full flex-col justify-center gap-0.5 bg-surface-raised px-4 font-mono text-[10.5px] leading-[14px]">
      {[
        "---",
        `name: ${skill.name}`,
        `description: ${skill.summary}`,
        `category: ${skill.tags[0]}`,
        "---",
      ].map((line, index) => (
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

function MediaStage({
  item,
  skill,
  progress,
  onProgress,
  onStep,
  index,
  total,
}: {
  item?: MediaItem
  skill: DetailSkill
  progress: number
  onProgress: (progress: number) => void
  onStep: (offset: number) => void
  index: number
  total: number
}) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const [playing, setPlaying] = React.useState(false)

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      void video.play()
      setPlaying(true)
    } else {
      video.pause()
      setPlaying(false)
    }
  }

  return (
    <div className="relative flex w-full max-w-[720px] shrink-0 items-center justify-center">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-[#0f172a]">
        {!item ? (
          <MarkdownPreview skill={skill} />
        ) : item.kind === "video" ? (
          <video
            ref={videoRef}
            src={item.src}
            playsInline
            onClick={togglePlay}
            onTimeUpdate={(event) =>
              onProgress(event.currentTarget.currentTime / (event.currentTarget.duration || 1))
            }
            onEnded={() => setPlaying(false)}
            className="size-full object-cover"
          />
        ) : (
          <img src={item.src} alt="" className="size-full object-cover" />
        )}
        {item?.kind === "video" ? (
          <>
            <button
              type="button"
              aria-label={playing ? "Pause" : "Play"}
              onClick={togglePlay}
              className="absolute top-1/2 left-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 shadow-[0_4px_12px_#0F172A33] transition-colors hover:bg-white"
            >
              {playing ? (
                <PauseIcon className="size-6 fill-foreground text-foreground" />
              ) : (
                <PlayIcon className="size-6 fill-foreground text-foreground" />
              )}
            </button>
            <div className="absolute inset-x-5 bottom-5 h-1 overflow-hidden rounded-full bg-white/30">
              <div
                className="h-full rounded-full bg-white"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </>
        ) : null}
        {total > 1 ? (
          <>
            <span className="absolute top-4 left-4 flex h-[26px] items-center rounded-full bg-[#0f172acc] px-2.5 text-[11px] font-semibold text-white">
              {`${index + 1} / ${total}`}
            </span>
            <button
              type="button"
              aria-label="Previous media"
              disabled={index === 0}
              onClick={() => onStep(-1)}
              className="absolute top-1/2 left-3 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-foreground shadow-[0_2px_8px_#0F172A33] disabled:opacity-40"
            >
              <ChevronLeftIcon className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next media"
              disabled={index === total - 1}
              onClick={() => onStep(1)}
              className="absolute top-1/2 right-3 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-foreground shadow-[0_2px_8px_#0F172A33] disabled:opacity-40"
            >
              <ChevronRightIcon className="size-4" />
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}

function MediaPane({ skill }: { skill: DetailSkill }) {
  const [items, setItems] = React.useState<MediaItem[]>(() =>
    skill.cover ? [{ id: "cover", kind: "image", src: skill.cover }] : []
  )
  const [activeId, setActiveId] = React.useState<string | null>(
    skill.cover ? "cover" : null
  )
  const [progress, setProgress] = React.useState(0)
  const [dragOver, setDragOver] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const objectUrls = React.useRef<string[]>([])

  React.useEffect(
    () => () => {
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url))
    },
    []
  )

  const index = items.findIndex((item) => item.id === activeId)
  const current = index >= 0 ? items[index] : undefined

  const select = (id: string) => {
    setActiveId(id)
    setProgress(0)
  }

  const addFiles = (files: FileList) => {
    const added: MediaItem[] = []
    for (const file of Array.from(files)) {
      const kind = file.type.startsWith("video/")
        ? "video"
        : file.type.startsWith("image/")
          ? "image"
          : null
      if (!kind) continue
      const url = URL.createObjectURL(file)
      objectUrls.current.push(url)
      added.push({ id: url, kind, src: url })
    }
    if (added.length === 0) return
    setItems((previous) => [...previous, ...added])
    select(added[added.length - 1].id)
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
      className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-4 bg-muted/50 px-4 py-6 ${
        dragOver ? "ring-2 ring-primary ring-inset" : ""
      }`}
    >
      {/* Keyed by slide so a new slide remounts the player: paused, at 0:00. */}
      <MediaStage
        key={current?.id ?? "empty"}
        item={current}
        skill={skill}
        progress={progress}
        onProgress={setProgress}
        onStep={(offset) => {
          const next = items[index + offset]
          if (next) select(next.id)
        }}
        index={Math.max(index, 0)}
        total={items.length}
      />

      <div className="flex max-w-full items-center gap-2.5 overflow-x-auto px-1 py-1">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-label={item.kind === "video" ? "Show video" : "Show image"}
            aria-current={item.id === current?.id}
            onClick={() => select(item.id)}
            className={`relative size-[72px] shrink-0 overflow-hidden rounded-md ring-inset ${
              item.id === current?.id
                ? "ring-2 ring-primary"
                : "ring-1 ring-glass-border"
            }`}
          >
            {item.kind === "video" ? (
              <span className="relative block size-full bg-[#0f172a]">
                <video
                  src={item.src}
                  muted
                  preload="metadata"
                  className="size-full object-cover"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-[#0f172a59]">
                  <PlayIcon className="size-4 fill-white text-white" />
                </span>
              </span>
            ) : (
              <img src={item.src} alt="" className="size-full object-cover" />
            )}
          </button>
        ))}
        <button
          type="button"
          aria-label="Upload image or video"
          onClick={() => inputRef.current?.click()}
          className="flex size-[72px] shrink-0 items-center justify-center rounded-md border border-input text-muted-foreground transition-colors hover:text-foreground"
        >
          <PlusIcon className="size-4" />
        </button>
        <input
          ref={inputRef}
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

      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <ImagePlusIcon className="size-3.5" />
        Drag an image or video here, or click + to upload · 16:9 recommended
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

function InfoPanel({
  skill,
  installed,
  onToggle,
  onViewFiles,
}: {
  skill: DetailSkill
  installed: boolean
  onToggle: () => void
  onViewFiles: () => void
}) {
  return (
    <div className="flex w-[360px] shrink-0 flex-col gap-4 border-l border-border p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <DialogTitle className="truncate text-base leading-[19px] font-semibold">
            {skill.name}
          </DialogTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="h-[18px] px-1.5 text-[11px]">
              {skill.source}
            </Badge>
            <DialogDescription className="truncate text-xs text-muted-foreground">
              {`Updated ${skill.updated}`}
            </DialogDescription>
          </div>
        </div>
        <DialogClose
          render={
            <Button variant="ghost" size="icon-sm" aria-label="Close" />
          }
        >
          <XIcon className="text-muted-foreground" />
        </DialogClose>
      </div>

      <div className="h-px shrink-0 bg-border" />

      <section className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-muted-foreground">
          Category
        </span>
        <div className="flex flex-wrap gap-1.5">
          {skill.tags.map((tag) => (
            <span
              key={tag}
              className={`flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium ${tagChipClass[tag]}`}
            >
              <SparklesIcon className="size-3" />
              {tag}
            </span>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-muted-foreground">
          Description
        </span>
        <p className="text-[13px] leading-[1.5]">{skill.description}</p>
      </section>

      <div className="h-px shrink-0 bg-border" />

      <dl className="flex flex-col">
        <MetaRow label="Source" value={skill.source} />
        <MetaRow label="Tokens" value={skill.tokens} />
        <MetaRow label="Triggers" value={String(skill.triggers)} />
        <MetaRow label="Updated" value={skill.updated} />
      </dl>

      <div className="mt-auto flex items-center gap-2">
        <Button className="w-[156px] gap-[7px]" onClick={onViewFiles}>
          <FileTextIcon />
          View files
        </Button>
        <Button
          variant={installed ? "outline" : "default"}
          className={
            installed
              ? "flex-1 gap-[7px] border-border bg-transparent px-2.5 text-secondary-foreground"
              : "flex-1 gap-[7px] px-2.5"
          }
          onClick={onToggle}
        >
          {installed ? <Trash2Icon /> : <DownloadIcon />}
          {installed ? "Uninstall" : "Install"}
        </Button>
      </div>
    </div>
  )
}

/** Slides in from the right over the info panel, leaving the media strip dimmed behind it. */
function FilesPanel({
  skill,
  open,
  onBack,
}: {
  skill: DetailSkill
  open: boolean
  onBack: () => void
}) {
  const lines = skillFile(skill)

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
          size="icon-sm"
          aria-label="Back to details"
          onClick={onBack}
        >
          <ArrowLeftIcon />
        </Button>
        <span className="text-sm leading-[17px] font-semibold">
          {skill.name}
        </span>
        <span className="text-sm leading-[17px] text-muted-foreground">
          / Files
        </span>
        <DialogClose
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto shrink-0"
              aria-label="Close"
            />
          }
        >
          <XIcon className="text-muted-foreground" />
        </DialogClose>
      </div>
      <div className="h-px shrink-0 bg-border" />

      <div className="flex min-h-0 flex-1 gap-5 p-5">
        <div className="flex w-[224px] shrink-0 flex-col gap-0.5">
          {fileTree.map((node) => (
            <span
              key={node.name}
              className={`flex h-7 items-center gap-2 rounded-md pr-2 text-[13px] ${
                node.depth === 0
                  ? "pl-2"
                  : node.depth === 1
                    ? "pl-6"
                    : "pl-10"
              } ${
                "active" in node && node.active
                  ? "bg-muted font-medium text-foreground"
                  : "text-secondary-foreground"
              }`}
            >
              {node.kind === "folder" ? (
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
                    "active" in node && node.active
                      ? "text-foreground"
                      : "text-muted-foreground"
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
                <span
                  className={`pl-3 text-[11.5px] whitespace-pre ${line.className}`}
                >
                  {line.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function LightboxBody({
  skill,
  installed,
  onToggle,
}: {
  skill: DetailSkill
  installed: boolean
  onToggle: () => void
}) {
  const [filesOpen, setFilesOpen] = React.useState(false)

  return (
    <div className="relative flex h-full min-h-0">
      <MediaPane skill={skill} />
      <InfoPanel
        skill={skill}
        installed={installed}
        onToggle={onToggle}
        onViewFiles={() => setFilesOpen(true)}
      />
      <div
        className={`pointer-events-none absolute inset-0 z-10 bg-scrim transition-opacity duration-300 ${
          filesOpen ? "opacity-100" : "opacity-0"
        }`}
      />
      <FilesPanel
        skill={skill}
        open={filesOpen}
        onBack={() => setFilesOpen(false)}
      />
    </div>
  )
}

/** Detail lightbox for one skill; opens on click from either view. */
export function SkillDetailDialog({
  skill,
  installed,
  onToggle,
  onOpenChange,
}: {
  skill: DetailSkill | null
  installed: boolean
  onToggle: () => void
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={skill !== null} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(740px,calc(100vh-48px))] w-[min(1136px,calc(100vw-48px))] flex-col gap-0 overflow-hidden rounded-xl bg-dialog p-0 shadow-[0_24px_56px_#0F172A3D] ring-glass-border backdrop-blur-xl sm:max-w-none"
      >
        {skill ? (
          <LightboxBody
            key={skill.name}
            skill={skill}
            installed={installed}
            onToggle={onToggle}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
