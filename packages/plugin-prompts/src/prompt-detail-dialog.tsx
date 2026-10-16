/**
 * One prompt, read in full: its pictures, its whole text, and every place it
 * can be sent.
 *
 * The card shows a prompt's opening and nothing else — a cover is a preview,
 * and a prompt longer than seven lines runs past it. This is where the whole
 * thing is, in the shape the skill lightbox already has: a media column beside
 * a panel of facts, so one prompt can be read, corrected, copied and delivered
 * from one place.
 *
 * It holds no copy of the prompt: the row it was opened from is the value it is
 * given, so what the library holds is what is on screen. What it does hold is a
 * draft — the text as it is being edited, before anyone says to keep it.
 */
import {
  CheckIcon,
  CopyIcon,
  EllipsisIcon,
  LibraryIcon,
  MinusIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import * as React from "react"

import { assetKind } from "@workspace/core"
import type { PlaceFiles } from "@workspace/core/place-files"
import {
  CodeCard,
  CodeEditor,
  CodeView,
  DialogSplit,
  MediaPane,
  PlaceList,
  TagEditor,
  type MediaGalleryWords,
  type MediaItem,
  type MediaPaneWords,
  type MediaSource,
  type PlaceGroup,
  type PlaceOption,
} from "@workspace/extensions/components"
import { useI18n } from "@workspace/extensions/react"
import { Button } from "@workspace/ui/components/button"
import { Dialog, DialogClose, DialogTitle } from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Markdown } from "@workspace/ui/components/markdown"
import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { Textarea } from "@workspace/ui/components/textarea"
import { toast } from "@workspace/ui/components/toast"

import type { Delivery } from "./deliver.ts"
import { GenerateItems } from "./install-menu.tsx"
import { tokenLabel, useInstalled, usePromptStore, type Installed } from "./library.ts"
import type { PromptPlace } from "./provider.ts"
import type { PromptStore, StoredPrompt } from "./store.ts"

/** The scopes, in the order a list of places reads them. */
const SCOPES = ["workspace", "global"] as const

/**
 * The name a prompt's text is coloured and titled under.
 *
 * A prompt has no file name to read a grammar off, and the ones written with
 * headings, lists and fences are written in markdown; the rest read as plain
 * text under that grammar, which is what they are anyway.
 */
const GRAMMAR_PATH = "prompt.md"

/** How long the copy button wears its confirmation before it offers again. */
const COPIED_MS = 3000

/**
 * What the stage shows instead of a picture: the prompt itself.
 *
 * The same fallback the skill lightbox draws its document with, for the same
 * reason — a prompt *is* its text, so a person who added no picture is still
 * looking at the thing they came for.
 */
function BodyStage({ text }: { text: string }) {
  return (
    <div className="size-full scrollbar-gutter-stable overflow-x-hidden overflow-y-auto bg-surface-raised px-8 py-6">
      <Markdown className="mx-auto max-w-[640px] text-[13px] leading-[21px] text-secondary-foreground">
        {text}
      </Markdown>
    </div>
  )
}

/**
 * The prompt's pictures, read from the row and written through the store.
 *
 * There is no second read here: a prompt arrives with its references already on
 * it, so this tab draws the very row the page is holding. Every write ends in
 * `onChanged`, which is the page re-reading the library — so what lands on
 * screen is what is on disk, with no optimistic copy to fall out of step.
 */
function usePromptMedia(
  prompt: StoredPrompt,
  store: PromptStore | null,
  onChanged: () => void
): MediaSource {
  const [busy, setBusy] = React.useState(false)
  const refs = prompt.assets

  const items = React.useMemo(
    (): MediaItem[] =>
      store === null
        ? []
        : refs.map((ref) => ({ id: ref, kind: assetKind(ref), src: store.assetUrl(ref) })),
    [store, refs]
  )

  const write = React.useCallback(
    async (change: (api: PromptStore) => Promise<unknown>): Promise<void> => {
      if (store === null) return
      setBusy(true)
      try {
        await change(store)
        onChanged()
      } finally {
        setBusy(false)
      }
    },
    [store, onChanged]
  )

  /* Why a write was refused lands where every other refusal does. `addUrl` is
     the exception: it rejects instead, because the pane says its own words for
     a link that could not be fetched. */
  const refuse = (reason: unknown) => {
    toast.add({
      type: "error",
      title: reason instanceof Error ? reason.message : String(reason),
    })
  }

  const addFiles = React.useCallback(
    (files: ArrayLike<File>) =>
      write(async (api) => {
        for (const file of Array.from(files)) await api.putAsset(prompt.id, file)
      }).catch(refuse),
    [write, prompt.id]
  )

  const addUrl = React.useCallback(
    (source: string) => write((api) => api.addAssetSource(prompt.id, source)),
    [write, prompt.id]
  )

  const remove = React.useCallback(
    (id: string) => write((api) => api.deleteAsset(prompt.id, id)).catch(refuse),
    [write, prompt.id]
  )

  return { items, busy, addFiles, addUrl, remove }
}

