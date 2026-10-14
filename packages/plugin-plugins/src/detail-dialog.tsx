/**
 * The media pane on the left and the panel of facts and actions on the right,
 * with the pack's files sliding in over both.
 *
 * A picture added here lives in this window (its own object URL) rather than on
 * disk, because nothing in this module writes a pack's directory; the files
 * panel reads what the pack actually holds from the host, and shows nothing when
 * it cannot be read rather than standing something in.
 */
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardPasteIcon,
  FileTextIcon,
  ImageIcon,
  ImagePlusIcon,
  LinkIcon,
  MoreHorizontalIcon,
  PlayIcon,
  PlugIcon,
  PlusIcon,
  UploadIcon,
  XIcon,
} from "lucide-react"
import * as React from "react"

import { PluginFileTree, fileTreeKey } from "./file-tree.tsx"
import { PluginActions } from "./install-actions.tsx"
import { PluginTile } from "./parts.tsx"
import { packFile, packFiles, type PluginClient } from "./library.ts"
import type { PluginInstallScope } from "./contract.ts"
import type { PluginFileEntry, PluginRow } from "./types.ts"

import {
  CodeCard,
  DialogSplit,
  TagEditor,
} from "@workspace/extensions/components"
import { useI18n } from "@workspace/extensions/react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Spinner } from "@workspace/ui/components/spinner"
import { toast } from "@workspace/ui/components/toast"

/** One picture or video on the stage. */
interface MediaItem {
  id: string
  kind: "image" | "video"
  src: string
}

