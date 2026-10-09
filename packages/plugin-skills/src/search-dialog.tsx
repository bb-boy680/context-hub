/**
 * The remote-search dialog: search one registry, install a skill at a time.
 *
 * The registry arrives from a source plugin, so with none enabled the dialog
 * says what is missing rather than listing rows nothing here can fetch. A real
 * install goes through the library's own package path, so what lands is
 * indistinguishable from a skill the Add-skill dialog brought in.
 */
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CompassIcon,
  DownloadIcon,
  ScrollTextIcon,
  SearchIcon,
  SearchXIcon,
  TriangleAlertIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react"
import * as React from "react"

import type { RegistryPage, RemoteSkill, SkillRegistry } from "./registry.ts"
import type { SkillStore } from "./store.ts"
import { tagTone } from "./tags.ts"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"

import { useI18n } from "@workspace/extensions/react"

/** Rows one answer holds; the footer counts and pages by the same number. */
const PAGE_SIZE = 6

/** Typing settles this long before the registry is asked again. */
const SETTLE_MS = 300

/** What a failure reads like when it reaches the dialog. */
function messageOf(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure)
}

/**
 * A row's identity. Different repositories publish skills under the same id —
 * `expo-tailwind-setup` exists in several — so the name alone is not one row.
 */
function rowKey(skill: RemoteSkill): string {
  return `${skill.source ?? skill.package ?? ""}:${skill.name}`
}

/** Rows whose missing detail is read at once; the registry is a shared service. */
const DETAIL_CONCURRENCY = 3

/**
 * Read what the search answer left out, a few rows at a time.
 *
 * @param registry — the registry to ask.
 * @param items — the rows on screen that are missing something.
 * @param onOne — called with each row's key and what came back.
 */
async function fillDetails(
  registry: SkillRegistry,
  items: RemoteSkill[],
  onOne: (key: string, detail: Partial<RemoteSkill>) => void
): Promise<void> {
  const fill = registry.describe?.bind(registry)
  if (fill === undefined) return
  const queue = [...items]
  const workers = Array.from({ length: Math.min(DETAIL_CONCURRENCY, queue.length) }, async () => {
    for (;;) {
      const row = queue.shift()
      if (row === undefined) return
      try {
        onOne(rowKey(row), await fill(row))
      } catch {
        /* A detail that cannot be read leaves the row as the search answer wrote it. */
      }
    }
  })
  await Promise.all(workers)
}

/** One skill this library holds, as its row in the catalog records it. */
interface HeldSkill {
  /** The directory name it took on disk, which is the registry's skill id. */
  id: string
  /** The upstream it was installed from, so a same-named fork is not mistaken for it. */
  source: string
}

/** Whether the library already holds this row: same skill id, from the same source. */
function holds(held: HeldSkill[], skill: RemoteSkill): boolean {
  const name = skill.name.toLowerCase()
  return held.some(
    (item) =>
      item.id.toLowerCase() === name &&
      (skill.package === undefined || item.source.toLowerCase() === skill.package.toLowerCase())
  )
}

/**
 * What the list area shows when it holds no rows: what to do next, or what came
 * back empty. It fills the area, so the dialog keeps one height whatever state
 * it is in.
 */
function ListNotice({
  icon: Icon,
  title,
  hint,
  tone = "quiet",
}: {
  icon: LucideIcon
  title: string
  hint?: string
  /** A refusal reads in the destructive colour; everything else stays muted. */
  tone?: "quiet" | "error"
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-muted">
        <Icon
          className={`size-5 ${tone === "error" ? "text-destructive" : "text-muted-foreground"}`}
        />
      </span>
      <span
        className={`text-[13px] leading-[17px] font-medium ${tone === "error" ? "text-destructive" : ""}`}
      >
        {title}
      </span>
      {hint === undefined ? null : (
        <span className="max-w-[360px] text-xs leading-[17px] text-muted-foreground">
          {hint}
        </span>
      )}
    </div>
  )
}

/** The list area while an answer is on its way: a page's worth of placeholders. */
function LoadingBlock() {
  return (
    <div className="flex flex-1 flex-col" aria-hidden>
      {[0, 1, 2, 3].map((index) => (
        <div
          key={index}
          className="flex h-[68px] shrink-0 items-center gap-3.5 border-b border-border px-6"
        >
          <span className="size-10 shrink-0 animate-pulse rounded-lg bg-muted" />
          <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
            <span className="h-[13px] w-40 animate-pulse rounded bg-muted" />
            <span className="h-[9px] w-3/4 animate-pulse rounded bg-muted" />
          </div>
          <span className="h-[9px] w-20 shrink-0 animate-pulse rounded bg-muted" />
          <span className="h-8 w-[78px] shrink-0 animate-pulse rounded-lg bg-muted" />
        </div>
      ))}
    </div>
  )
}