/** The words the shared media pane draws, in this module's own namespace. */
function usePromptMediaWords(): MediaPaneWords {
  const { t } = useI18n()
  const gallery: MediaGalleryWords = {
    play: t("prompts.media.play"),
    pause: t("prompts.media.pause"),
    seek: t("prompts.media.seek"),
    mute: t("prompts.media.mute"),
    unmute: t("prompts.media.unmute"),
    previous: t("prompts.media.previous"),
    next: t("prompts.media.next"),
    image: t("prompts.media.image"),
    video: t("prompts.media.video"),
    remove: t("prompts.media.remove"),
  }
  return {
    dropTitle: t("prompts.media.drop.title"),
    dropFormats: t("prompts.media.drop.formats"),
    upload: t("prompts.media.upload"),
    addFile: t("prompts.media.add.file"),
    addFileHint: t("prompts.media.add.fileHint"),
    addLink: t("prompts.media.add.link"),
    addLinkHint: t("prompts.media.add.linkHint"),
    addPaste: t("prompts.media.add.paste"),
    addPasteHint: t("prompts.media.add.pasteHint"),
    addLinkLabel: t("prompts.media.add.linkLabel"),
    addPlaceholder: t("prompts.media.add.placeholder"),
    addAction: t("prompts.media.add.action"),
    addFailed: t("prompts.media.add.failed"),
    pasteText: t("prompts.media.paste.text"),
    pasteDone: (count) => t("prompts.media.paste.done").replace("{count}", String(count)),
    hint: t("prompts.media.hint"),
    cancel: t("prompts.add.cancel"),
    gallery,
  }
}

/**
 * Where this prompt has been sent, and the way into every other place.
 *
 * A prompt has no directory every agent already shares, so there is no library
 * row to set above these the way a skill has one: the places an agent reads
 * from are the whole list, and a place holding nothing yet is a row to offer
 * rather than one to leave out.
 */