/** data: URLs carry their own mime type; anything else is guessed from the extension. */
function mediaKind(src: string): "image" | "video" {
  const mime = /^data:([^;,]+)/i.exec(src)?.[1] ?? ""
  const sample = mime === "" ? (src.split(/[?#]/)[0]?.split(".").pop() ?? "") : mime
  return /^(video\/(mp4|webm|ogg)|mp4|webm|mov|m4v)$/i.test(sample) ? "video" : "image"
}

/** The stage with no picture to show: what the pack is, in one block. */
function BundleStage({ plugin }: { plugin: PluginRow }) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-3 bg-surface-raised px-8 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-secondary">
        <PlugIcon className="size-6 text-muted-foreground" aria-hidden />
      </span>
      <span className="font-mono text-[13px] leading-[19px] text-muted-foreground">
        {plugin.name}
      </span>
      <span className="max-w-[520px] text-[13px] leading-[19px] text-copy">
        {plugin.description}
      </span>
    </div>
  )
}

/** One item on the stage: the picture itself, or a video with its own controls. */
function Slide({ item }: { item: MediaItem }) {
  if (item.kind === "video") {
    return (
      <video
        key={item.id}
        src={item.src}
        controls
        loop
        playsInline
        className="max-h-full max-w-full rounded-lg object-contain"
      />
    )
  }

  return (
    <img
      key={item.id}
      src={item.src}
      alt=""
      className="max-h-full max-w-full rounded-lg object-contain"
    />
  )
}

/**
 * Thumbnail for a video: a frame near its start, so the strip neither goes
 * black nor decodes every video in the gallery.
 */
function VideoThumb({ src }: { src: string }) {
  return (
    <video
      src={src}
      muted
      playsInline
      preload="metadata"
      onLoadedMetadata={(event) => {
        const video = event.currentTarget
        if (!Number.isFinite(video.duration)) return
        video.currentTime = Math.min(0.5, video.duration / 2)
      }}
      className="size-full object-cover"
    />
  )
}

/**
 * The media column: one stage, a strip of thumbnails, and the one way to add a
 * picture — a file picker, a drop, a pasted screenshot, or a direct URL.
 */
function MediaPane({ plugin }: { plugin: PluginRow }) {
  const { t } = useI18n()
  /* The strip and which item is on the stage move together, so they are one
     state: an upload that appends shows the new item without a second render. */
  const [state, setState] = React.useState<{ items: MediaItem[]; active: number }>(() => ({
    items:
      plugin.cover === undefined
        ? []
        : [{ id: "cover", kind: mediaKind(plugin.cover), src: plugin.cover }],
    active: 0,
  }))
  const { items, active } = state
  const [dragOver, setDragOver] = React.useState(false)
  const [addOpen, setAddOpen] = React.useState(false)
  /* The second entry of the upload menu opens its link field in place, rather
     than stacking a second surface on top of the first. */
  const [addFace, setAddFace] = React.useState<"menu" | "link">("menu")
  const [notice, setNotice] = React.useState<string | null>(null)
  const [link, setLink] = React.useState("")
  const fileRef = React.useRef<HTMLInputElement | null>(null)
  /* Every object URL this pane minted, released when the lightbox closes. */
  const objectUrls = React.useRef<string[]>([])
  const nextId = React.useRef(1)
  const count = items.length

  React.useEffect(
    () => () => {
      for (const url of objectUrls.current) URL.revokeObjectURL(url)
      objectUrls.current = []
    },
    []
  )

  const append = React.useCallback((added: MediaItem[]) => {
    if (added.length === 0) return
    setState(({ items: held }) => {
      const next = [...held, ...added]
      return { items: next, active: next.length - 1 }
    })
  }, [])

  const addFiles = React.useCallback(
    (files: ArrayLike<File>) => {
      const added: MediaItem[] = []
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) continue
        const url = URL.createObjectURL(file)
        objectUrls.current.push(url)
        added.push({
          id: `local-${nextId.current++}`,
          kind: file.type.startsWith("video/") ? "video" : "image",
          src: url,
        })
      }
      append(added)
      if (added.length > 0) setAddOpen(false)
    },
    [append]
  )

  const addLink = () => {
    const value = link.trim()
    if (value === "" || !/^https?:\/\//i.test(value)) {
      toast.add({ type: "error", title: t("plugins.media.add.failed") })
      return
    }
    append([{ id: `link-${nextId.current++}`, kind: mediaKind(value), src: value }])
    setLink("")
    setAddOpen(false)
  }

  const remove = (id: string) =>
    setState(({ items: held, active: shown }) => {
      const next = held.filter((item) => item.id !== id)
      return { items: next, active: Math.max(0, Math.min(shown, next.length - 1)) }
    })

  /** Show one item of the strip. */
  const show = (index: number) =>
    setState((held) => ({ ...held, active: Math.max(0, Math.min(index, held.items.length - 1)) }))

  /* A screenshot should not have to be saved as a file first, so the paste
     listener is document-wide while this pane is mounted. A paste into a field
     is that field's business: the link box takes a URL. */
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
        if (data.getData("text") !== "") setNotice(t("plugins.media.paste.text"))
        return
      }
      event.preventDefault()
      setNotice(t("plugins.media.paste.done").replace("{count}", String(picked.length)))
      addFiles(picked)
    }

    document.addEventListener("paste", onPaste)
    return () => document.removeEventListener("paste", onPaste)
  }, [addFiles, t])

  /* Whatever the upload just said stops saying it on its own. */
  React.useEffect(() => {
    if (notice === null) return
    const timer = window.setTimeout(() => setNotice(null), 4000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const current = items[active]

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
          <span className="text-[15px] font-semibold">{t("plugins.media.drop.title")}</span>
          <span className="text-[13px] text-muted-foreground">
            {t("plugins.media.drop.formats")}
          </span>
        </div>
      ) : null}
      {notice === null ? null : (
        <span className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full bg-foreground px-3.5 py-1.5 text-[12px] font-medium text-background">
          {notice}
        </span>
      )}

      {/* The stage takes every pixel the strip and the hint leave behind, so a
          tall picture uses the full height instead of a fixed 16:9 band. */}
      <div className="relative flex min-h-0 w-full flex-1 items-center justify-center">
        {current === undefined ? <BundleStage plugin={plugin} /> : <Slide item={current} />}

        {count > 1 ? (
          <>
            <span className="absolute top-4 left-4 z-10 flex h-[26px] items-center gap-1.5 rounded-full bg-[#0f172acc] px-2.5 text-[11px] font-semibold text-white">
              <ImageIcon className="size-3.5" />
              {`${active + 1} / ${count}`}
            </span>
            <button
              type="button"
              aria-label={t("plugins.media.previous")}
              disabled={active === 0}
              onClick={() => show(active - 1)}
              className="absolute top-1/2 left-3 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-foreground shadow-[0_2px_8px_#0F172A33] transition-opacity disabled:opacity-40"
            >
              <ChevronLeftIcon className="size-4" />
            </button>
            <button
              type="button"
              aria-label={t("plugins.media.next")}
              disabled={active === count - 1}
              onClick={() => show(active + 1)}
              className="absolute top-1/2 right-3 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-foreground shadow-[0_2px_8px_#0F172A33] transition-opacity disabled:opacity-40"
            >
              <ChevronRightIcon className="size-4" />
            </button>
          </>
        ) : null}
      </div>

      <div className="flex max-w-full flex-wrap items-center justify-center gap-2.5">
        {items.map((item, index) => (
          <div key={item.id} className="group/thumb relative h-11 w-[72px]">
            <button
              type="button"
              aria-label={`${
                item.kind === "video" ? t("plugins.media.video") : t("plugins.media.image")
              } ${index + 1}`}
              aria-current={index === active}
              onClick={() => show(index)}
              className={`block size-full overflow-hidden rounded-md ring-inset ${
                index === active ? "ring-2 ring-primary" : "ring-1 ring-glass-border"
              }`}
            >
              {item.kind === "video" ? (
                <span className="relative block size-full bg-[#0f172a]">
                  <VideoThumb src={item.src} />
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
              aria-label={t("plugins.media.remove")}
              onClick={() => remove(item.id)}
              className="absolute top-1 right-1 z-10 flex size-4 items-center justify-center rounded-full bg-[#0f172acc] text-white opacity-0 transition-opacity group-focus-within/thumb:opacity-100 group-hover/thumb:opacity-100 hover:bg-[#0f172a]"
            >
              <XIcon className="size-2.5" />
            </button>
          </div>
        ))}

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
                aria-label={t("plugins.media.upload")}
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
                  onClick={() => fileRef.current?.click()}
                  className="flex h-12 w-full items-center gap-2.5 border-b border-border px-3 text-left transition-colors hover:bg-accent"
                >
                  <UploadIcon className="size-4 shrink-0 text-copy" aria-hidden />
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate text-[13px] leading-[17px] font-medium">
                      {t("plugins.media.add.file")}
                    </span>
                    <span className="truncate text-[11.5px] leading-[15px] text-muted-soft">
                      {t("plugins.media.add.fileHint")}
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
                      {t("plugins.media.add.link")}
                    </span>
                    <span className="truncate text-[11.5px] leading-[15px] text-muted-soft">
                      {t("plugins.media.add.linkHint")}
                    </span>
                  </span>
                </button>
                {/* Paste is a gesture, not an entry: it says what to press and
                    takes no click, so it is a row rather than a button. */}
                <span className="flex h-12 w-full items-center gap-2.5 px-3">
                  <ClipboardPasteIcon className="size-4 shrink-0 text-copy" aria-hidden />
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate text-[13px] leading-[17px] font-medium">
                      {t("plugins.media.add.paste")}
                    </span>
                    <span className="truncate text-[11.5px] leading-[15px] text-muted-soft">
                      {t("plugins.media.add.pasteHint")}
                    </span>
                  </span>
                </span>
              </>
            ) : (
              <>
                <span className="text-[12px] font-semibold">
                  {t("plugins.media.add.linkLabel")}
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
                    placeholder={t("plugins.media.add.placeholder")}
                    aria-label={t("plugins.media.add.linkLabel")}
                    className="min-w-0 flex-1 bg-transparent font-mono text-[11px] outline-none placeholder:text-muted-soft"
                  />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    className="h-7 rounded-full border-border bg-transparent px-3 text-[12.5px] font-semibold dark:border-input dark:bg-transparent"
                    onClick={() => setAddFace("menu")}
                  >
                    {t("plugins.action.cancel")}
                  </Button>
                  <Button className="h-7 rounded-full px-3 text-[12.5px] font-semibold" onClick={addLink}>
                    {t("plugins.media.add.action")}
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

      <p className="text-center text-xs leading-[15px] text-muted-foreground">
        {t("plugins.media.hint")}
      </p>
    </div>
  )
}

/** One line of the panel: what it is called, and what it says. */
function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-[30px] items-center justify-between gap-2">
      <span className="text-[12.5px] text-muted-foreground">{label}</span>
      <span className="font-mono text-[12.5px] text-foreground">{value}</span>
    </div>
  )
}

