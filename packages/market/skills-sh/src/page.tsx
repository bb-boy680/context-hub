import {
  ArrowUpRightIcon,
  BadgeCheckIcon,
  CheckIcon,
  SearchIcon,
  SearchXIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"
import * as React from "react"

import { useHub, useI18n } from "@context-hub/extensions/react"
import {
  useReadablePlaces,
  useSkillLibrary,
  outdated,
} from "@context-hub/skills"
import { Button } from "@context-hub/shadcn-ui/components/button"
import { Card } from "@context-hub/shadcn-ui/components/card"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@context-hub/shadcn-ui/components/table"
import { Tabs, TabsList, TabsTrigger } from "@context-hub/shadcn-ui/components/tabs"
import { toast } from "@context-hub/shadcn-ui/components/toast"

import { isTimeout } from "./apis/http.ts"
import type { MarketRankPage, MarketSearchPage, MarketView } from "./apis/types.ts"
import { MARKET_SITE } from "./apis/urls.ts"
import { MarketDetailDialog } from "./detail-dialog.tsx"
import { failureText } from "./failure.ts"
import { MarketInstallDialog } from "./install-dialog.tsx"
import {
  installedRow,
  nameConflict,
  refreshedRank,
  rowOfRank,
  rowOfSearch,
  type MarketLibrary,
  type MarketRow,
} from "./rows.ts"
import type { SkillMarket } from "./service.ts"

type Status = "loading" | "ready" | "failed"

/** Rows revealed at a time; the API's own page is 200. */
const PAGE_SIZE = 20

const VIEWS: readonly { value: MarketView; key: string }[] = [
  { value: "all-time", key: "market.view.allTime" },
  { value: "trending", key: "market.view.trending" },
  { value: "hot", key: "market.view.hot" },
]

/** Wait until typing stops before asking the API. */
function useSettled(value: string, delay = 300): string {
  const [settled, setSettled] = React.useState(value)
  React.useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return settled
}


/** The skills.sh source page, at the width the app gives a page. */
export function SkillsMarketPage() {
  const ctx = useHub()
  const { t, state } = useI18n()
  const places = useReadablePlaces()
  const library: MarketLibrary = useSkillLibrary(places)
  /* ctx.get() returns a fresh proxy on every call; the effects key on it. */
  const market = React.useMemo(() => ctx.get("market.skills-sh") ?? null, [ctx])

  const [view, setView] = React.useState<MarketView>("all-time")
  const [query, setQuery] = React.useState("")
  const [rank, setRank] = React.useState<MarketRankPage | null>(null)
  const [search, setSearch] = React.useState<MarketSearchPage | null>(null)
  const [status, setStatus] = React.useState<Status>("loading")
  const [visible, setVisible] = React.useState(PAGE_SIZE)
  const [loadingMore, setLoadingMore] = React.useState(false)
  const loadingMoreRef = React.useRef(false)
  const [attempt, setAttempt] = React.useState(0)
  const [selected, setSelected] = React.useState<MarketRow | null>(null)
  const [installTarget, setInstallTarget] = React.useState<MarketRow | null>(null)

  const needle = useSettled(query)
  const searchMode = query.trim() !== ""
  const canSearch = needle.trim().length >= 2
  const cachedRank = market?.peekRank(view) ?? null
  const activeRank = rank !== null && rank.view === view ? rank : cachedRank

  React.useEffect(() => {
    let live = true
    if (searchMode || market === null || !market.available) return
    Promise.resolve()
      .then(() => {
        if (!live) return
        setStatus("loading")
        return market.rank(view, 0)
      })
      .then((page: MarketRankPage) => {
        if (!live || page === undefined) return
        setRank((current) => refreshedRank(current, page))
        setStatus("ready")
      })
      .catch((error: unknown) => {
        if (!live) return
        if ((market?.peekRank(view) ?? null) !== null) {
          setStatus("ready")
          toast.add({
            type: "error",
            title: isTimeout(error) ? t("market.state.cached") : failureText(error, t),
          })
          return
        }
        setStatus("failed")
        toast.add({ type: "error", title: failureText(error, t) })
      })
    return () => {
      live = false
    }
  }, [market, view, searchMode, attempt, t])

  React.useEffect(() => {
    let live = true
    if (!searchMode || !canSearch || market === null || !market.available) return
    Promise.resolve()
      .then(() => {
        if (!live) return
        setStatus("loading")
        return market.search(needle)
      })
      .then((page) => {
        if (!live || page === undefined) return
        setSearch(page)
        setVisible(PAGE_SIZE)
        setStatus("ready")
      })
      .catch((error: unknown) => {
        if (!live) return
        setStatus("failed")
        toast.add({ type: "error", title: failureText(error, t) })
      })
    return () => {
      live = false
    }
  }, [market, needle, canSearch, searchMode, attempt, t])

  const count = activeRank?.total ?? 0
  const activeSearch = canSearch ? search : null
  const searchRows = activeSearch?.rows ?? []
  const rankRows = activeRank?.rows ?? []
  const rows: MarketRow[] = searchMode
    ? searchRows.slice(0, visible).map(rowOfSearch)
    : rankRows.slice(0, visible).map(rowOfRank)
  const canLoadMore = searchMode
    ? visible < searchRows.length
    : activeRank !== null && (visible < activeRank.rows.length || activeRank.hasMore)

  const loadMore = () => {
    if (searchMode) {
      setVisible((value) => Math.min(value + PAGE_SIZE, searchRows.length))
      return
    }
    if (market === null || activeRank === null || loadingMoreRef.current) return
    if (visible < activeRank.rows.length) {
      setVisible((value) => Math.min(value + PAGE_SIZE, activeRank.rows.length))
      return
    }
    if (!activeRank.hasMore) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    market
      .rank(view, activeRank.page + 1)
      .then((next: MarketRankPage) => {
        if (next.rows.length === 0) {
          setRank((current) =>
            current === null || current.view !== view
              ? current
              : { ...current, hasMore: false }
          )
          return
        }
        setRank((current) => {
          const base = current !== null && current.view === view ? current : activeRank
          return next.page > base.page
            ? { ...next, rows: [...base.rows, ...next.rows] }
            : { ...base, hasMore: false }
        })
        setVisible((value) => value + PAGE_SIZE)
      })
      .catch((error: unknown) => {
        toast.add({ type: "error", title: failureText(error, t) })
      })
      .finally(() => {
        loadingMoreRef.current = false
        setLoadingMore(false)
      })
  }

  const emptyState = searchMode ? (
    canSearch ? (
      status === "loading" && search === null ? null : (
        <Empty className="min-h-[420px] border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchXIcon />
            </EmptyMedia>
            <EmptyTitle>
              {t("market.empty.search").replace("{query}", query.trim())}
            </EmptyTitle>
          </EmptyHeader>
          <Button variant="ghost" onClick={() => setQuery("")}>
            {t("market.action.clear")}
          </Button>
        </Empty>
      )
    ) : (
      <Empty className="min-h-[420px] border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchIcon />
          </EmptyMedia>
          <EmptyTitle>{t("market.search.short")}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  ) : (
    <Empty className="min-h-[420px] border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchXIcon />
        </EmptyMedia>
        <EmptyTitle>{t("market.empty.rank")}</EmptyTitle>
      </EmptyHeader>
    </Empty>
  )

  const content = () => {
    if (market === null || !market.available) {
      return (
        <Empty className="min-h-[420px] border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TriangleAlertIcon />
            </EmptyMedia>
            <EmptyTitle>{t("market.state.noNetwork")}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )
    }
    if (searchMode && !canSearch) return emptyState
    const loading = searchMode
      ? status === "loading" && search === null && canSearch
      : activeRank === null && status !== "failed"
    if (loading) return <LoadingTable showRank={!searchMode} />
    if (status === "failed" && (searchMode ? search === null : activeRank === null)) {
      return (
        <Empty className="min-h-[420px] border-0">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TriangleAlertIcon />
            </EmptyMedia>
            <EmptyTitle>{t("market.state.failed")}</EmptyTitle>
          </EmptyHeader>
          <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>
            {t("market.action.retry")}
          </Button>
        </Empty>
      )
    }
    if (rows.length === 0) return emptyState
    return (
      <Card className="gap-0 overflow-hidden rounded-xl bg-card py-0 ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {searchMode ? null : (
                <TableHead className="h-11 w-10 pl-5 text-xs font-medium text-muted-foreground">
                  #
                </TableHead>
              )}
              <TableHead className={`h-11 text-xs font-medium text-muted-foreground ${searchMode ? "pl-5" : "pl-0"}`}>
                {t("market.column.name")}
              </TableHead>
              <TableHead className="h-11 w-28 pr-5 text-right text-xs font-medium text-muted-foreground">
                {t("market.column.installs")}
              </TableHead>
              <TableHead className="h-11 w-24 pr-5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <MarketTableRow
                key={`${row.source}/${row.skillId}`}
                row={row}
                index={index}
                showRank={!searchMode}
                library={library}
                onOpen={setSelected}
                onInstall={setInstallTarget}
              />
            ))}
          </TableBody>
        </Table>
        <div className="flex h-[52px] items-center justify-between border-t border-border px-5">
          <span className="font-mono text-[12px] text-muted-foreground">
            {searchMode
              ? t("market.count.loaded")
                  .replace("{shown}", String(Math.min(visible, searchRows.length)))
                  .replace("{total}", String(searchRows.length))
              : t("market.count.loaded")
                  .replace("{shown}", String(Math.min(visible, rankRows.length)))
                  .replace("{total}", count.toLocaleString(state.active))}
          </span>
          <div className="flex items-center gap-3">
            {searchMode ? (
              <a
                href={MARKET_SITE}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {t("market.search.openAll")}
                <ArrowUpRightIcon className="size-3" aria-hidden />
              </a>
            ) : null}
            {canLoadMore ? (
              <Button variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>
                {loadingMore ? t("market.state.loading") : t("market.action.loadMore")}
              </Button>
            ) : null}
          </div>
        </div>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-display font-normal text-foreground">{t("market.title")}</h1>
        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {activeRank === null ? null : (
            <>
              <span className="font-mono text-[13px]">{count.toLocaleString(state.active)}</span>
              <span aria-hidden>·</span>
            </>
          )}
          <a
            href={MARKET_SITE}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            skills.sh
            <ArrowUpRightIcon className="size-3" aria-hidden />
          </a>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <InputGroup className="h-9 w-[340px]">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            placeholder={t("market.search.placeholder")}
            aria-label={t("market.search.placeholder")}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query === "" ? null : (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label={t("market.action.clear")}
                onClick={() => setQuery("")}
              >
                <XIcon />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>

        <div className="ml-auto">
          {searchMode ? (
            activeSearch === null ? null : (
              <span className="text-xs text-muted-foreground">
                {t("market.count.results").replace("{count}", String(searchRows.length))}
              </span>
            )
          ) : (
            <Tabs
              value={view}
              onValueChange={(value) => {
                setVisible(PAGE_SIZE)
                setView(value as MarketView)
              }}
            >
              <TabsList className="h-11! min-w-0 max-w-full gap-1 overflow-x-auto rounded-full bg-secondary p-1">
                {VIEWS.map((item) => (
                  <TabsTrigger
                    key={item.value}
                    value={item.value}
                    className="h-9 flex-none gap-1.5 rounded-full px-4 text-[length:var(--text-body)] text-muted-foreground data-active:bg-foreground data-active:text-background data-active:hover:text-background dark:data-active:bg-accent dark:data-active:text-foreground"
                  >
                    {t(item.key)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
        </div>
      </div>

      {content()}

      {market === null ? null : (
        <>
          {selected === null ? null : (
            <MarketDetailDialog
              row={selected}
              open
              onOpenChange={(open) => {
                if (!open) setSelected(null)
              }}
              market={market as SkillMarket}
              library={library}
              onInstall={setInstallTarget}
            />
          )}
          {installTarget === null ? null : (
            <MarketInstallDialog
              row={installTarget}
              open
              onOpenChange={(open) => {
                if (!open) setInstallTarget(null)
              }}
              library={library}
              places={places}
            />
          )}
        </>
      )}
    </div>
  )
}

function MarketTableRow({
  row,
  index,
  showRank,
  library,
  onOpen,
  onInstall,
}: {
  row: MarketRow
  index: number
  showRank: boolean
  library: MarketLibrary
  onOpen: (row: MarketRow) => void
  onInstall: (row: MarketRow) => void
}) {
  const { t, state } = useI18n()
  const installed = installedRow(library.rows, row.source, row.skillId)
  const stale = installed !== undefined && outdated(installed)
  const conflict = installed === undefined && nameConflict(library.rows, row.source, row.skillId)

  return (
    <TableRow
      className="h-[54px] cursor-pointer [contain-intrinsic-size:54px] [content-visibility:auto] hover:bg-muted/40"
      onClick={() => onOpen(row)}
    >
      {showRank ? (
        <TableCell className="w-10 pl-5 font-mono text-[13px] text-muted-foreground">
          {index + 1}
        </TableCell>
      ) : null}
      <TableCell className={showRank ? "pl-0" : "pl-5"}>
        <button
          type="button"
          onClick={() => onOpen(row)}
          className="flex min-w-0 max-w-full flex-col items-start gap-0.5 text-left"
        >
          <span className="flex max-w-full items-center gap-1.5">
            <span className="truncate font-mono text-sm font-medium text-foreground">
              {row.name}
            </span>
            {row.isOfficial === true ? (
              <BadgeCheckIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label={t("market.detail.official")} />
            ) : null}
          </span>
          <span className="max-w-full truncate font-mono text-[11.5px] text-muted-foreground">
            {row.source}
          </span>
        </button>
      </TableCell>
      <TableCell className="w-28 pr-5 text-right font-mono text-[13px] text-muted-foreground">
        {row.installs.toLocaleString(state.active)}
      </TableCell>
      <TableCell
        className="w-24 pr-5 text-right"
        onClick={(event) => event.stopPropagation()}
      >
        {installed !== undefined ? (
          stale ? (
            <Button
              variant="outline"
              className="h-8 w-[76px] px-0"
              onClick={() => void library.update(installed.name)}
            >
              {t("market.state.update")}
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <CheckIcon className="size-3.5" aria-hidden />
              {t("market.state.installed")}
            </span>
          )
        ) : conflict ? (
          <span className="text-xs text-muted-foreground">{t("market.state.conflict")}</span>
        ) : (
          <Button
            variant="outline"
            className="h-8 w-[76px] px-0"
            disabled={library.store === null}
            onClick={() => onInstall(row)}
          >
            {t("market.action.install")}
          </Button>
        )}
      </TableCell>
    </TableRow>
  )
}

function LoadingTable({ showRank }: { showRank: boolean }) {
  const { t } = useI18n()
  return (
    <Card className="gap-0 overflow-hidden rounded-xl bg-card py-0 ring-1 ring-foreground/10">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {showRank ? (
              <TableHead className="h-11 w-10 pl-5 text-xs font-medium text-muted-foreground">
                #
              </TableHead>
            ) : null}
            <TableHead className={`h-11 text-xs font-medium text-muted-foreground ${showRank ? "pl-0" : "pl-5"}`}>
              {t("market.column.name")}
            </TableHead>
            <TableHead className="h-11 w-28 pr-5 text-right text-xs font-medium text-muted-foreground">
              {t("market.column.installs")}
            </TableHead>
            <TableHead className="h-11 w-24 pr-5" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 10 }, (_, index) => (
            <TableRow key={index} className="h-[54px] hover:bg-transparent">
              {showRank ? (
                <TableCell className="w-10 pl-5">
                  <Skeleton className="size-3 rounded-full" />
                </TableCell>
              ) : null}
              <TableCell className={showRank ? "pl-0" : "pl-5"}>
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-2.5 w-44" />
                  <Skeleton className="h-2 w-28 bg-muted/60" />
                </div>
              </TableCell>
              <TableCell className="w-28 pr-5">
                <div className="flex justify-end">
                  <Skeleton className="h-2.5 w-16" />
                </div>
              </TableCell>
              <TableCell className="w-24 pr-5">
                <div className="flex justify-end">
                  <Skeleton className="h-8 w-[76px] rounded-lg" />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex h-[52px] items-center border-t border-border px-5">
        <Skeleton className="h-2.5 w-16" />
      </div>
    </Card>
  )
}