function PlacesSection({
  prompt,
  root,
  places,
  installed,
  files,
  busy,
  onToggle,
  onGenerate,
}: {
  prompt: StoredPrompt
  /** Where the library keeps its prompts, as a person reads it; `null` when unknown. */
  root: string | null
  places: readonly PromptPlace[]
  installed: Installed
  files: PlaceFiles | null
  busy: boolean
  onToggle: (place: PromptPlace) => void
  onGenerate: (place: PromptPlace, action: Delivery) => void
}) {
  const { t } = useI18n()
  const held = places.filter((place) => installed[place.id] === true).length
  const byId = React.useMemo(() => new Map(places.map((place) => [place.id, place])), [places])

  /* The measurements the skill lightbox lists its own places at. */
  const row = "flex h-14 items-center gap-2.5"
  const plate =
    "flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-surface-raised ring-1 ring-border ring-inset"
  const label = "truncate text-[12.5px] leading-[15px] font-semibold"
  const where = "truncate font-mono text-[10.5px] leading-[14px] text-muted-foreground"

  /* The rows carry no way to install: the `⋯` beside each one already opens
     everything that can be done with it, and a button that says the same thing
     twice makes the list read as two controls per row. */
  const rowAction = (option: PlaceOption) => {
    const place = byId.get(option.id)
    if (place === undefined) return null
    return (
      <span className="flex shrink-0 items-center gap-1">
        <PlaceGenerate
          prompt={prompt}
          place={place}
          held={installed[place.id] === true}
          busy={busy}
          files={files}
          onToggle={onToggle}
          onGenerate={onGenerate}
        />
      </span>
    )
  }

  const groups: PlaceGroup[] = SCOPES.map((scope) => ({
    label: t(`prompts.group.${scope}`),
    options: places
      .filter((place) => place.scope === scope)
      .map((place) => ({
        id: place.id,
        icon: place.icon,
        label: t(place.labelKey),
        /* A place already holding this prompt says so with its own mark. What
           the second line says is what the `⋯` beside it is for — the directory
           an agent reads is not something a person acts on from here, and the
           one thing this row can do that is not obvious is write the prompt out
           as a command or a rule. */
        note: t("prompts.place.generates"),
        selected: installed[place.id] === true,
      })),
  }))

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[13px] leading-[16px] font-semibold">
          {t("prompts.detail.places")}
        </span>
        <span className="text-[12.5px] text-muted-foreground">
          {t("prompts.detail.places.held").replace("{count}", String(held))}
        </span>
      </div>
      {/* The library is a place the prompt is in, and the one it is always in:
          listing only where it has been delivered made this read as a list of
          things it might have and left the section looking half-empty. The row
          is shaped the way the skill lightbox shapes its own, so the two read
          as one kind of thing. */}
      <ul className="flex flex-col gap-2.5">
        <li className={row}>
          <span className={plate}>
            <LibraryIcon className="size-[15px] text-copy" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className={label}>{t("prompts.location.library")}</span>
            {root === null ? null : <span className={where}>{root}</span>}
          </span>
          <span className="flex h-[22px] shrink-0 items-center rounded-full px-[9px] text-[11px] font-medium text-copy ring-1 ring-border">
            {t("prompts.place.body")}
          </span>
        </li>
        {places.length === 0 ? (
          <li className="text-[12.5px] text-muted-foreground">{t("prompts.place.none")}</li>
        ) : (
          /* Every scope this build reads, drawn by the same list the menus use:
             a person who has learned one place list has learned them all. */
          <PlaceList
            groups={groups}
            words={{
              expand: (rest) => t("prompts.place.expand").replace("{count}", String(rest)),
              collapse: t("prompts.place.collapse"),
            }}
            action={rowAction}
          />
        )}
      </ul>
    </section>
  )
}

/**
 * Everything one agent's row can do, behind the single control it carries.
 *
 * The row itself is not an action here — it names a place, and the list beside
 * it says what that place is — so the two things that can be done with the
 * place are both in this menu: put the prompt there, take it back out, and
 * write one of the three derived forms. The last three are the shared entries,
 * so this menu and the card's nested one cannot come apart.
 */
function PlaceGenerate({
  prompt,
  place,
  held,
  busy,
  files,
  onToggle,
  onGenerate,
}: {
  prompt: StoredPrompt
  place: PromptPlace
  /** Whether this place already holds the prompt, read from the file. */
  held: boolean
  busy: boolean
  files: PlaceFiles | null
  onToggle: (place: PromptPlace) => void
  onGenerate: (place: PromptPlace, action: Delivery) => void
}) {
  const { t } = useI18n()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            disabled={busy}
            aria-label={`${t("prompts.action.more")} · ${t(place.labelKey)}`}
            className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          />
        }
      >
        <EllipsisIcon className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        /* The app's own menu chrome, as the sidebar draws its row menus: the
           surface, the hairline and the row rhythm are one house style, so a
           menu here reads as a menu anywhere else in the app. */
        className="flex w-[200px] flex-col gap-0.5 rounded-md p-1.5 ring-1 ring-border shadow-soft"
      >
        <DropdownMenuItem
          /* A form that cannot reach the file says so where the action is,
             rather than refusing once it has been pressed. */
          disabled={files === null || busy}
          title={files === null ? t("prompts.menu.blocked") : undefined}
          className="h-9 gap-2.5 rounded-sm px-2.5 text-[13px] font-medium"
          onClick={() => onToggle(place)}
        >
          {held ? (
            <MinusIcon className="size-[15px]" aria-hidden />
          ) : (
            <PlusIcon className="size-[15px]" aria-hidden />
          )}
          {t(held ? "prompts.action.remove" : "prompts.action.install")}
          <span className="sr-only">{prompt.description}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <GenerateItems place={place} onGenerate={onGenerate} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * The delete question, anchored to the button it belongs to.
 *
 * The same bubble the skills and plugins lightboxes ask theirs in: a panel
 * beside the button rather than a dialog over the screen, because the question
 * is about the one thing that button is next to.
 *
 * Deleting takes the row out of the library, its pictures with it, and leaves
 * every copy already delivered where it is — which is what the second sentence
 * says before it confirms: a delivered prompt is a file another agent reads,
 * and this button does not reach it.
 */