function InfoPanel({
  plugin,
  clients,
  busy,
  onUpdate,
  onInstall,
  onUninstall,
  onViewFiles,
  onTagsChange,
  tagSuggestions,
}: {
  plugin: PluginRow
  clients: readonly PluginClient[]
  busy: boolean
  onUpdate: () => void
  onInstall: (client: string, scope: PluginInstallScope) => void
  onUninstall: (client: string, scope: PluginInstallScope) => void
  onViewFiles: () => void
  onTagsChange: (tags: string[]) => void
  /** Every category in use across the catalog, for the editor's quick picks. */
  tagSuggestions: string[]
}) {
  const { t } = useI18n()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-[84px] shrink-0 items-center gap-3 border-b border-border px-5">
        <PluginTile plugin={plugin} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <DialogTitle className="truncate font-mono text-[16px] leading-[21px] font-semibold">
            {plugin.name}
          </DialogTitle>
          <DialogDescription className="flex min-w-0 items-center gap-2 font-mono text-[12px] text-muted-foreground">
            {t("plugins.version").replace("{version}", plugin.version)}
            <span aria-hidden className="text-muted-soft">
              ·
            </span>
            {t(`plugins.source.${plugin.source}`)}
          </DialogDescription>
        </div>
        <DialogClose
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 rounded-full"
              aria-label={t("plugins.action.close")}
            />
          }
        >
          <XIcon className="size-4 text-copy" />
        </DialogClose>
      </div>

      {/* Everything between the heading and the footer scrolls, so the actions
          stay put however much the panel holds. */}
      <div className="flex min-h-0 min-w-0 flex-1 scrollbar-gutter-stable flex-col gap-[18px] overflow-y-auto px-5 pt-5 pb-5">
        <p className="text-[13px] leading-[1.5] text-copy">{plugin.description}</p>

        <TagEditor
          tags={plugin.tags}
          suggestions={tagSuggestions}
          onChange={onTagsChange}
          words={{
            add: t("plugins.detail.category.add"),
            placeholder: t("plugins.detail.category.placeholder"),
            remove: t("plugins.detail.category.remove"),
          }}
        />

        {/* When this last moved, and where it came from: both answer "what is
            this pack", so they read as one group. */}
        <div className="flex flex-col">
          <span className="pb-1 text-[12px] font-semibold text-muted-soft">
            {t("plugins.detail.about")}
          </span>
          <MetaRow label={t("plugins.detail.source")} value={t(`plugins.source.${plugin.source}`)} />
          <MetaRow label={t("plugins.detail.updated")} value={plugin.updated} />
        </div>
      </div>

      <div className="flex h-16 shrink-0 items-center gap-2.5 border-t border-border px-5">
        <Button
          className="h-10 flex-1 gap-[7px] rounded-full text-[13.5px] font-semibold"
          onClick={onViewFiles}
        >
          <FileTextIcon className="size-[15px]" />
          {t("plugins.detail.files.action")}
        </Button>
        {/* Installing is another class of action, so it sits apart from the main
            one rather than in the same visual slot. */}
        <PluginActions
          plugin={plugin}
          clients={clients}
          busy={busy}
          onUpdate={onUpdate}
          onInstall={onInstall}
          onUninstall={onUninstall}
        />
      </div>
    </div>
  )
}

