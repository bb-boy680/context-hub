/**
 * The pane of the pack's own pictures and of what it carries inside it, and the
 * panel of facts and actions beside it, with the pack's files sliding in over
 * both.
 *
 * The pane is a strip of tabs: the pictures, and one tab per thing the pack's
 * own directory turned out to hold — its skills, its commands, its declared MCP
 * servers. Which of the three is there is only knowable by reading the pack, so
 * it is read as the lightbox opens and a tab is offered only when that read
 * found something.
 *
 * A picture added here lives in this window (its own object URL) rather than on
 * disk, because nothing in this module writes a pack's directory; the files
 * panel reads what the pack actually holds from the host, and shows nothing when
 * it cannot be read rather than standing something in.
 *
 * A pack has no single place it is installed in, so the panel lists them all —
 * the hub's own library first, then one row per agent, under the scope that
 * names it — and each row carries its own way in or out.
 */
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardPasteIcon,
  ExternalLinkIcon,
  FileTextIcon,
  ImageIcon,
  ImagePlusIcon,
  LibraryIcon,
  LinkIcon,
  MinusIcon,
  MoreHorizontalIcon,
  PlayIcon,
  PlugIcon,
  PlusIcon,
  RefreshCwIcon,
  SparklesIcon,
  SquareSlashIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react"
import * as React from "react"

import { PluginFileTree, fileTreeKey } from "./file-tree.tsx"
import { UpdateAction } from "./install-actions.tsx"
import { PluginTile } from "./parts.tsx"
import {
  packContents,
  packContentsIn,
  packFile,
  packFileIn,
  packFiles,
  packFilesIn,
  type PluginClient,
} from "./library.ts"
import { placeReached, SCOPES, scopeWords } from "./rows.ts"
import { NO_CONTENTS } from "./contract.ts"
import type { PackContentItem, PackContents } from "./contract.ts"
import type { PluginInstallScope } from "./contract.ts"
import type { PluginFileEntry, PluginRow } from "./types.ts"

import {
  CodeCard,
  DialogSplit,
  PlaceList,
  TagEditor,
  type PlaceOption,
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
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Spinner } from "@workspace/ui/components/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { toast } from "@workspace/ui/components/toast"
import type { AssetScope } from "@workspace/extensions"

/** The two scope groups a panel lists places under, in the order it reads them. */
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

/** The tabs the pane can show: the pack's own pictures first, then whatever its directory turned out to carry. */
type PackTab = "media" | "skills" | "commands" | "mcp"

/**
 * One scanned tab's list: what each thing a pack ships is called, what it says
 * about itself, and the mark of the kind of thing it is.
 *
 * The rows are shadcn's own item components — the group, the media plate, the
 * title and the description — rather than a shape drawn here, so this list
 * answers to the same typography and spacing as the rest of the interface.
 *
 * Nothing here can be edited — these files belong to the pack and are written
 * wherever it is authored — so a row is a line of reading, not a field.
 *
 * @param icon — the mark for what this list holds: a skill, or a command.
 */