function DeleteBubble({
  name,
  busy,
  onDelete,
  children,
}: {
  name: string
  busy: boolean
  onDelete: () => void
  children: React.ReactElement
}) {
  const { t } = useI18n()
  const [open, setOpen] = React.useState(false)

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
          {t("prompts.delete.title").replace("{name}", name)}
        </span>
        <span className="text-[12.5px] leading-[17px] text-copy">
          {t("prompts.delete.text")}
        </span>
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            className="h-8 rounded-full border-border bg-transparent px-[14px] text-[12.5px] font-semibold dark:border-input dark:bg-transparent"
            disabled={busy}
            onClick={() => setOpen(false)}
          >
            {t("prompts.add.cancel")}
          </Button>
          {/* Red stays a text and outline colour here: the destructive button is
              outlined, so nothing in the panel is a red block. */}
          <Button
            variant="outline"
            className="h-8 rounded-full border-destructive/35 bg-transparent px-[14px] text-[12.5px] font-semibold text-destructive hover:bg-destructive/5 hover:text-destructive dark:border-destructive/35 dark:bg-transparent"
            disabled={busy}
            onClick={() => {
              setOpen(false)
              onDelete()
            }}
          >
            {t("prompts.delete.confirm")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * The description line, which a double click turns into a field to write one
 * in — the same line the MCP server panel shows its own description in, at the
 * same size and ink.
 *
 * A prompt has no name apart from this: it is what the row is read by, what the
 * catalog searches, and what a delivery names its file after. So it is also the
 * one thing in this panel that is edited in place, and correcting it is a
 * correction to the row rather than a second row.
 *
 * The field starts from what the line shows, so fixing a word is fixing it
 * rather than retyping the sentence.
 */
function DescriptionLine({
  text,
  onWrite,
}: {
  text: string
  onWrite: (description: string) => void
}) {
  const { t } = useI18n()
  const [draft, setDraft] = React.useState<string | null>(null)
  /* Escape unmounts the field, and the removal raises a blur that must not
     commit what the person just threw away. */
  const thrown = React.useRef(false)

  if (draft !== null) {
    return (
      <Textarea
        autoFocus
        value={draft}
        aria-label={t("prompts.detail.description.edit")}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          setDraft(null)
          if (thrown.current) {
            thrown.current = false
            return
          }
          const written = draft.trim()
          /* A prompt with no description is one nothing can name, and the store
             refuses it; leaving the line as it was says so without a refusal. */
          if (written !== "" && written !== text) onWrite(written)
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation()
            thrown.current = true
            setDraft(null)
          }
          /* The dialog's own Escape is the one that closes it, and a click
             elsewhere is what commits, so Enter only newlines. */
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.currentTarget.blur()
          }
        }}
        className="min-h-[62px] text-[12.5px] leading-[1.5]"
      />
    )
  }

  return (
    <p
      onDoubleClick={() => setDraft(text)}
      title={t("prompts.detail.description.edit")}
      className="cursor-text text-[12.5px] leading-[1.5] text-copy"
    >
      {text}
    </p>
  )
}