/** One result: what it is called, where it comes from, and whether this library has it. */
function ResultRow({
  skill,
  source,
  installs,
  installed,
  installing,
  onInstall,
}: {
  skill: RemoteSkill
  /** The registry answering, which the row credits when it names no source. */
  source: string
  /** This skill's install count, already formatted for the active locale. */
  installs: string | null
  installed: boolean
  /** This row's own install is in flight; other rows are untouched by it. */
  installing: boolean
  onInstall: () => void
}) {
  const { t } = useI18n()
  const tone = tagTone()
  /* The row's own provenance: which repository publishes this skill. A registry
     that names no source per row falls back to its own name. */
  const provenance = skill.source ?? skill.package ?? source

  return (
    <li className="flex h-[68px] items-center gap-3.5 border-b border-border px-6">
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${
          skill.tag === undefined
            ? "bg-muted text-muted-foreground"
            : `${tone.chip} ${tone.label}`
        }`}
      >
        <ScrollTextIcon className="size-[18px]" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate font-sans text-sm leading-[17px] font-semibold">
            {skill.name}
          </span>
          <span className="shrink-0 text-xs leading-[15px] text-muted-foreground">
            {t("skills.search.by").replace("{source}", provenance)}
          </span>
        </div>
        <span className="truncate text-xs leading-[15px] text-muted-foreground">
          {skill.description ?? ""}
        </span>
      </div>
      {installs !== null && (
        <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
          {t("skills.search.installs").replace("{value}", installs)}
        </span>
      )}
      {installed ? (
        /* Same metrics as the install button, so the two states line up row to row. */
        <span className="flex h-8 shrink-0 items-center gap-1.5 px-2.5 text-xs font-medium text-muted-foreground">
          <CheckIcon className="size-4 text-chart-2" />
          {t("skills.search.installed")}
        </span>
      ) : (
        <Button
          aria-label={`${t("skills.action.install")} ${skill.name}`}
          aria-busy={installing}
          disabled={installing}
          onClick={onInstall}
          className="h-8 shrink-0 gap-1.5 px-4 text-xs font-medium"
        >
          {installing ? (
            <Spinner className="size-3.5" />
          ) : (
            <DownloadIcon className="size-3.5" />
          )}
          {t("skills.action.install")}
        </Button>
      )}
    </li>
  )
}

/**
 * The remote-search dialog.
 *
 * Closing always clears the search, so the next open starts from the registry's
 * own front page rather than from the last thing somebody typed.
 */
export function SearchSkillsDialog({
  open,
  store,
  registry,
  onOpenChange,
  onInstalled,
}: {
  open: boolean
  /** This form's library; without one a row can only be marked, never fetched. */
  store: SkillStore | null
  /** The registry to search; `null` when no source plugin is enabled. */
  registry: SkillRegistry | null
  onOpenChange: (open: boolean) => void
  /** Called once a skill landed, so the page can read the catalog again. */
  onInstalled: () => void
}) {
  const { t, state } = useI18n()
  const source = registry
  const number = React.useMemo(
    () => new Intl.NumberFormat(state.active),
    [state.active]
  )
  /* Install counts reach the row as numbers; the locale decides how they read. */
  const compact = React.useMemo(
    () =>
      new Intl.NumberFormat(state.active, {
        notation: "compact",
        maximumFractionDigits: 1,
      }),
    [state.active]
  )

  const [query, setQuery] = React.useState("")
  const [page, setPage] = React.useState(0)
  const [found, setFound] = React.useState<RegistryPage | null>(null)
  /** The query `found` answers; while it trails the field, the answer is not in yet. */
  const [answered, setAnswered] = React.useState<string | null>(null)
  /** An answer is on its way; the list shows placeholders while it is. */
  const [busy, setBusy] = React.useState(false)
  /** Rows whose install is in flight, by row key; each one waits on its own. */
  const [pending, setPending] = React.useState<string[]>([])
  const [error, setError] = React.useState<string | null>(null)
  /** Why the last install did not land; the rows it describes stay on screen. */
  const [failure, setFailure] = React.useState<string | null>(null)
  /** What the library holds: its own rows, plus what this visit installed. */
  const [held, setHeld] = React.useState<HeldSkill[]>([])
  /** What a registry filled in per row, by row key; the search answer carries the rest. */
  const [details, setDetails] = React.useState<Record<string, Partial<RemoteSkill>>>({})
  /** Answers a newer search has already replaced. */
  const generation = React.useRef(0)

  /* A registry states its own shortest query; below it there is nothing to ask. */
  const minQuery = source?.minQuery ?? 1
  const asking = source === null || query.trim().length < minQuery

  const runSearch = React.useCallback(
    async (text: string, index: number) => {
      if (source === null) return
      const current = ++generation.current
      setError(null)
      setBusy(true)
      try {
        const answer = await source.search({
          query: text,
          offset: index * PAGE_SIZE,
          limit: PAGE_SIZE,
        })
        if (current !== generation.current) return
        setFound(answer)
        setAnswered(text)
      } catch (failure) {
        if (current !== generation.current) return
        setFound(null)
        setAnswered(null)
        setError(messageOf(failure))
      } finally {
        if (current === generation.current) setBusy(false)
      }
    },
    [source]
  )

  /* Every open, page turn, and settled keystroke asks the registry again. */
  React.useEffect(() => {
    if (!open || asking) return
    const timer = window.setTimeout(
      () => void runSearch(query, page),
      query === "" ? 0 : SETTLE_MS
    )
    return () => window.clearTimeout(timer)
  }, [open, query, page, asking, runSearch])

  /* A registry whose search route carries no description reads it per skill. */
  React.useEffect(() => {
    if (!open || source === null || found === null) return
    let live = true
    void fillDetails(
      source,
      found.items.filter((row) => row.description === undefined),
      (key, detail) => {
        if (live) setDetails((current) => ({ ...current, [key]: detail }))
      }
    )
    return () => {
      live = false
    }
  }, [open, found, source])

  /* Every open re-reads what the library holds, so a row never offers what is already in. */
  React.useEffect(() => {
    if (!open || store === null) return
    let live = true
    void store
      .list({ limit: 1000 })
      .then((answer) => {
        if (!live) return
        setHeld(
          answer.items.map((item) => ({
            id: item.id,
            source: item.upstream?.source ?? "",
          }))
        )
      })
      .catch(() => {
        /* An unreadable library leaves every row installable; the install itself
           still refuses a name the library holds. */
      })
    return () => {
      live = false
    }
  }, [open, store])

  const close = (next: boolean) => {
    if (!next) {
      generation.current += 1
      setQuery("")
      setPage(0)
      setFound(null)
      setAnswered(null)
      setBusy(false)
      setPending([])
      setError(null)
      setFailure(null)
      setHeld([])
      setDetails({})
    }
    onOpenChange(next)
  }

  const install = async (skill: RemoteSkill) => {
    const key = rowKey(skill)
    if (store === null || skill.package === undefined) {
      /* Nothing sits behind a preview row, so the mark is all this form can show. */
      setHeld((current) => [...current, { id: skill.name, source: skill.package ?? "" }])
      return
    }
    setPending((current) => [...current, key])
    setFailure(null)
    try {
      const result = await store.installPackage(skill.package, [skill.name])
      /*
       * The library reports a refusal instead of throwing, because one download
       * can half-fail: a registry row whose repository no longer holds that
       * skill is refused by the CLI, and that reason is the only thing worth
       * showing.
       */
      if (result.installed.length > 0) {
        setHeld((current) => [...current, { id: skill.name, source: skill.package ?? "" }])
        onInstalled()
      }
      if (result.failed.length > 0) {
        setFailure(
          result.failed.map((entry) => `${entry.name}: ${entry.reason}`).join(" · ")
        )
      }
    } catch (thrown) {
      setFailure(messageOf(thrown))
    } finally {
      setPending((current) => current.filter((item) => item !== key))
    }
  }

  const rows = asking ? [] : (found?.items ?? [])
  const total = asking ? undefined : found?.total
  const pages =
    total === undefined ? null : Math.max(1, Math.ceil(total / PAGE_SIZE))
  const first = rows.length === 0 ? 0 : page * PAGE_SIZE + 1
  const last = rows.length === 0 ? 0 : page * PAGE_SIZE + rows.length
  /* A registry that cannot count still knows whether it stopped short of its end. */
  const canNext = found?.hasMore === true || (pages !== null && page + 1 < pages)
  /* Answers trail the field by a keystroke and a debounce; until the answer for
     this exact query lands, the list shows placeholders rather than a verdict. */
  const waiting = busy || answered !== query
  /* What the list and its footer may speak for: nothing while an answer is out. */
  const listed = waiting ? [] : rows
  const count = asking
    ? ""
    : t(total === undefined ? "skills.search.countOpen" : "skills.search.count")
        .replace("{from}", number.format(first))
        .replace("{to}", number.format(last))
        .replace("{total}", number.format(total ?? 0))
  const pageText = t(
    pages === null ? "skills.search.pageOpen" : "skills.search.page"
  )
    .replace("{page}", number.format(page + 1))
    .replace("{pages}", number.format(pages ?? 0))

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 rounded-xl bg-dialog p-0 shadow-soft ring-1 ring-border sm:max-w-[640px]"
      >
        <div className="flex items-start gap-4 px-6 pt-[22px] pb-4">
          <div className="flex flex-col gap-[5px]">
            <DialogTitle className="text-base leading-[19px] font-semibold">
              {t("skills.search.title")}
            </DialogTitle>
            <DialogDescription className="text-sm leading-[17px]">
              {t("skills.search.description")}
            </DialogDescription>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto shrink-0"
            aria-label={t("skills.action.close")}
            onClick={() => close(false)}
          >
            <XIcon className="text-muted-foreground" />
          </Button>
        </div>

        {source === null ? null : (
          <>
            <div className="px-6 pb-3.5">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value)
                    setPage(0)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return
                    setPage(0)
                    void runSearch(query, 0)
                  }}
                  className="h-12 pl-10 focus-visible:border-2 focus-visible:border-primary"
                  placeholder={t("skills.search.field").replace("{source}", source.name)}
                  aria-label={t("skills.search.field").replace("{source}", source.name)}
                />
              </div>
            </div>

            <div className="h-px shrink-0 bg-border" />
          </>
        )}

        {/* The list area keeps one height once there is a query, so paging and
            loading never resize the dialog; before that it stays compact.
            `min-w-0` is required: this is a grid item, and without it the rows'
            own width becomes its minimum and the list pushes out of the dialog. */}
        <div
          className={`flex min-w-0 shrink-0 flex-col ${asking ? "h-[248px]" : "h-[408px]"}`}
          aria-busy={busy}
        >
          {source === null ? (
            <ListNotice
              icon={CompassIcon}
              title={t("skills.search.nosource.title")}
              hint={t("skills.search.nosource.hint")}
            />
          ) : asking ? (
            <ListNotice
              icon={SearchIcon}
              title={t("skills.search.start.title")}
              hint={t("skills.search.start.hint").replace(
                "{count}",
                number.format(minQuery)
              )}
            />
          ) : error !== null ? (
            <ListNotice
              icon={TriangleAlertIcon}
              tone="error"
              title={t("skills.search.failed.title")}
              hint={error}
            />
          ) : waiting ? (
            <LoadingBlock />
          ) : rows.length === 0 ? (
            <ListNotice
              icon={SearchXIcon}
              title={t("skills.search.empty.title")}
              hint={t("skills.search.empty.hint")}
            />
          ) : (
            <ul className="scroll-thin h-full overflow-y-auto">
              {rows.map((skill) => (
                <ResultRow
                  key={rowKey(skill)}
                  skill={{ ...skill, ...details[rowKey(skill)] }}
                  source={source.name}
                  installs={skill.installs === undefined ? null : compact.format(skill.installs)}
                  installed={holds(held, skill)}
                  installing={pending.includes(rowKey(skill))}
                  onInstall={() => void install(skill)}
                />
              ))}
            </ul>
          )}
        </div>

        {failure === null ? null : (
          <p className="shrink-0 px-6 pb-3 text-[12px] leading-[16px] text-destructive">
            {failure}
          </p>
        )}

        <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-t border-border px-6">
          <span className="truncate text-xs text-muted-foreground">
            {listed.length === 0 ? "" : count}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            {listed.length === 0 ? null : (
              <>
                <span className="text-xs text-muted-foreground">{pageText}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={page === 0}
                  aria-label={t("skills.search.previous")}
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                >
                  <ChevronLeftIcon className="text-muted-foreground" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={page + 1 >= (pages ?? Infinity) || !canNext}
                  aria-label={t("skills.search.next")}
                  onClick={() => setPage((current) => current + 1)}
                >
                  <ChevronRightIcon className="text-muted-foreground" />
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              className="h-9 px-4 text-[13px]"
              onClick={() => close(false)}
            >
              {t("skills.action.close")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