/** Slides in from the right over the info panel, leaving the stage dimmed behind it. */
function FilesPanel({
  plugin,
  open,
  onBack,
}: {
  plugin: PluginRow
  open: boolean
  onBack: () => void
}) {
  const { t } = useI18n()
  /* A pack's files come from the host, so the panel shows what the pack holds
     and nothing at all when it cannot be read. */
  const [files, setFiles] = React.useState<PluginFileEntry[]>([])
  React.useEffect(() => {
    let alive = true
    queueMicrotask(() => {
      if (!alive) return
      void packFiles(plugin.id)
        .then((found) => {
          if (alive) setFiles(found)
        })
        .catch(() => {
          if (alive) setFiles([])
        })
    })
    return () => {
      alive = false
    }
  }, [plugin.id])
  /* README.md is what a pack is for, so it is what opens first. */
  const fallback =
    files.find((file) => file.path === "README.md" && !file.directory)?.path ??
    files.find((file) => !file.directory)?.path ??
    null
  const [picked, setPicked] = React.useState<string | null>(null)
  /* Another pack's files make a remembered path meaningless; the fallback wins. */
  const current = picked !== null && files.some((file) => file.path === picked) ? picked : fallback
  const [text, setText] = React.useState("")
  React.useEffect(() => {
    let alive = true
    queueMicrotask(() => {
      if (!alive) return
      if (current === null) {
        setText("")
        return
      }
      void packFile(plugin.id, current)
        .then((body) => {
          if (alive) setText(body ?? "")
        })
        .catch(() => {
          if (alive) setText("")
        })
    })
    return () => {
      alive = false
    }
  }, [plugin.id, current])
  const loaded = text
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
          aria-label={t("plugins.detail.files.back")}
          onClick={onBack}
        >
          <ArrowLeftIcon />
        </Button>
        <span className="text-sm leading-[17px] font-semibold">{plugin.name}</span>
        <span className="text-sm leading-[17px] text-muted-foreground">
          {`/ ${t("plugins.detail.files")}`}
        </span>
        <DialogClose
          render={
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto shrink-0"
              aria-label={t("plugins.action.close")}
            />
          }
        >
          <XIcon className="text-muted-foreground" />
        </DialogClose>
      </div>
      <div className="h-px shrink-0 bg-border" />

      <div className="flex min-h-0 flex-1 gap-5 p-5">
        <div className="flex w-[224px] shrink-0 flex-col overflow-auto">
          <PluginFileTree
            key={fileTreeKey(files)}
            files={files}
            selected={current ?? ""}
            onSelect={setPicked}
          />
        </div>

        <CodeCard
          title={name}
          path={current ?? ""}
          text={loaded}
          trailing={<MoreHorizontalIcon className="size-4 shrink-0 text-muted-foreground" />}
          className="flex-1"
        >
          {loaded === undefined ? (
            <div className="flex items-center gap-2 p-3.5 text-xs text-muted-foreground">
              <Spinner />
              {t("plugins.detail.files.loading")}
            </div>
          ) : null}
        </CodeCard>
      </div>
    </div>
  )
}