/** The panel beside the pictures: what the prompt is, and what can be done with it. */
function InfoPanel({
  prompt,
  updated,
  root,
  places,
  installed,
  files,
  busy,
  onToggle,
  onGenerate,
  onDelete,
  onDescribe,
  onTags,
  tagSuggestions,
}: {
  prompt: StoredPrompt
  /** When it last changed, already worded; empty when there is no date. */
  updated: string
  /** Where the library keeps its prompts, as a person reads it; `null` when unknown. */
  root: string | null
  places: readonly PromptPlace[]
  installed: Installed
  files: PlaceFiles | null
  busy: boolean
  onToggle: (place: PromptPlace) => void
  onGenerate: (place: PromptPlace, action: Delivery) => void
  onDelete: () => void
  onDescribe: (description: string) => void
  onTags: (tags: string[]) => void
  /** Every category in use across the library, for the editor's quick picks. */
  tagSuggestions: string[]
}) {
  const { t } = useI18n()
  const [copied, setCopied] = React.useState(false)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* No heading: a prompt's only name is its description, and that belongs
          with the rest of what the row says about itself rather than set apart
          above it. What the strip carries instead is how big it is and when it
          last changed — the two facts that are about the row rather than in it.
          The title stays for a reader that cannot see the panel. */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-5">
        <DialogTitle className="sr-only">{prompt.description}</DialogTitle>
        <span className="truncate text-[12.5px] leading-[1.4] text-muted-foreground">
          {t("prompts.detail.tokens").replace("{tokens}", tokenLabel(prompt.prompt))}
        </span>
        {updated === "" ? null : <span className="text-muted-soft">·</span>}
        {updated === "" ? null : (
          <span className="truncate text-[12.5px] leading-[1.4] text-muted-soft">{updated}</span>
        )}
        <span className="flex-1" />
        <DialogClose
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 rounded-full"
              aria-label={t("prompts.action.close")}
            />
          }
        >
          <XIcon className="size-4 text-copy" />
        </DialogClose>
      </div>

      {/* Everything between the heading and the footer scrolls: a machine-wide
          list of places alone outruns the panel, and the actions have to stay
          put. The bottom padding is what keeps the last line clear of them. */}
      <div className="flex min-h-0 min-w-0 flex-1 scrollbar-gutter-stable flex-col gap-[18px] overflow-y-auto px-5 pt-5 pb-5">
        <DescriptionLine text={prompt.description} onWrite={onDescribe} />

        {/* The categories, edited in place: the same control the other asset
            panels file their records with, so a person who has learned it on
            one screen has learned it on all of them. */}
        <TagEditor
          tags={prompt.tags}
          suggestions={tagSuggestions}
          onChange={onTags}
          words={{
            add: t("prompts.detail.category.add"),
            placeholder: t("prompts.detail.category.placeholder"),
            remove: t("prompts.detail.category.remove"),
          }}
        />

        <PlacesSection
          prompt={prompt}
          root={root}
          places={places}
          installed={installed}
          files={files}
          busy={busy}
          onToggle={onToggle}
          onGenerate={onGenerate}
        />
      </div>

      <div className="flex h-16 shrink-0 items-center gap-2.5 border-t border-border px-5">
        <Button
          variant="outline"
          aria-label={t(copied ? "prompts.action.copied" : "prompts.action.copy")}
          onClick={() => {
            void navigator.clipboard
              ?.writeText(prompt.prompt)
              .then(() => {
                setCopied(true)
                window.setTimeout(() => setCopied(false), COPIED_MS)
              })
              .catch(() => undefined)
          }}
          className="h-10 shrink-0 gap-[7px] rounded-full border-border bg-transparent px-4 text-[13.5px] font-semibold dark:border-input dark:bg-transparent"
        >
          {copied ? (
            <CheckIcon className="size-[15px] text-primary" />
          ) : (
            <CopyIcon className="size-[15px]" />
          )}
          {t("prompts.action.copy")}
        </Button>

        {/* Deleting is another class of action, so it takes the far end of the
            row rather than sitting beside the one that reads the prompt out. */}
        <span className="flex-1" />
        <DeleteBubble name={prompt.description} busy={busy} onDelete={onDelete}>
          <Button
            variant="outline"
            disabled={busy}
            className="h-10 shrink-0 gap-[7px] rounded-full border-destructive/35 bg-transparent px-4 text-[13.5px] font-semibold text-destructive hover:bg-destructive/5 hover:text-destructive dark:border-destructive/35 dark:bg-transparent"
          >
            <Trash2Icon className="size-[15px]" />
            {t("prompts.action.delete")}
          </Button>
        </DeleteBubble>
      </div>
    </div>
  )
}

/**
 * The prompt's own text, read or edited in place.
 *
 * One button says which of the two this is: pressing *Edit* hands the text to
 * the editor, and what was that button becomes the one that keeps the change.
 */