function ContentList({
  items,
  icon: Icon,
}: {
  items: readonly PackContentItem[]
  icon: LucideIcon
}) {
  return (
    <ItemGroup className="gap-2.5">
      {items.map((item, at) => (
        /* A card rather than a ruled line: the same shape the tools tab draws
           its own list of read-only entries in, inside the same kind of pane.
           The padding is the variant's own. */
        <Item key={`${String(at)}:${item.title}`} variant="outline" className="bg-card">
          {/* The plate is the media slot's own: it sits where an item's picture
              would. The variant nudges an inline mark onto the title's baseline
              when a row has a description, which a plate this tall does not want
              — the row's own `items-center` centers it, as the place rows beside
              this list are centered. */}
          <ItemMedia
            variant="icon"
            className="size-7 self-center! translate-y-0! rounded-[8px] bg-surface-raised ring-1 ring-border ring-inset"
          >
            <Icon className="size-[15px] text-copy" aria-hidden />
          </ItemMedia>
          <ItemContent>
            <ItemTitle className="font-mono text-[13px] leading-[18px] font-semibold">
              {item.title}
            </ItemTitle>
            {/* A file that says nothing about itself reads as its name alone,
                rather than under an empty line. */}
            {item.description === "" ? null : (
              <ItemDescription className="text-[12.5px] leading-[17px]">
                {item.description}
              </ItemDescription>
            )}
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  )
}

/**
 * The left side of the lightbox: the pack's own pictures, and a tab for each of
 * the three things its directory may carry.
 *
 * A pack's skills, commands and MCP servers are read from the pack itself rather
 * than recorded anywhere, so they are read once as the lightbox opens — one
 * request, and one answer the tabs are built from. A tab is only offered when
 * that answer holds something: a view whose whole content is "none" is not a
 * view, and the panel beside it already says what the pack is either way.
 */
function PackPane({ plugin }: { plugin: PluginRow }) {
  const { t } = useI18n()
  const [tab, setTab] = React.useState<PackTab>("media")
  const [contents, setContents] = React.useState<PackContents>(NO_CONTENTS)

  /* Where this pack is read from: the hub's own copy when it holds one, and
     otherwise the directory an agent reads it in — the same pair of places its
     files panel reads. */
  const dir = plugin.stored ? null : (plugin.directory ?? null)
  React.useEffect(() => {
    let alive = true
    queueMicrotask(() => {
      if (!alive) return
      void (dir === null ? packContents(plugin.id) : packContentsIn(dir))
        .then((found) => {
          if (alive) setContents(found)
        })
        /* A pack whose directory cannot be read offers no tab rather than a
           failed one: what could not be read is the files panel's to say. */
        .catch(() => {
          if (alive) setContents(NO_CONTENTS)
        })
    })
    return () => {
      alive = false
    }
  }, [dir, plugin.id])

  const offered: { id: PackTab; key: string; count?: number }[] = [
    { id: "media", key: "plugins.detail.tab.media" },
    ...(contents.skills.length === 0
      ? []
      : [
          {
            id: "skills" as PackTab,
            key: "plugins.detail.tab.skills",
            count: contents.skills.length,
          },
        ]),
    ...(contents.commands.length === 0
      ? []
      : [
          {
            id: "commands" as PackTab,
            key: "plugins.detail.tab.commands",
            count: contents.commands.length,
          },
        ]),
    ...(contents.mcp === null ? [] : [{ id: "mcp" as PackTab, key: "plugins.detail.tab.mcp" }]),
  ]
  /* A tab that is no longer offered — a pack read again with less in it — leaves
     the pane on the pictures rather than on nothing. */
  const shown = offered.some((one) => one.id === tab) ? tab : "media"

  return (
    <Tabs
      value={shown}
      onValueChange={(value) => setTab(value as PackTab)}
      className="min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden"
    >
      <div className="flex h-12 shrink-0 items-center border-b border-border px-6">
        <TabsList variant="line" className="h-12! gap-7 p-0">
          {offered.map((one) => (
            <TabsTrigger
              key={one.id}
              value={one.id}
              className="h-12 flex-none rounded-none border-0 px-0 py-0 text-[13.5px] leading-[1.4] font-medium text-muted-foreground after:inset-x-0 after:bottom-0! after:h-0.5 after:bg-primary data-active:font-semibold data-active:text-foreground"
            >
              {t(one.key)}
              {one.count === undefined ? null : (
                <span className="font-mono text-[12px] text-muted-soft">{one.count}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {/* The pictures keep their own state — a picture added here lives in this
          window and nowhere else — so that pane stays mounted while another tab
          is on screen, rather than being emptied by a look at the skills. */}
      <TabsContent value="media" keepMounted className="flex min-h-0 flex-1 flex-col">
        <MediaPane plugin={plugin} />
      </TabsContent>
      {contents.skills.length === 0 ? null : (
        <TabsContent
          value="skills"
          className="min-h-0 flex-1 scrollbar-gutter-stable overflow-y-auto px-6 py-[22px]"
        >
          <ContentList items={contents.skills} icon={SparklesIcon} />
        </TabsContent>
      )}
      {contents.commands.length === 0 ? null : (
        <TabsContent
          value="commands"
          className="min-h-0 flex-1 scrollbar-gutter-stable overflow-y-auto px-6 py-[22px]"
        >
          <ContentList items={contents.commands} icon={SquareSlashIcon} />
        </TabsContent>
      )}
      {/* The MCP tab is the pack's own declaration read as a file: what a client
          is handed is exactly what is written there. */}
      {contents.mcp === null ? null : (
        <TabsContent value="mcp" className="min-h-0 flex-1 px-6 py-[22px]">
          <CodeCard
            path=".mcp.json"
            text={contents.mcp}
            words={{
              copy: t("plugins.detail.files.copy"),
              copied: t("plugins.detail.files.copied"),
            }}
            className="h-full"
          />
        </TabsContent>
      )}
    </Tabs>
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

/** The pill a place row's own action wears, in the panel's 30px measure. */
const placePill =
  "h-[30px] shrink-0 gap-1.5 rounded-full px-3 text-[12.5px] font-semibold"

/**
 * Where a browser can read the recorded address, when it names something
 * public: a URL as it stands, or the `owner/repo` shorthand the add dialog
 * takes. A directory on this machine stays plain text — there is nothing to
 * open, and it is not a location any browser knows.
 */
function sourceHref(address: string): string | null {
  if (/^https?:\/\//i.test(address)) return address
  if (/^[\w.-]+\/[\w.-]+$/.test(address)) return `https://github.com/${address}`
  return null
}

/**
 * The source line for a pack the hub holds: the address it was collected from,
 * and the one action that follows from it.
 *
 * Asking a source means reading it, so nothing runs on its own — a person asks,
 * and the last recorded answer seeds what this row shows until the next one.
 * That answer is on the record rather than in this component, because the list
 * pages read the same one.
 */
function SourceSection({
  plugin,
  busy,
  onCheck,
  onUpdate,
}: {
  plugin: PluginRow
  busy: boolean
  onCheck: () => Promise<void>
  onUpdate: () => void
}) {
  const { t } = useI18n()
  const [checking, setChecking] = React.useState(false)
  const href = sourceHref(plugin.sourceAddress)

  const check = () => {
    setChecking(true)
    onCheck().catch((failure: unknown) => {
      /* The row falls back to what it already knew; why the source could not be
         asked is said the way every other refusal is. */
      toast.add({
        type: "error",
        title: failure instanceof Error ? failure.message : String(failure),
      })
    }).finally(() => setChecking(false))
  }

  /* Nothing recorded where these files came from — a pack written here, or
     dropped in by hand — so there is no line to show; the heading beside the
     pack's name already says it came from this machine. */
  if (plugin.sourceAddress === "") return null

  const outdated = plugin.outdated === true
  const modified = plugin.modified === true
  const status =
    plugin.hasSource !== true
      ? t("plugins.update.unanswerable")
      : checking
        ? t("plugins.update.checking")
        : plugin.checkedAt === undefined || plugin.checkedAt === ""
          ? null
          : outdated
            ? t("plugins.update.available")
            : modified
              ? t("plugins.update.edited")
              : t("plugins.update.current")

  return (
    <div className="flex flex-col gap-1.5 border-b border-border py-2.5">
      <div className="flex h-[30px] items-center justify-between gap-2">
        <span className="text-[12.5px] text-muted-foreground">
          {t("plugins.detail.source")}
        </span>
        {/* A source that cannot be asked gets no button, rather than one that
            never does anything. */}
        {plugin.hasSource !== true ? null : outdated ? (
          <UpdateAction plugin={plugin} busy={busy} onUpdate={onUpdate} />
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={busy || checking}
            aria-label={`${t("plugins.update.check")} ${plugin.name}`}
            onClick={check}
            className={`${placePill} border-border bg-transparent text-foreground hover:bg-muted dark:border-input dark:bg-transparent`}
          >
            <RefreshCwIcon className={`size-[13px] ${checking ? "animate-spin" : ""}`} />
            {t("plugins.update.check")}
          </Button>
        )}
      </div>
      {href === null ? (
        <span className="truncate font-mono text-[12.5px] text-muted-foreground">
          {plugin.sourceAddress}
        </span>
      ) : (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="flex h-[17px] min-w-0 items-center gap-1.5 font-mono text-[12.5px] text-primary hover:underline"
        >
          <span className="truncate">{plugin.sourceAddress}</span>
          <ExternalLinkIcon className="size-[13px] shrink-0" />
        </a>
      )}
      {status === null ? null : (
        <span className="truncate text-[12px] text-muted-soft">{status}</span>
      )}
      {plugin.checkedAge === "" ? null : (
        <span className="truncate text-[12px] text-muted-soft">
          {t("plugins.update.lastChecked").replace("{age}", plugin.checkedAge)}
        </span>
      )}
    </div>
  )
}

/**
 * Where this pack can be, and the way into and out of each place: the hub's own
 * library first, then one row per agent under the scope that names it.
 *
 * A place is one agent, not one of that agent's scopes. An agent that keeps
 * packs in two places inside a repository reads as one row saying both, and the
 * row's action is about the row: installing puts the pack in each of them, and
 * removing takes it back out of the ones that hold it. The finer choice — one
 * scope at a time — is what the list page's own row menu is for.
 */
function PlacesSection({
  plugin,
  clients,
  root,
  busy,
  onAdopt,
  onInstall,
  onUninstall,
}: {
  plugin: PluginRow
  clients: readonly PluginClient[]
  /** Where the hub's own library sits, as the panel spells it. */
  root: string
  busy: boolean
  onAdopt: () => void
  onInstall: (client: string, scope: PluginInstallScope) => void
  onUninstall: (client: string, scope: PluginInstallScope) => void
}) {
  const { t } = useI18n()
  /* The library is one of the places a pack can be, so it is one of the count.
     It counts where the pack really is, whether or not this hub put it there. */
  const installed = plugin.held.length + (plugin.stored ? 1 : 0)

  /* What this agent holds in this group, in its own words — not what this hub
     delivered to it. A pack the agent got from some other marketplace is just as
     installed, and its row has to say so and offer the way out. */
  const heldIn = (client: PluginClient, scope: AssetScope): string[] =>
    (plugin.held.find((one) => one.client === client.id)?.places ?? [])
      .filter((one) => one.group === scope)
      .map((one) => one.scope)
  /* Why this row cannot be taken at all: an agent that is not on this machine,
     or one whose own list could not be read — the second holds an unknown set of
     packs, which is not the same as holding none. */
  const blockedFor = (client: PluginClient): string | null =>
    client.error !== undefined
      ? t("plugins.client.unread")
      : client.available
        ? null
        : t("plugins.client.absent")

  /* The rows, and what each one's action must reach. A row stands for the one
     place its action lands in, so what it says and what a click writes agree; an
     agent that keeps nothing in this group has no row here. A row's id carries
     the group as well as the agent, because one agent appears in two groups. */
  const rows = SCOPES.map((scope) => ({
    label: t(`plugins.detail.group.${scope}`),
    options: clients.flatMap((client): PlaceOption[] => {
      const reached = placeReached(client.places, scope)
      if (reached === undefined) return []
      return [
        {
          id: `${scope}:${client.id}`,
          icon: client.icon,
          label: client.label,
          /* The agent's own word for that one place: this hub has no path to
             show, because an installer never names one. */
          note: scopeWords([reached.scopeWord], t),
        },
      ]
    }),
  }))
  const byRow = new Map(
    rows.flatMap((group) =>
      group.options.map((option) => {
        const [scope, ...rest] = option.id.split(":")
        return [option.id, { client: rest.join(":"), scope: scope as AssetScope }] as const
      })
    )
  )

  const rowAction = (option: PlaceOption) => {
    const at = byRow.get(option.id)
    if (at === undefined) return null
    const client = clients.find((one) => one.id === at.client)
    if (client === undefined) return null

    const blocked = blockedFor(client)
    if (blocked !== null) {
      /* Nothing can be said about this agent's packs, so the row offers the way
         in rather than claiming the pack is not there. */
      return (
        <Button
          type="button"
          variant="ghost"
          disabled
          title={blocked}
          className={`${placePill} bg-secondary text-foreground`}
        >
          {t("plugins.action.install")}
        </Button>
      )
    }

    const held = heldIn(client, at.scope)
    if (held.length > 0) {
      return (
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          aria-label={`${t("plugins.action.uninstall")} ${client.label}`}
          onClick={() => {
            for (const one of held) onUninstall(client.id, one as PluginInstallScope)
          }}
          className={`${placePill} border-border bg-transparent text-copy hover:bg-muted hover:text-foreground dark:border-input dark:bg-transparent`}
        >
          <MinusIcon className="size-[13px]" />
          {t("plugins.action.uninstall")}
        </Button>
      )
    }
    return (
      <Button
        type="button"
        variant="ghost"
        disabled={busy}
        aria-label={`${t("plugins.action.install")} ${client.label}`}
        onClick={() => {
          const reached = placeReached(client.places, at.scope)
          if (reached !== undefined) onInstall(client.id, reached.scopeWord)
        }}
        className={`${placePill} bg-secondary text-foreground hover:bg-accent`}
      >
        <PlusIcon className="size-[13px]" />
        {t("plugins.action.install")}
      </Button>
    )
  }

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[13px] leading-[16px] font-semibold">
          {t("plugins.detail.places")}
        </span>
        <span className="text-[12.5px] text-muted-foreground">
          {t("plugins.detail.places.held").replace("{count}", String(installed))}
        </span>
      </div>
      <ul className="flex flex-col gap-2.5">
        <li className="flex h-14 items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-surface-raised ring-1 ring-border ring-inset">
            <LibraryIcon className="size-[15px] text-copy" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[12.5px] leading-[15px] font-semibold">
              {t("plugins.tab.library")}
            </span>
            {root === "" ? null : (
              <span className="truncate font-mono text-[10.5px] leading-[14px] text-muted-foreground">
                {/* A path reads with forward slashes whatever the platform the
                    host runs on, as every other path this panel shows does. */}
                {root.replaceAll("\\", "/")}
              </span>
            )}
          </span>
          {/* Held, the row says which copy this is; not held, it offers the way
              in — the same action the unstored tab holds. */}
          {plugin.stored ? (
            <span className="flex h-[22px] shrink-0 items-center rounded-full px-[9px] text-[11px] font-medium text-copy ring-1 ring-border">
              {t("plugins.place.body")}
            </span>
          ) : (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              aria-label={`${t("plugins.action.adopt")} ${plugin.name}`}
              onClick={onAdopt}
              className={`${placePill} bg-secondary text-foreground hover:bg-accent`}
            >
              <PlusIcon className="size-[13px]" />
              {t("plugins.action.adopt")}
            </Button>
          )}
        </li>
        <PlaceList
          groups={rows}
          words={{
            expand: (rest) => t("plugins.place.expand").replace("{count}", String(rest)),
            collapse: t("plugins.place.collapse"),
          }}
          action={rowAction}
        />
      </ul>
    </section>
  )
}

function InfoPanel({
  plugin,
  clients,
  busy,
  onUpdate,
  onInstall,
  onUninstall,
  onAdopt,
  onCheckUpdate,
  onDelete,
  onViewFiles,
  onTagsChange,
  tagSuggestions,
  root,
}: {
  plugin: PluginRow
  clients: readonly PluginClient[]
  /** Where the hub's own library sits, for the places list to name. */
  root: string
  busy: boolean
  /** Take this pack to the revision its source holds. */
  onUpdate: () => void
  onInstall: (client: string, scope: PluginInstallScope) => void
  onUninstall: (client: string, scope: PluginInstallScope) => void
  /** Take a pack only an agent holds into the library. */
  onAdopt: () => void
  /** Ask this pack's source whether it moved. */
  onCheckUpdate: () => Promise<void>
  /** Drop the pack from the library; copies an agent holds are left alone. */
  onDelete: () => Promise<void>
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
            {/* A pack need not declare a revision, and a lone "v" reads as a
                broken line rather than as a pack that named none. */}
            {plugin.version === "" ? null : (
              <>
                {t("plugins.version").replace("{version}", plugin.version)}
                <span aria-hidden className="text-muted-soft">
                  ·
                </span>
              </>
            )}
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

        {/* Categories are the hub's own filing of a pack, kept in the record the
            library holds; a pack only an agent holds has no record to file. */}
        {plugin.stored ? (
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
        ) : null}

        <PlacesSection
          plugin={plugin}
          clients={clients}
          root={root}
          busy={busy}
          onAdopt={onAdopt}
          onInstall={onInstall}
          onUninstall={onUninstall}
        />

        <SourceSection
          plugin={plugin}
          busy={busy}
          onCheck={onCheckUpdate}
          onUpdate={onUpdate}
        />

        {/* When this last moved, which answers the same "what is this pack"
            question the source block above asks, so it sits with it. A pack the
            hub never collected has moved nowhere here and carries no such time. */}
        {plugin.updated === "" ? null : (
          <div className="flex flex-col">
            <MetaRow label={t("plugins.detail.updated")} value={plugin.updated} />
          </div>
        )}
      </div>

      <div className="flex h-16 shrink-0 items-center gap-2.5 border-t border-border px-5">
        {/* A pack's files are readable either way: the hub's own copy when it
            holds one, and otherwise the directory an agent reads it in. */}
        <Button
          className="h-10 flex-1 gap-[7px] rounded-full text-[13.5px] font-semibold"
          onClick={onViewFiles}
          disabled={!plugin.stored && plugin.directory === undefined}
          title={
            plugin.stored || plugin.directory !== undefined
              ? undefined
              : t("plugins.detail.files.unstored")
          }
        >
          <FileTextIcon className="size-[15px]" />
          {t("plugins.detail.files.action")}
        </Button>
        {/* Deleting is another class of action, so it sits apart from the main
            one rather than in the same visual slot. Each side deletes what it
            owns: the library its copy, and an agent's own install its copy. */}
        <DeleteBubble
          name={plugin.name}
          text={
            plugin.stored
              ? t("plugins.delete.text")
              : t("plugins.delete.agentText").replace(
                  "{names}",
                  plugin.held.map((one) => one.label).join(t("plugins.notice.separator"))
                )
          }
          detail={
            plugin.stored
              ? root === "" || root === undefined
                ? null
                : root.replaceAll("\\", "/")
              : /* A path reads with forward slashes whatever the platform the
                   host runs on, as every other path this panel shows does. */
                (plugin.directory?.replaceAll("\\", "/") ?? null)
          }
          onDelete={() => {
            if (plugin.stored) return onDelete()
            /* Nothing here is the hub's to drop: the pack lives in the agents
               that hold it, so removing it is each of them taking it back out.
               A pack can be in more than one of them, so this is one call per
               place it is in, and the first refusal names what stopped it. */
            return (async () => {
              for (const hold of plugin.held) {
                for (const place of hold.places) {
                  await onUninstall(hold.client, place.scope as PluginInstallScope)
                }
              }
            })()
          }}
        >
          <Button
            variant="outline"
            className="h-10 shrink-0 gap-[7px] rounded-full border-destructive/35 bg-transparent px-4 text-[13.5px] font-semibold text-destructive hover:bg-destructive/5 hover:text-destructive aria-expanded:bg-transparent aria-expanded:text-destructive dark:border-destructive/35 dark:bg-transparent"
          >
            <Trash2Icon className="size-[15px]" />
            {t("plugins.detail.delete")}
          </Button>
        </DeleteBubble>
      </div>
    </div>
  )
}

/**
 * The question a person is asked before a pack goes, in the bubble the skills
 * page asks it in: what goes, where it is, and the two ways out.
 *
 * The sentence is the caller's, because what "delete" means differs: the hub
 * dropping its own copy, or an agent's own install taking the pack back out.
 */
function DeleteBubble({
  name,
  text,
  detail,
  onDelete,
  children,
}: {
  name: string
  /** What actually goes, ready to show. */
  text: string
  /** The directory it is, spelled as a person would write it; nothing when unknown. */
  detail: string | null
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
        <span className="text-[14px] leading-[18px] font-semibold">
          {t("plugins.delete.title").replace("{name}", name)}
        </span>
        <span className="text-[12.5px] leading-[17px] text-copy">{text}</span>
        {detail === null ? null : (
          /* The directory reads as data, so it sits on its own quiet surface
             rather than in the running text. A path carries no spaces, so
             `break-all` is what keeps a deep one inside the bubble instead of
             running out of it. */
          <span className="rounded-md bg-surface-raised px-2.5 py-2 font-mono text-[11px] leading-[15px] break-all text-copy">
            {detail}
          </span>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            className="h-8 rounded-full border-border bg-transparent px-[14px] text-[12.5px] font-semibold dark:border-input dark:bg-transparent"
            disabled={busy}
            onClick={() => setOpen(false)}
          >
            {t("plugins.action.cancel")}
          </Button>
          {/* Red stays a text and outline colour here: the destructive button is
              outlined, so nothing in the panel is a red block. */}
          <Button
            variant="outline"
            className="h-8 rounded-full border-destructive/35 bg-transparent px-[14px] text-[12.5px] font-semibold text-destructive hover:bg-destructive/5 hover:text-destructive dark:border-destructive/35 dark:bg-transparent"
            disabled={busy}
            onClick={confirm}
          >
            {t("plugins.delete.confirm")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
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
  /* Where this pack's files are read from: the hub's own copy when it holds one,
     and otherwise the directory an agent reads it in. A pack the hub has no
     record of is still a directory with files in it. */
  const dir = plugin.stored ? null : (plugin.directory ?? null)
  const list = React.useCallback(
    () => (dir === null ? packFiles(plugin.id) : packFilesIn(dir)),
    [dir, plugin.id]
  )
  const read = React.useCallback(
    (path: string) =>
      dir === null ? packFile(plugin.id, path) : packFileIn(dir, path),
    [dir, plugin.id]
  )
  /* A pack's files come from the host, so the panel shows what the pack holds
     and nothing at all when it cannot be read. Another pack means another
     directory, and the lightbox is keyed by the pack, so this starts empty. */
  const [files, setFiles] = React.useState<PluginFileEntry[]>([])
  React.useEffect(() => {
    let alive = true
    queueMicrotask(() => {
      if (!alive) return
      void list()
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
  }, [list])
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
      void read(current)
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
  }, [read, current])
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
  root,
  busy,
  tagSuggestions,
  onUpdate,
  onInstall,
  onUninstall,
  onAdopt,
  onCheckUpdate,
  onDelete,
  onTagsChange,
}: {
  plugin: PluginRow
  clients: readonly PluginClient[]
  root: string
  busy: boolean
  tagSuggestions: string[]
  onUpdate: (plugin: PluginRow) => void
  onInstall: (plugin: PluginRow, client: string, scope: PluginInstallScope) => void
  onUninstall: (plugin: PluginRow, client: string, scope: PluginInstallScope) => void
  onAdopt: (plugin: PluginRow) => void
  onCheckUpdate: (plugin: PluginRow) => Promise<void>
  onDelete: (plugin: PluginRow) => Promise<void>
  onTagsChange: (tags: string[]) => void
}) {
  const [filesOpen, setFilesOpen] = React.useState(false)

  return (
    <DialogSplit
      pane={<PackPane plugin={plugin} />}
      panel={
        <InfoPanel
          plugin={plugin}
          clients={clients}
          root={root}
          busy={busy}
          onUpdate={() => onUpdate(plugin)}
          onInstall={(client, scope) => onInstall(plugin, client, scope)}
          onUninstall={(client, scope) => onUninstall(plugin, client, scope)}
          onAdopt={() => onAdopt(plugin)}
          onCheckUpdate={() => onCheckUpdate(plugin)}
          onDelete={() => onDelete(plugin)}
          onViewFiles={() => setFilesOpen(true)}
          onTagsChange={onTagsChange}
          tagSuggestions={tagSuggestions}
        />
      }
      /* A pack's files are readable either way — the hub's own copy, or the
         directory an agent reads it in — so the panel is there whenever one of
         the two exists. */
      overlay={
        plugin.stored || plugin.directory !== undefined ? (
          <>
            <div
              className={`pointer-events-none absolute inset-0 z-10 bg-scrim transition-opacity duration-300 ${
                filesOpen ? "opacity-100" : "opacity-0"
              }`}
            />
            <FilesPanel plugin={plugin} open={filesOpen} onBack={() => setFilesOpen(false)} />
          </>
        ) : null
      }
    />
  )
}

/** Detail lightbox for one pack; opens on click from either view. */
export function PluginDetailDialog({
  plugin,
  clients,
  root,
  busy,
  tagSuggestions,
  onUpdate,
  onInstall,
  onUninstall,
  onAdopt,
  onCheckUpdate,
  onDelete,
  onTagsChange,
  onOpenChange,
}: {
  /** The pack on screen, or `null` while the lightbox is closed. */
  plugin: PluginRow | null
  /** The clients this hub can deliver to, with what each one already holds. */
  clients: readonly PluginClient[]
  /** Where the hub's own library sits, for the places list to name. */
  root: string
  busy: boolean
  /** Every category in use across the catalog, for the editor's quick picks. */
  tagSuggestions: string[]
  onUpdate: (plugin: PluginRow) => void
  onInstall: (plugin: PluginRow, client: string, scope: PluginInstallScope) => void
  onUninstall: (plugin: PluginRow, client: string, scope: PluginInstallScope) => void
  onAdopt: (plugin: PluginRow) => void
  /** Ask this pack's source whether it moved. */
  onCheckUpdate: (plugin: PluginRow) => Promise<void>
  /** Drop the pack from the library; copies an agent holds are left alone. */
  onDelete: (plugin: PluginRow) => Promise<void>
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
          root={root}
          busy={busy}
          tagSuggestions={tagSuggestions}
          onUpdate={onUpdate}
          onInstall={onInstall}
          onUninstall={onUninstall}
          onAdopt={onAdopt}
          onCheckUpdate={onCheckUpdate}
          onDelete={onDelete}
          onTagsChange={onTagsChange}
        />
      )}
    </Dialog>
  )
}