/**
 * One pack's lightbox, mounted only while it is open and keyed by the pack, so
 * the media and the picked file start from this pack's own state rather than the
 * one before it.
 */
function PackLightbox({
  plugin,
  clients,
  busy,
  tagSuggestions,
  onUpdate,
  onInstall,
  onUninstall,
  onTagsChange,
}: {
  plugin: PluginRow
  clients: readonly PluginClient[]
  busy: boolean
  tagSuggestions: string[]
  onUpdate: (plugin: PluginRow) => void
  onInstall: (plugin: PluginRow, client: string, scope: PluginInstallScope) => void
  onUninstall: (plugin: PluginRow, client: string, scope: PluginInstallScope) => void
  onTagsChange: (tags: string[]) => void
}) {
  const [filesOpen, setFilesOpen] = React.useState(false)

  return (
    <DialogSplit
      pane={<MediaPane plugin={plugin} />}
      panel={
        <InfoPanel
          plugin={plugin}
          clients={clients}
          busy={busy}
          onUpdate={() => onUpdate(plugin)}
          onInstall={(client, scope) => onInstall(plugin, client, scope)}
          onUninstall={(client, scope) => onUninstall(plugin, client, scope)}
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
          <FilesPanel plugin={plugin} open={filesOpen} onBack={() => setFilesOpen(false)} />
        </>
      }
    />
  )
}

/** Detail lightbox for one pack; opens on click from either view. */
export function PluginDetailDialog({
  plugin,
  clients,
  busy,
  tagSuggestions,
  onUpdate,
  onInstall,
  onUninstall,
  onTagsChange,
  onOpenChange,
}: {
  /** The pack on screen, or `null` while the lightbox is closed. */
  plugin: PluginRow | null
  /** The clients this hub can deliver to, with what each one already holds. */
  clients: readonly PluginClient[]
  busy: boolean
  /** Every category in use across the catalog, for the editor's quick picks. */
  tagSuggestions: string[]
  onUpdate: (plugin: PluginRow) => void
  onInstall: (plugin: PluginRow, client: string, scope: PluginInstallScope) => void
  onUninstall: (plugin: PluginRow, client: string, scope: PluginInstallScope) => void
  onTagsChange: (tags: string[]) => void
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={plugin !== null} onOpenChange={onOpenChange}>
      {plugin === null ? null : (
        <PackLightbox
          key={plugin.id}
          plugin={plugin}
          clients={clients}
          busy={busy}
          tagSuggestions={tagSuggestions}
          onUpdate={onUpdate}
          onInstall={onInstall}
          onUninstall={onUninstall}
          onTagsChange={onTagsChange}
        />
      )}
    </Dialog>
  )
}
