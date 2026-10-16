/**
 * The prompts screen: every prompt this hub keeps, drawn as cards or as a
 * ledger, with the two things a prompt can be sent to.
 *
 * It is the shape the other asset pages have — the same toolbar, the same
 * filter row, the same two views — minus the parts that would have nothing to
 * say here. There is one tab, because a prompt has nowhere to be but in the
 * library: no scope it is enabled at, no source it came from, nothing missing
 * that could be gathered. What it *does* have is a destination: an agent's
 * files, which the row's menu writes, or no file at all, which is the copy
 * beside it.
 */
import {
  CheckIcon,
  CopyIcon,
  FileTextIcon,
  LayoutGridIcon,
  ListIcon,
  PlusIcon,
  SearchXIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react"
import * as React from "react"

import type { PlaceFiles } from "@workspace/core/place-files"
import { FilterBar, Ledger, PageBody, TablePagination, type LedgerColumn } from "@workspace/extensions/components"
import { useI18n } from "@workspace/extensions/react"
import { Button } from "@workspace/ui/components/button"
import { toast } from "@workspace/ui/components/toast"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"

import { AddPromptDialog } from "./add-prompt-dialog.tsx"
import { deliver, delivered, undeliver, type Delivery } from "./deliver.ts"
import { BatchActions, cardActionShell, PromptActions } from "./install-menu.tsx"
import { formatAge, tokenLabel, useInstalled, usePlaceFiles, usePromptLibrary, usePromptPlaces } from "./library.ts"
import { PromptDetailDialog } from "./prompt-detail-dialog.tsx"
import type { PromptPlace } from "./provider.ts"
import type { PromptDraft, PromptPatch, StoredPrompt } from "./store.ts"

/* The canvas spends its one accent on actions, so a category chip is neutral
   and the chip's own geometry carries what it means. */
const CHIP = "inline-flex h-[22px] shrink-0 items-center rounded-full bg-secondary px-[9px] text-[12px] leading-[15px] font-medium text-copy"
const pillSurface =
  "inline-flex h-5 shrink-0 items-center rounded-full bg-card/95 px-[9px] text-[12px] leading-none font-semibold text-foreground ring-1 ring-border"

const viewToggleSurface = "flex h-11 gap-1 rounded-full bg-secondary p-1"

/** The opening of a prompt shown on a card that has no picture. */
const COVER_LINES = 6

/** The ratio every card's cover takes; a prompt has no picture to measure. */
const FALLBACK_RATIO = 16 / 9

/** How long the copy button wears its confirmation before it offers again. */
const COPIED_MS = 3000

/**
 * The first line of a prompt that says anything — what the ledger prints under
 * the description, and the one line a row has room for.
 */
function firstLine(prompt: string): string {
  return prompt.split("\n").find((line) => line.trim() !== "") ?? ""
}

/**
 * What a prompt card shows instead of a screenshot: the prompt's own text.
 *
 * A prompt is its text, so a card that drew anything else would be showing a
 * picture of a thing nobody has. This is the counterpart of the skill card's
 * document cover — that one lists the files a skill ships and how much they
 * weigh, and this one shows the lines and the size, because a prompt has no
 * files to list. What the card says in words is the description, so the cover
 * starts at the prompt's own first line and the two never repeat each other.
 */
function PromptCover({ prompt }: { prompt: StoredPrompt }) {
  const { t } = useI18n()
  const lines = prompt.prompt.split("\n").slice(0, COVER_LINES)
  const more = prompt.prompt.split("\n").length - lines.length
  const size = t("prompts.detail.tokens").replace("{tokens}", tokenLabel(prompt.prompt))

  return (
    <div
      className={`flex size-full flex-col gap-1 overflow-hidden bg-surface-raised px-[18px] pb-3 ${
        prompt.tags.length > 0 ? "pt-10" : "pt-3.5"
      }`}
    >
      {lines.length === 0 ? (
        /* An empty prompt is refused by the form, so this is the moment before
           a row arrives rather than a state a stored one is in. */
        <span className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
          <FileTextIcon className="size-[22px]" aria-hidden />
        </span>
      ) : (
        /* `whitespace-pre` so a prompt's own line breaks and indentation read
           the way they were written. */
        <span className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden font-mono text-[12px] leading-[18px] whitespace-pre text-muted-foreground">
          {lines.map((line, at) => (
            <span key={at} className="truncate">
              {line === "" ? " " : line}
            </span>
          ))}
        </span>
      )}
      <span className="shrink-0 border-t border-border pt-1.5 font-mono text-[12px] leading-[18px] text-muted-foreground">
        {more > 0 ? `${size} · +${more}` : size}
      </span>
    </div>
  )
}

/** A value that follows its input once typing stops, not on every keystroke. */
function useSettled(value: string, delay = 180) {
  const [settled, setSettled] = React.useState(value)

  React.useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])

  return settled
}

function ViewButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      className={`flex h-9 w-11 items-center justify-center rounded-full transition-colors ${
        active
          ? "bg-foreground text-background dark:bg-accent dark:text-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="size-4" />
    </button>
  )
}

function EmptyState({
  icon: Icon,
  title,
  hint,
  note,
  action,
}: {
  icon: LucideIcon
  title: string
  hint: string
  /** A path or an errno, printed as data rather than as a sentence. */
  note?: string | null
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-secondary">
        <Icon className="size-5 text-muted-foreground" aria-hidden />
      </span>
      <span className="text-[15px] leading-[20px] font-semibold">{title}</span>
      <span className="max-w-[420px] text-[13px] leading-[18px] text-muted-foreground">{hint}</span>
      {note === undefined || note === null || note === "" ? null : (
        <span className="max-w-[520px] truncate font-mono text-[12px] text-muted-foreground">{note}</span>
      )}
      {action === undefined ? null : <div className="mt-1 flex items-center gap-2">{action}</div>}
    </div>
  )
}

/**
 * Copy a prompt's text: the one thing a card offers that leaves no file behind.
 *
 * Delivering a prompt puts it where an agent reads it, which is what this module
 * is mostly about — but a prompt is often wanted somewhere else, in a chat box or
 * a colleague's editor, and that case has no place to deliver to. So the text
 * itself is the destination here.
 *
 * The mark says a copy landed and the label never changes: a longer word would
 * push the delivery button sideways every time this one is pressed.
 *
 * A clipboard that is missing or refuses leaves the button offering, with no
 * toast: the mark is the confirmation, and a copy that did not happen simply
 * does not claim to have.
 */
function CopyAction({ text }: { text: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = React.useState(false)

  return (
    <Button
      type="button"
      variant="outline"
      aria-label={t(copied ? "prompts.action.copied" : "prompts.action.copy")}
      onClick={(event) => {
        /* The card underneath opens the prompt on a click, so this one stops. */
        event.stopPropagation()
        void navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), COPIED_MS)
          })
          .catch(() => undefined)
      }}
      className={cardActionShell}
    >
      {copied ? <CheckIcon className="size-3.5 text-primary" /> : <CopyIcon className="size-3.5" />}
      {t("prompts.action.copy")}
    </Button>
  )
}

/** What one prompt carries everywhere it is drawn: age, categories, actions. */
interface CardProps {
  prompt: StoredPrompt
  updated: string
  busy: boolean
  places: readonly PromptPlace[]
  onOpen: () => void
  onToggle: (place: PromptPlace) => void
  onGenerate: (place: PromptPlace, action: Delivery) => void
}

function PromptCard({ prompt, updated, busy, places, onOpen, onToggle, onGenerate }: CardProps) {
  const files = usePlaceFiles()
  const [stamp, setStamp] = React.useState(0)
  const installed = useInstalled(prompt, places, files, stamp)
  const shown = prompt.tags.slice(0, 2)
  const extra = prompt.tags.length - shown.length

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={prompt.description}
      onClick={onOpen}
      onKeyDown={(event) => {
        /* The card holds its own action button, so it cannot be a real button;
           the two keys a button answers to are handled here instead. */
        if (event.key !== "Enter" && event.key !== " ") return
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        onOpen()
      }}
      className="mb-5 cursor-pointer overflow-hidden rounded-xl bg-card ring-1 ring-border transition-shadow break-inside-avoid outline-none hover:shadow-soft focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* One ratio for every prompt card, the same 16:9 the asset pages use:
          a prompt has no picture to measure, and a cover that grew with its
          text would make the grid a different shape on every screen. */}
      <div
        className="relative w-full overflow-hidden bg-surface-raised"
        style={{ aspectRatio: FALLBACK_RATIO }}
      >
        <PromptCover prompt={prompt} />
        {shown.length === 0 ? null : (
          <div className="absolute top-3 left-3 flex items-center gap-1.5">
            {shown.map((tag) => (
              <span key={tag} className={pillSurface}>
                {tag}
              </span>
            ))}
            {extra > 0 ? <span className={`${pillSurface} text-muted-foreground`}>+{extra}</span> : null}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2.5 px-[18px] pt-4 pb-[18px]">
        {/* The description is what the row is read by, and it takes the very
            paragraph a skill card gives its own description: same size, same
            ink, same two-line clamp. It is a sentence rather than a file name,
            so it is set in the body face and not in monospace. */}
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 min-w-0 text-[13px] leading-[18px] text-copy">
            {prompt.description}
          </p>
          {updated === "" ? null : (
            <span className="shrink-0 self-start text-[12px] leading-[15px] text-muted-soft">
              {updated}
            </span>
          )}
        </div>
        {/* The action sits at the row's end on its own: where a prompt has been
            delivered is what the menu's ticks answer, and a line that only
            appears once it has been delivered would put the button in one place
            before and another after. */}
        <div className="flex items-center justify-end gap-2">
          {/* Taking the text itself, which needs no agent to go to, and then
              the delivery — the one the row is read for, so it keeps the end. */}
          <CopyAction text={prompt.prompt} />
          {/* The stamp is raised by whichever delivery this card ran, so the
              menu's ticks re-read the files they are about. */}
          <span onClick={(event) => event.stopPropagation()}>
            <PromptActions
              prompt={prompt}
              places={places}
              installed={installed}
              files={files}
              busy={busy}
              onToggle={(place) => {
                onToggle(place)
                setStamp((current) => current + 1)
              }}
              onGenerate={(place, action) => {
                onGenerate(place, action)
                setStamp((current) => current + 1)
              }}
            />
          </span>
        </div>
      </div>
    </div>
  )
}

export function PromptsPage() {
  const { t, state } = useI18n()
  const library = usePromptLibrary()
  const places = usePromptPlaces()
  const files = usePlaceFiles()

  const [view, setView] = React.useState<"grid" | "list">("grid")
  const [query, setQuery] = React.useState("")
  const [tag, setTag] = React.useState<string>("")
  const [page, setPage] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(12)
  const [checked, setChecked] = React.useState<readonly string[]>([])
  const [addOpen, setAddOpen] = React.useState(false)
  const [detailId, setDetailId] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  /* Raised after a delivery, so the detail dialog re-reads where the prompt is. */
  const [stamp, setStamp] = React.useState(0)

  const needle = useSettled(query).trim().toLowerCase()
  const allTag = t("prompts.filter.all")

  const offered = React.useMemo(
    () =>
      needle === ""
        ? library.rows
        : library.rows.filter(
            (row) =>
              row.description.toLowerCase().includes(needle) ||
              row.prompt.toLowerCase().includes(needle) ||
              row.tags.some((item) => item.toLowerCase().includes(needle))
          ),
    [library.rows, needle]
  )
  const matching = React.useMemo(
    () => (tag === "" ? offered : offered.filter((row) => row.tags.includes(tag))),
    [offered, tag]
  )

  const pageCount = Math.max(1, Math.ceil(matching.length / pageSize))
  const shownPage = Math.min(page, pageCount - 1)
  const rows = React.useMemo(
    () => matching.slice(shownPage * pageSize, (shownPage + 1) * pageSize),
    [matching, shownPage, pageSize]
  )

  const detail = matching.find((row) => row.id === detailId) ?? null

  /* One sentence for every failure: what the port threw is the only thing that
     knows what actually went wrong. */
  const refuse = React.useCallback(
    (failure: unknown) =>
      toast.add({
        type: "error",
        title: failure instanceof Error ? failure.message : String(failure),
      }),
    []
  )

  /** Carry one of the four forms into one place, and say so. */
  const generate = React.useCallback(
    async (prompt: StoredPrompt, place: PromptPlace, action: Delivery) => {
      if (files === null) {
        refuse(new Error(t("prompts.menu.blocked")))
        return
      }
      setBusy(true)
      try {
        await deliver(files, place, prompt, action)
        setStamp((current) => current + 1)
        toast.add({
          type: "success",
          title: t(`prompts.done.${action}`).replace("{agent}", t(place.labelKey)),
        })
      } catch (failure) {
        refuse(failure)
      } finally {
        setBusy(false)
      }
    },
    [files, refuse, t]
  )

  /** Install, or take back what install wrote; the file itself is the answer. */
  const toggle = React.useCallback(
    async (prompt: StoredPrompt, place: PromptPlace) => {
      if (files === null) {
        refuse(new Error(t("prompts.menu.blocked")))
        return
      }
      setBusy(true)
      try {
        if (await delivered(files, place, prompt, "install")) {
          await undeliver(files, place, prompt, "install")
          toast.add({
            type: "success",
            title: t("prompts.done.remove").replace("{agent}", t(place.labelKey)),
          })
        } else {
          await deliver(files, place, prompt, "install")
          toast.add({
            type: "success",
            title: t("prompts.done.install").replace("{agent}", t(place.labelKey)),
          })
        }
        setStamp((current) => current + 1)
      } catch (failure) {
        refuse(failure)
      } finally {
        setBusy(false)
      }
    },
    [files, refuse, t]
  )

  const submit = React.useCallback(
    async (draft: PromptDraft) => {
      setBusy(true)
      try {
        await library.add(draft)
        setAddOpen(false)
      } catch (failure) {
        /* The dialog stays open with the draft in it: a name already taken is
           something to change, not something to lose. */
        refuse(failure)
      } finally {
        setBusy(false)
      }
    },
    [library, refuse]
  )

  /**
   * Change the two things about a prompt that are edited in the panel rather
   * than in the editor: what it is called, and what it has been filed under.
   */
  const describe = React.useCallback(
    async (prompt: StoredPrompt, patch: PromptPatch) => {
      setBusy(true)
      try {
        await library.update(prompt.id, patch)
      } catch (failure) {
        /* The line goes back to what the library holds, and why it would not
           take the new one is said the way every other refusal is. */
        refuse(failure)
      } finally {
        setBusy(false)
      }
    },
    [library, refuse]
  )

  const drop = React.useCallback(
    async (prompt: StoredPrompt) => {
      setBusy(true)
      try {
        await library.remove(prompt)
        setDetailId(null)
        toast.add({
          type: "success",
          title: t("prompts.done.deleted").replace("{name}", prompt.description),
        })
      } catch (failure) {
        refuse(failure)
      } finally {
        setBusy(false)
      }
    },
    [library, refuse, t]
  )

  const cardProps = (prompt: StoredPrompt) => ({
    prompt,
    updated: formatAge(prompt.updatedAt, state.active),
    busy,
    places,
    onOpen: () => setDetailId(prompt.id),
    onToggle: (place: PromptPlace) => void toggle(prompt, place),
    onGenerate: (place: PromptPlace, action: Delivery) => void generate(prompt, place, action),
  })

  const columns: LedgerColumn<StoredPrompt>[] = [
    { key: "select", width: "3.4%" },
    {
      key: "prompt",
      label: t("prompts.column.prompt"),
      width: "31.2%",
      cell: (prompt) => (
        <span className="flex min-w-0 flex-col gap-1">
          {/* The description leads, the prompt's own opening follows: the two
              things a row is looked up by, in the order a person reads them.
              The first line wears what a skill's name wears in this ledger. */}
          <span className="truncate text-[14px] leading-[18px] font-semibold">
            {prompt.description}
          </span>
          <span className="truncate font-mono text-[12px] leading-[16px] text-muted-foreground">
            {firstLine(prompt.prompt)}
          </span>
        </span>
      ),
    },
    {
      key: "tags",
      label: t("prompts.column.tags"),
      width: "24.4%",
      cell: (prompt) => (
        <span className="flex flex-wrap items-center gap-1.5">
          {prompt.tags.slice(0, 3).map((item) => (
            <span key={item} className={CHIP}>
              {item}
            </span>
          ))}
          {prompt.tags.length > 3 ? (
            <span className="text-[12px] text-muted-foreground">+{prompt.tags.length - 3}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: "tokens",
      label: t("prompts.column.body"),
      width: "13.5%",
      cell: (prompt) => (
        <span className="font-mono text-[12.5px] text-muted-foreground">
          {t("prompts.detail.tokens").replace("{tokens}", tokenLabel(prompt.prompt))}
        </span>
      ),
    },
    {
      key: "updated",
      label: t("prompts.column.updated"),
      width: "13%",
      cell: (prompt) => (
        <span className="text-[12.5px] text-muted-foreground">
          {formatAge(prompt.updatedAt, state.active)}
        </span>
      ),
    },
    {
      key: "action",
      label: t("prompts.column.action"),
      width: "14.5%",
      cell: (prompt) => (
        <LedgerAction prompt={prompt} places={places} files={files} busy={busy} onToggle={toggle} onGenerate={generate} />
      ),
    },
  ]

  const pagination = (
    <TablePagination
      pageText={`${shownPage + 1} / ${pageCount}`}
      label={t("pager.rowsPerPage")}
      pageSize={pageSize}
      canPrev={shownPage > 0}
      canNext={shownPage + 1 < pageCount}
      onPageSizeChange={(size) => {
        setPageSize(size)
        setPage(0)
      }}
      onFirst={() => setPage(0)}
      onPrev={() => setPage((current) => Math.max(0, current - 1))}
      onNext={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
      onLast={() => setPage(pageCount - 1)}
    />
  )

  const footer =
    rows.length === 0 ? null : (
      <div className="flex h-9 shrink-0 items-center justify-between gap-4">
        <span className="text-[13px] text-muted-foreground">
          {t("prompts.footer.count")
            .replace("{shown}", String(rows.length))
            .replace("{total}", String(matching.length))}
        </span>
        {pagination}
      </div>
    )

  return (
    <div className="flex flex-1 flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-display font-normal text-foreground">{t("prompts.title")}</h1>
        <p className="text-[length:var(--text-body)] text-muted-foreground">
          {t("prompts.description")}
        </p>
      </div>

      <Tabs value="all" className="flex-1 gap-8">
        <div className="flex items-center justify-between gap-6">
          <TabsList className="h-11! gap-1 rounded-full bg-secondary p-1">
            <TabsTrigger
              value="all"
              className="h-9 flex-none gap-1.5 rounded-full px-4 text-[length:var(--text-body)] text-muted-foreground data-active:bg-foreground data-active:text-background data-active:hover:text-background dark:data-active:bg-accent dark:data-active:text-foreground"
            >
              <FileTextIcon className="size-3.5 shrink-0" aria-hidden />
              {t("prompts.tab.all")}
              <span className={`font-mono text-[13px] ${library.error !== null ? "opacity-45" : ""}`}>
                {library.error === null ? matching.length : "—"}
              </span>
            </TabsTrigger>
          </TabsList>
          <div className="flex shrink-0 items-center gap-2">
            <div className={viewToggleSurface}>
              <ViewButton
                icon={LayoutGridIcon}
                label={t("prompts.view.grid")}
                active={view === "grid"}
                onClick={() => setView("grid")}
              />
              <ViewButton
                icon={ListIcon}
                label={t("prompts.view.list")}
                active={view === "list"}
                onClick={() => setView("list")}
              />
            </div>
            <Button className="h-9 gap-2 rounded-full px-4" onClick={() => setAddOpen(true)}>
              <PlusIcon />
              {t("prompts.action.add")}
            </Button>
          </div>
        </div>

        <FilterBar
          query={query}
          onQuery={(next) => {
            setQuery(next)
            setChecked([])
            setPage(0)
          }}
          tags={library.tags}
          tag={tag === "" ? allTag : tag}
          all={allTag}
          onTag={(next) => {
            setTag(next === allTag ? "" : next)
            setChecked([])
            setPage(0)
          }}
          words={{
            search: t("prompts.filter.placeholder"),
            clear: t("prompts.filter.clear"),
            all: allTag,
          }}
        />

        <TabsContent value="all" className="flex flex-col">
          <PageBody footer={footer}>
            {library.store === null ? (
              /* No library at all is a different answer from an empty one: the
                 rows would have to be invented, and an invented list is worse
                 than saying where the real one lives. */
              <EmptyState
                icon={TriangleAlertIcon}
                title={t("prompts.empty.noLibrary")}
                hint={t("prompts.empty.noLibraryHint")}
              />
            ) : library.error !== null ? (
              /* A read that failed says what failed and leaves the last answer
                 standing: an error is not a reason to lose the list. */
              <EmptyState
                icon={TriangleAlertIcon}
                title={t("prompts.failed.title")}
                hint={t("prompts.failed.hint")}
                note={library.error}
                action={
                  <Button className="h-10 rounded-full px-4" onClick={() => void library.reload()}>
                    {t("prompts.retry")}
                  </Button>
                }
              />
            ) : matching.length === 0 ? (
              needle !== "" || tag !== "" ? (
                <EmptyState
                  icon={SearchXIcon}
                  title={t("prompts.empty.filter")}
                  hint={t("prompts.empty.filterHint").replace("{query}", needle)}
                  action={
                    <Button
                      className="h-10 rounded-full px-4"
                      onClick={() => {
                        setQuery("")
                        setTag("")
                      }}
                    >
                      {t("prompts.filter.reset")}
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={FileTextIcon}
                  title={t("prompts.empty.none")}
                  hint={t("prompts.empty.noneHint")}
                  action={
                    <Button className="h-10 rounded-full px-4" onClick={() => setAddOpen(true)}>
                      <PlusIcon />
                      {t("prompts.action.add")}
                    </Button>
                  }
                />
              )
            ) : view === "grid" ? (
              <div className="@container">
                <div className="columns-1 gap-x-6 @min-[556px]:columns-2 @min-[846px]:columns-3 @min-[1136px]:columns-4 @min-[1426px]:columns-5">
                  {rows.map((prompt) => (
                    <PromptCard key={prompt.id} {...cardProps(prompt)} />
                  ))}
                </div>
              </div>
            ) : (
              <Ledger
                columns={columns}
                rows={rows}
                rowKey={(prompt) => prompt.id}
                checked={checked}
                onCheck={setChecked}
                selectLabel={(prompt) => prompt.description}
                selectAllLabel={t("prompts.column.prompt")}
                batch={{
                  label: t("prompts.batch.selected").replace("{count}", String(checked.length)),
                  clearLabel: t("prompts.batch.clear"),
                  onClear: () => setChecked([]),
                  action: (
                    <BatchActions
                      count={checked.length}
                      places={places}
                      files={files}
                      busy={busy}
                      onDeliver={(place) => {
                        for (const prompt of rows.filter((row) => checked.includes(row.id))) {
                          void generate(prompt, place, "install")
                        }
                      }}
                      onGenerate={(place, action) => {
                        for (const prompt of rows.filter((row) => checked.includes(row.id))) {
                          void generate(prompt, place, action)
                        }
                      }}
                    />
                  ),
                }}
                onOpen={(prompt) => setDetailId(prompt.id)}
              />
            )}
          </PageBody>
        </TabsContent>
      </Tabs>

      <AddPromptDialog
        open={addOpen}
        suggestions={library.tags}
        busy={busy}
        onOpenChange={setAddOpen}
        onSubmit={(draft) => void submit(draft)}
      />

      <PromptDetailDialog
        prompt={detail}
        updated={detail === null ? "" : formatAge(detail.updatedAt, state.active)}
        root={library.root === "" ? null : library.root}
        places={places}
        files={files}
        busy={busy}
        stamp={stamp}
        onOpenChange={(open) => {
          if (!open) setDetailId(null)
        }}
        onToggle={(prompt, place) => void toggle(prompt, place)}
        onGenerate={(prompt, place, action) => void generate(prompt, place, action)}
        onDelete={(prompt) => void drop(prompt)}
        onChanged={() => void library.reload()}
        onDescribe={(prompt, description) => void describe(prompt, { description })}
        onTags={(prompt, tags) => void describe(prompt, { tags })}
        tagSuggestions={library.tags}
      />
    </div>
  )
}

/**
 * One row's action in the ledger. It is the same menu the card ends its body
 * with, and it keeps its own stamp so the ticks re-read the files after a
 * delivery made from here.
 */
function LedgerAction({
  prompt,
  places,
  files,
  busy,
  onToggle,
  onGenerate,
}: {
  prompt: StoredPrompt
  places: readonly PromptPlace[]
  files: PlaceFiles | null
  busy: boolean
  onToggle: (prompt: StoredPrompt, place: PromptPlace) => Promise<void>
  onGenerate: (prompt: StoredPrompt, place: PromptPlace, action: Delivery) => Promise<void>
}) {
  const [stamp, setStamp] = React.useState(0)
  const installed = useInstalled(prompt, places, files, stamp)

  return (
    <span onClick={(event) => event.stopPropagation()}>
      <PromptActions
        prompt={prompt}
        places={places}
        installed={installed}
        files={files}
        busy={busy}
        onToggle={(place) => {
          void onToggle(prompt, place)
          setStamp((current) => current + 1)
        }}
        onGenerate={(place, action) => {
          void onGenerate(prompt, place, action)
          setStamp((current) => current + 1)
        }}
      />
    </span>
  )
}