function BodyTab({
  text,
  editing,
  saving,
  onDraft,
  onEdit,
  onSave,
}: {
  /** The text on screen: the draft while editing, the stored one otherwise. */
  text: string
  editing: boolean
  saving: boolean
  onDraft: (text: string) => void
  onEdit: () => void
  onSave: () => void
}) {
  const { t } = useI18n()

  return (
    <CodeCard
      title={GRAMMAR_PATH}
      path={GRAMMAR_PATH}
      className="flex-1"
      trailing={
        <Button
          type="button"
          variant={editing ? "default" : "outline"}
          disabled={saving}
          onClick={editing ? onSave : onEdit}
          className={
            editing
              ? "h-7 rounded-full px-3 text-[12.5px] font-semibold"
              : "h-7 rounded-full border-border bg-transparent px-3 text-[12.5px] font-semibold dark:border-input dark:bg-transparent"
          }
        >
          {t(editing ? "prompts.detail.save" : "prompts.detail.edit")}
        </Button>
      }
    >
      {editing ? (
        <CodeEditor
          text={text}
          onChange={onDraft}
          language="markdown"
          label={t("prompts.detail.body")}
          className="size-full"
        />
      ) : (
        <CodeView text={text} path={GRAMMAR_PATH} />
      )}
    </CodeCard>
  )
}

/**
 * Draw the lightbox.
 *
 * @param prompt — the row it was opened from, or `null` while it is closed.
 * @param updated — when it last changed, already worded.
 * @param root — where the library keeps its prompts, as a person reads it.
 * @param places — every agent place a delivery can go to.
 * @param files — the form's client-file port.
 * @param busy — a delivery is in flight.
 * @param stamp — changes whenever a delivery may have happened elsewhere.
 * @param onOpenChange — closing it.
 * @param onToggle — install into a place, or take it back out of one.
 * @param onGenerate — write one of the three derived forms into a place.
 * @param onDelete — remove the prompt from the library.
 * @param onChanged — the stored row changed; the caller re-reads its page.
 * @param onDescribe — correct the prompt's description.
 * @param onTags — replace the prompt's categories.
 * @param tagSuggestions — every category in use across the library.
 */
export function PromptDetailDialog({
  prompt,
  updated,
  root,
  places,
  files,
  busy,
  stamp,
  onOpenChange,
  onToggle,
  onGenerate,
  onDelete,
  onChanged,
  onDescribe,
  onTags,
  tagSuggestions,
}: {
  prompt: StoredPrompt | null
  updated: string
  /** Where the library keeps its prompts, as a person reads it; `null` when unknown. */
  root: string | null
  places: readonly PromptPlace[]
  files: PlaceFiles | null
  busy: boolean
  stamp: number
  onOpenChange: (open: boolean) => void
  onToggle: (prompt: StoredPrompt, place: PromptPlace) => void
  onGenerate: (prompt: StoredPrompt, place: PromptPlace, action: Delivery) => void
  onDelete: (prompt: StoredPrompt) => void
  onChanged: () => void
  onDescribe: (prompt: StoredPrompt, description: string) => void
  onTags: (prompt: StoredPrompt, tags: string[]) => void
  /** Every category in use across the library, for the editor's quick picks. */
  tagSuggestions: string[]
}) {
  return (
    <Dialog open={prompt !== null} onOpenChange={onOpenChange}>
      {prompt === null ? null : (
        /* Keyed by the row: opening another prompt is another lightbox, down to
           the draft in its editor. */
        <Lightbox
          key={prompt.id}
          prompt={prompt}
          updated={updated}
          root={root}
          places={places}
          files={files}
          busy={busy}
          stamp={stamp}
          onToggle={(place) => onToggle(prompt, place)}
          onGenerate={(place, action) => onGenerate(prompt, place, action)}
          onDelete={() => onDelete(prompt)}
          onChanged={onChanged}
          onDescribe={(description) => onDescribe(prompt, description)}
          onTags={(tags) => onTags(prompt, tags)}
          tagSuggestions={tagSuggestions}
        />
      )}
    </Dialog>
  )
}

