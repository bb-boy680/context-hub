/**
 * The plugin market: every registered source merged into one directory,
 * grouped by category, narrowed by the source rail and the search field.
 *
 * The page owns no install logic. A row that is already in the library opens
 * its detail; one that is not opens the install dialog, which asks the plugin
 * library to collect it and then to deliver it.
 */
import {
  EllipsisIcon,
  LoaderCircleIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SearchXIcon,
  StoreIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"
import * as React from "react"

import { useI18n } from "@context-hub/extensions/react"
import { Button } from "@context-hub/shadcn-ui/components/button"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@context-hub/shadcn-ui/components/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@context-hub/shadcn-ui/components/input-group"
import { Skeleton } from "@context-hub/shadcn-ui/components/skeleton"

import { MarketDetailDialog } from "./detail-dialog.tsx"
import { useLibraryRecords, useMarketCatalog, useMarketSources } from "./hooks.ts"
import { MarketMark, useEntryEnrichment } from "./icons.tsx"
import { MarketInstallDialog } from "./install-dialog.tsx"
import {
  groupedRows,
  installedRecord,
  rowsOf,
  visibleRows,
  type MarketRow,
} from "./rows.ts"

/** The directory's columns: at most four, at the width the app reaches on a large screen. */
const DIRECTORY_GRID =
  "grid grid-cols-1 gap-x-8 gap-y-2 min-[1024px]:grid-cols-2 min-[1536px]:grid-cols-3 min-[1920px]:grid-cols-4"

/** The owner's mark beside a source's name, with the market mark as its fallback. */
function SourceMark({ src }: { src: string }) {
  const [broken, setBroken] = React.useState(false)
  if (broken) {
    return <StoreIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      className="size-4 shrink-0 rounded-[4px] object-cover"
      onError={() => setBroken(true)}
    />
  )
}

/** One source in the rail; the same row the Variables page's rail uses. */
function SourceRow({
  label,
  count,
  active,
  failed,
  mark,
  onSelect,
}: {
  label: string
  count: number | null
  active: boolean
  failed?: boolean
  /** The source's own mark; absent on the "all sources" row. */
  mark?: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={`flex h-9 items-center justify-between rounded-md px-2.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
        active ? "bg-secondary font-semibold text-foreground" : "text-copy hover:bg-secondary/60"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        {mark === undefined ? (
          <StoreIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <SourceMark src={mark} />
        )}
        {failed === true ? (
          <TriangleAlertIcon className="size-3.5 shrink-0 text-destructive" aria-hidden />
        ) : null}
        <span className="truncate">{label}</span>
      </span>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
        {count === null ? "—" : count.toLocaleString()}
      </span>
    </button>
  )
}

/** One row in the directory. */
function EntryRow({
  row,
  installed,
  onOpen,
  onInstall,
}: {
  row: MarketRow
  installed: boolean
  onOpen: () => void
  onInstall: () => void
}) {
  const { t } = useI18n()
  const { value, observe } = useEntryEnrichment(row)
  const description = row.entry.description ?? value?.description ?? t("market.plugins.noDescription")

  return (
    <div className="-mx-1.5 flex items-center gap-2 rounded-lg px-1.5 py-2.5 transition-colors hover:bg-secondary/40">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MarketMark row={row} enrichment={value} observe={observe} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate font-mono text-sm font-medium text-foreground">
              {row.entry.name}
            </span>
            <span className="shrink-0 text-[11.5px] text-muted-foreground">
              {row.source.name}
            </span>
          </span>
          <span className="block truncate text-[13px] text-muted-foreground">{description}</span>
        </span>
      </button>
      {installed ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${t("market.plugins.action.open")} ${row.entry.name}`}
          onClick={onOpen}
        >
          <EllipsisIcon aria-hidden />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${t("market.plugins.action.install")} ${row.entry.name}`}
          onClick={onInstall}
        >
          <PlusIcon aria-hidden />
        </Button>
      )}
    </div>
  )
}

/** Rows while a source is still being read. */
function LoadingRows() {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircleIcon className="size-4 animate-spin" aria-hidden />
        {t("market.plugins.status.loading")}
      </div>
      <Skeleton className="h-5 w-36" />
      <div className="grid grid-cols-1 gap-x-10 gap-y-1 xl:grid-cols-2">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 py-2">
            <Skeleton className="size-10 shrink-0 rounded-[10px]" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** The plugin market, at the width the app gives a page. */
export function PluginsMarketPage() {
  const { t } = useI18n()
  const sources = useMarketSources()
  const { reads, refresh, busy } = useMarketCatalog(sources)
  const { records, reread } = useLibraryRecords()
  const [query, setQuery] = React.useState("")
  const [chosen, setChosen] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<MarketRow | null>(null)
  const [installing, setInstalling] = React.useState<MarketRow | null>(null)

  const active = sources.some((source) => source.id === chosen) ? chosen : null
  const all = React.useMemo(() => rowsOf(reads), [reads])
  const shown = React.useMemo(() => visibleRows(all, active, query), [all, active, query])
  const searching = query.trim() !== ""
  const groups = React.useMemo(
    () => groupedRows(shown, (id) => t(`market.plugins.category.${id}`)),
    [shown, t]
  )
  const failed = reads.filter((read) => read.status === "failed")
  const loading = reads.length > 0 && reads.every((read) => read.status === "loading")

  const closeDetail = (open: boolean) => {
    if (!open) setSelected(null)
  }
  const closeInstall = (open: boolean) => {
    if (!open) {
      setInstalling(null)
      /* A successful install writes the library; reading it again is what
         turns the row's plus into its details action. */
      reread()
    }
  }

  const title = (
    <h1 className="text-display font-normal text-foreground">
      {t("market.plugins.title")}
      <span className="ml-2.5 align-baseline font-mono text-2xl text-muted-foreground">
        {all.length.toLocaleString()}
      </span>
    </h1>
  )

  if (sources.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {title}
        <Empty className="min-h-[420px] border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchXIcon />
            </EmptyMedia>
            <EmptyTitle>{t("market.plugins.noSources")}</EmptyTitle>
          </EmptyHeader>
          <Button variant="outline" render={<a href="/extensions" />}>
            {t("market.plugins.openExtensions")}
          </Button>
        </Empty>
      </div>
    )
  }

  const directory = () => {
    if (loading) return <LoadingRows />

    if (shown.length === 0) {
      return (
        <Empty className="min-h-[360px] border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchXIcon />
            </EmptyMedia>
            <EmptyTitle>
              {searching
                ? t("market.plugins.empty.search").replace("{query}", query.trim())
                : t("market.plugins.empty.none")}
            </EmptyTitle>
          </EmptyHeader>
          {searching ? (
            <Button variant="ghost" onClick={() => setQuery("")}>
              {t("market.plugins.action.clear")}
            </Button>
          ) : null}
        </Empty>
      )
    }

    const row = (item: MarketRow) => (
      <EntryRow
        key={item.entry.id}
        row={item}
        installed={installedRecord(records, item.entry) !== undefined}
        onOpen={() => setSelected(item)}
        onInstall={() => setInstalling(item)}
      />
    )

    /* A query is a list of matches, not a directory: the category headings
       would only scatter the rows the person is looking for. */
    if (searching) {
      return <div className={DIRECTORY_GRID}>{shown.map(row)}</div>
    }

    return (
      <div className="flex flex-col gap-10">
        {groups.map((group) => (
          <section key={group.id} aria-label={group.label}>
            <h2 className="mb-2 text-lg font-medium text-foreground">{group.label}</h2>
            <div className={DIRECTORY_GRID}>{group.rows.map(row)}</div>
          </section>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        {title}
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("market.plugins.refresh")}
          disabled={busy}
          onClick={refresh}
        >
          <RefreshCwIcon className={busy ? "animate-spin" : undefined} aria-hidden />
        </Button>
      </div>

      <InputGroup className="h-10 w-full max-w-[520px]">
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          value={query}
          placeholder={t("market.plugins.search")}
          aria-label={t("market.plugins.search")}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query === "" ? null : (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              aria-label={t("market.plugins.action.clear")}
              onClick={() => setQuery("")}
            >
              <XIcon />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[272px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3">
          <div className="flex items-center justify-between px-2.5 pt-1 pb-2 text-[10.5px] font-semibold tracking-[0.05em] text-muted-foreground">
            <span>{t("market.plugins.sources")}</span>
            <span>{sources.length}</span>
          </div>
          <SourceRow
            label={t("market.plugins.allSources")}
            count={all.length}
            active={active === null}
            onSelect={() => setChosen(null)}
          />
          {reads.map((read) => (
            <SourceRow
              key={read.source.id}
              label={read.source.name}
              count={read.status === "ready" ? read.entries.length : null}
              active={active === read.source.id}
              failed={read.status === "failed"}
              mark={read.source.mark}
              onSelect={() => setChosen(read.source.id)}
            />
          ))}
        </aside>

        <section className="flex min-w-0 flex-col gap-4">
          {failed.map((read) => (
            <div
              key={read.source.id}
              className="flex items-start justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm"
            >
              <div className="flex min-w-0 items-start gap-2 text-destructive">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  {t("market.plugins.status.failed").replace("{source}", read.source.name)}
                </span>
              </div>
              <Button
                variant="link"
                size="sm"
                className="h-auto shrink-0 p-0 text-xs"
                onClick={refresh}
              >
                {t("market.plugins.action.retry")}
              </Button>
            </div>
          ))}
          {directory()}
        </section>
      </div>

      {selected === null ? null : (
        <MarketDetailDialog
          row={selected}
          open
          onOpenChange={closeDetail}
          installed={installedRecord(records, selected.entry)}
          /* The install dialog stacks over the detail, so closing it — or a
             failed install — leaves the person where they were. */
          onInstall={setInstalling}
        />
      )}
      {installing === null ? null : (
        <MarketInstallDialog
          row={installing}
          open
          onOpenChange={closeInstall}
          records={records}
        />
      )}
    </div>
  )
}
