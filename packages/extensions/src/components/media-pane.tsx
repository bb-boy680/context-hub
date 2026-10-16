/**
 * The area a record's own pictures are read and changed in: the stage and strip
 * of {@link MediaGallery}, and the four ways a picture gets there — a file
 * picker, a drop, a paste, or a link.
 *
 * What the stage shows when there is no picture at all belongs to the caller:
 * a skill draws its document, a prompt draws itself as markdown, a plugin draws
 * the pack's readme. So does every string, since the screens that draw this
 * speak different languages in different namespaces.
 *
 * The words are passed in rather than resolved here for the same reason the
 * gallery's are: two modules with different message tables cannot drift apart
 * on markup if the markup reads nothing but its props.
 */
import { ClipboardPasteIcon, ImagePlusIcon, LinkIcon, PlusIcon, UploadIcon } from "lucide-react"
import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { toast } from "@workspace/ui/components/toast"

import { MediaGallery, type MediaGalleryWords, type MediaItem } from "./media-gallery.tsx"

/** What the lightbox can do with its media, depending on where the record lives. */
export interface MediaSource {
  items: MediaItem[]
  /** A library write is in flight. */
  busy: boolean
  /** Files to upload, from a file picker, a drop, or the clipboard. */
  addFiles(files: ArrayLike<File>): Promise<void>
  /** Store a pasted URL or data: URL; rejects with a displayable message. */
  addUrl(src: string): Promise<void>
  remove(id: string): Promise<void>
}

/** The words this pane and its gallery read out. */
export interface MediaPaneWords {
  dropTitle: string
  dropFormats: string
  /** The `+`'s accessible name. */
  upload: string
  addFile: string
  addFileHint: string
  addLink: string
  addLinkHint: string
  addPaste: string
  addPasteHint: string
  addLinkLabel: string
  addPlaceholder: string
  addAction: string
  /** Why a link that could not be fetched was refused. */
  addFailed: string
  /** A paste that carried text rather than a picture. */
  pasteText: string
  pasteDone: (count: number) => string
  hint: string
  cancel: string
  gallery: MediaGalleryWords
}

/** How long a notice about the last upload stays up. */
const NOTICE_MS = 4000

/**
 * The media column: the gallery, and the controls that put something in it.
 *
 * @param empty — what the stage holds when the record has no picture at all.
 * @param source — the pictures, and the four actions behind them.
 * @param words — every string this pane draws.
 * @param onScreen — whether the surface this pane sits on is the one being read.
 * A paste listener is document-wide, and a pane behind another tab would
 * otherwise take a screenshot pasted somewhere else; `false` turns it off.
 */
export function MediaPane({
  empty,
  source,
  words,
  onScreen = true,
}: {
  empty: React.ReactNode
  source: MediaSource
  words: MediaPaneWords
  onScreen?: boolean
}) {
  const { items, busy } = source
  const [dragOver, setDragOver] = React.useState(false)
  const [addOpen, setAddOpen] = React.useState(false)
  /* The second entry of the upload menu opens its link field in place, rather
     than stacking a second surface on top of the first. */
  const [addFace, setAddFace] = React.useState<"menu" | "link">("menu")
  const [notice, setNotice] = React.useState<string | null>(null)
  const [link, setLink] = React.useState("")
  const fileRef = React.useRef<HTMLInputElement | null>(null)

  /* A screenshot should not have to be saved as a file first, so the paste
     listener is document-wide while this pane is mounted. A file copied in a
     file manager arrives the same way, video included.
     A paste into a field is that field's business: the link box takes a URL, and
     running the listener there would answer a pasted URL with "that is text,
     not an image". */
  React.useEffect(() => {
    if (!onScreen) return
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
        if (data.getData("text") !== "") setNotice(words.pasteText)
        return
      }
      event.preventDefault()
      setNotice(words.pasteDone(picked.length))
      void source.addFiles(picked)
    }

    document.addEventListener("paste", onPaste)
    return () => document.removeEventListener("paste", onPaste)
  }, [source, words, onScreen])

  /* Whatever the upload just said stops saying it on its own. */
  React.useEffect(() => {
    if (notice === null) return
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS)
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
              ? words.addFailed
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
          <span className="text-[15px] font-semibold">{words.dropTitle}</span>
          <span className="text-[13px] text-muted-foreground">{words.dropFormats}</span>
        </div>
      ) : null}
      {notice === null ? null : (
        <span className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full bg-foreground px-3.5 py-1.5 text-[12px] font-medium text-background">
          {notice}
        </span>
      )}
      <MediaGallery
        items={items}
        empty={empty}
        onRemove={(id) => void source.remove(id)}
        words={words.gallery}
        action={
          <>
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
                    aria-label={words.upload}
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
                          {words.addFile}
                        </span>
                        <span className="truncate text-[11.5px] leading-[15px] text-muted-soft">
                          {words.addFileHint}
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
                          {words.addLink}
                        </span>
                        <span className="truncate text-[11.5px] leading-[15px] text-muted-soft">
                          {words.addLinkHint}
                        </span>
                      </span>
                    </button>
                    {/* Paste is a gesture, not an entry: it says what to press and
                        takes no click, so it is a row rather than a button. */}
                    <span className="flex h-12 w-full items-center gap-2.5 px-3">
                      <ClipboardPasteIcon className="size-4 shrink-0 text-copy" aria-hidden />
                      <span className="flex min-w-0 flex-1 flex-col gap-px">
                        <span className="truncate text-[13px] leading-[17px] font-medium">
                          {words.addPaste}
                        </span>
                        <span className="truncate text-[11.5px] leading-[15px] text-muted-soft">
                          {words.addPasteHint}
                        </span>
                      </span>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-[12px] font-semibold">{words.addLinkLabel}</span>
                    <div className="flex h-[34px] items-center gap-2 rounded-md border-2 border-primary px-2.5">
                      <LinkIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <input
                        autoFocus
                        value={link}
                        onChange={(event) => setLink(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") addLink()
                        }}
                        placeholder={words.addPlaceholder}
                        aria-label={words.addLinkLabel}
                        className="min-w-0 flex-1 bg-transparent font-mono text-[11px] outline-none placeholder:text-muted-soft"
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        className="h-7 rounded-full border-border bg-transparent px-3 text-[12.5px] font-semibold dark:border-input dark:bg-transparent"
                        onClick={() => setAddFace("menu")}
                      >
                        {words.cancel}
                      </Button>
                      <Button
                        className="h-7 rounded-full px-3 text-[12.5px] font-semibold"
                        disabled={busy}
                        onClick={addLink}
                      >
                        {words.addAction}
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
          </>
        }
      />

      <p className="text-xs leading-[15px] text-muted-foreground">{words.hint}</p>
    </div>
  )
}