function Lightbox({
  prompt,
  updated,
  root,
  places,
  files,
  busy,
  stamp,
  onToggle,
  onGenerate,
  onDelete,
  onChanged,
  onDescribe,
  onTags,
  tagSuggestions,
}: {
  prompt: StoredPrompt
  updated: string
  /** Where the library keeps its prompts, as a person reads it; `null` when unknown. */
  root: string | null
  places: readonly PromptPlace[]
  files: PlaceFiles | null
  busy: boolean
  stamp: number
  onToggle: (place: PromptPlace) => void
  onGenerate: (place: PromptPlace, action: Delivery) => void
  onDelete: () => void
  onChanged: () => void
  onDescribe: (description: string) => void
  onTags: (tags: string[]) => void
  /** Every category in use across the library, for the editor's quick picks. */
  tagSuggestions: string[]
}) {
  const { t } = useI18n()
  const store = usePromptStore()
  const [tab, setTab] = React.useState("pictures")
  /* A delivery made from here changes where the prompt is, so it is counted
     beside the ones the page reports. */
  const [own, setOwn] = React.useState(0)
  /* The edit in hand, kept as `{ id, text }`: the tab it lives on comes and goes
     without taking the draft with it, and no other row's text can end up in an
     editor that is showing this one's. */
  const [draft, setDraft] = React.useState<{ id: string; text: string } | null>(null)
  const [saving, setSaving] = React.useState(false)
  const media = usePromptMedia(prompt, store, onChanged)
  const mediaWords = usePromptMediaWords()
  const installed = useInstalled(prompt, places, files, stamp + own)

  const editing = draft !== null && draft.id === prompt.id
  const text = editing ? (draft?.text ?? prompt.prompt) : prompt.prompt

  const save = async () => {
    if (store === null || !editing) return
    setSaving(true)
    try {
      await store.update(prompt.id, { prompt: text })
      setDraft(null)
      onChanged()
      toast.add({ type: "success", title: t("prompts.detail.saved") })
    } catch (reason) {
      /* The draft stays where it is: a refusal is something to retry, not
         something to lose the edit over. */
      toast.add({
        type: "error",
        title: reason instanceof Error ? reason.message : String(reason),
      })
    } finally {
      setSaving(false)
    }
  }

  /** Run one delivery and make the ticks re-read the files it wrote. */
  const acted = (change: () => void) => {
    change()
    setOwn((current) => current + 1)
  }

  return (
    <DialogSplit
      pane={
        <Tabs value={tab} onValueChange={setTab} className="min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden">
          {/* The same ruled strip the plugins lightbox opens with, so the two
              dialogs read as one screen with different contents. */}
          <div className="flex h-12 shrink-0 items-center border-b border-border px-6">
            <TabsList variant="line" className="h-12! gap-7 p-0">
              {["pictures", "body"].map((value) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="h-12 flex-none rounded-none border-0 px-0 py-0 text-[13.5px] leading-[1.4] font-medium text-muted-foreground after:inset-x-0 after:bottom-0! after:h-0.5 after:bg-primary data-active:font-semibold data-active:text-foreground"
                >
                  {t(`prompts.detail.tab.${value}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="pictures" className="flex min-h-0 flex-1 flex-col">
            {/* The paste listener is document-wide while this is mounted, and
                this tab is the only surface it belongs to. */}
            <MediaPane
              empty={<BodyStage text={prompt.prompt} />}
              source={media}
              words={mediaWords}
              onScreen={tab === "pictures"}
            />
          </TabsContent>

          <TabsContent value="body" className="flex min-h-0 flex-1 flex-col p-5">
            <BodyTab
              text={text}
              editing={editing}
              saving={saving}
              onDraft={(next) => setDraft({ id: prompt.id, text: next })}
              onEdit={() => setDraft({ id: prompt.id, text: prompt.prompt })}
              onSave={() => void save()}
            />
          </TabsContent>
        </Tabs>
      }
      panel={
        <InfoPanel
          prompt={prompt}
          updated={updated}
          root={root}
          places={places}
          installed={installed}
          files={files}
          busy={busy}
          onToggle={(place) => acted(() => onToggle(place))}
          onGenerate={(place, action) => acted(() => onGenerate(place, action))}
          onDelete={onDelete}
          onDescribe={onDescribe}
          onTags={onTags}
          tagSuggestions={tagSuggestions}
        />
      }
    />
  )
}
