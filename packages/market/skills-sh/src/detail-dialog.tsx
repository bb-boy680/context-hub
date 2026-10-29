import {
  ArrowUpRightIcon,
  BadgeCheckIcon,
  CheckIcon,
  DownloadIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"
import * as React from "react"

import { useI18n } from "@context-hub/extensions/react"
import { CodeCard } from "@context-hub/extensions/components"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@context-hub/shadcn-ui/components/dialog"
import { Button } from "@context-hub/shadcn-ui/components/button"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@context-hub/shadcn-ui/components/empty"
import { Separator } from "@context-hub/shadcn-ui/components/separator"
import { Skeleton } from "@context-hub/shadcn-ui/components/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@context-hub/shadcn-ui/components/tabs"
import { Markdown } from "@context-hub/shadcn-ui/components/markdown"
import { toast } from "@context-hub/shadcn-ui/components/toast"
import { fileTreeKey, parseSkillFile, SkillFileTree, outdated } from "@context-hub/skills"

import { isTimeout } from "./apis/http.ts"
import type { MarketAudit, MarketBundle } from "./apis/types.ts"
import { marketSkillUrl } from "./apis/urls.ts"
import { failureText } from "./failure.ts"
import {
  installedRow,
  nameConflict,
  skillFile,
  sparkPoints,
  treeFromFiles,
  type MarketLibrary,
  type MarketRow,
} from "./rows.ts"
import type { SkillMarket } from "./service.ts"

type Loaded<T> = { state: "loading" } | { state: "ready"; value: T }

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** One tab's body is always the same height, so the rail never jumps. */
function LoadingLines({ count }: { count: number }) {
  return (
    <div className="flex flex-col gap-3 pt-1">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-3" style={{ width: `${96 - index * 8}%` }} />
      ))}
    </div>
  )
}

function EmptyPanel({
  icon,
  title,
  href,
  label,
}: {
  icon: React.ReactNode
  title: string
  href?: string
  label?: string
}) {
  return (
    <Empty className="h-full border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
      </EmptyHeader>
      {href === undefined || label === undefined ? null : (
        <Button variant="outline" render={<a href={href} target="_blank" rel="noreferrer" />}>
          {label}
          <ArrowUpRightIcon data-icon="inline-end" />
        </Button>
      )}
    </Empty>
  )
}

/** The detail lightbox: content, preview files, audit, and the summary rail. */
export function MarketDetailDialog({
  row,
  open,
  onOpenChange,
  market,
  library,
  onInstall,
}: {
  row: MarketRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  market: SkillMarket
  library: MarketLibrary
  onInstall: (row: MarketRow) => void
}) {
  const { t, state } = useI18n()
  const [tab, setTab] = React.useState("content")
  const [bundle, setBundle] = React.useState<Loaded<MarketBundle | null>>({ state: "loading" })
  const [summary, setSummary] = React.useState<Loaded<string | null>>({ state: "loading" })
  const [audit, setAudit] = React.useState<Loaded<MarketAudit | null>>(() => {
    if (row === null) return { state: "loading" }
    const cached = market.peekAudit(row.source, row.skillId)
    return cached === undefined ? { state: "loading" } : { state: "ready", value: cached }
  })
  const [file, setFile] = React.useState<string | null>(null)
  const [updating, setUpdating] = React.useState(false)

  React.useEffect(() => {
    if (!open || row === null) return
    let live = true
    const source = row.source
    const skillId = row.skillId
    market
      .download(source, skillId)
      .then((value) => {
        if (!live) return
        setBundle({ state: "ready", value })
        const first = value === null ? undefined : skillFile(value.files)
        setFile(first?.path ?? value?.files[0]?.path ?? null)
      })
      .catch((error: unknown) => {
        if (!live) return
        setBundle({ state: "ready", value: null })
        toast.add({ type: "error", title: failureText(error, t) })
      })
    /* The summary is a bonus: when the page or the parse fails, the dialog
       simply opens without it rather than reporting an error. */
    market
      .summary(source, skillId)
      .then((value) => {
        if (live) setSummary({ state: "ready", value })
      })
      .catch(() => {
        if (live) setSummary({ state: "ready", value: null })
      })
    market
      .audit(source, skillId)
      .then((value) => {
        if (live) setAudit({ state: "ready", value })
      })
      .catch((error: unknown) => {
        if (!live) return
        if (market.peekAudit(source, skillId) !== undefined) {
          toast.add({
            type: "error",
            title: isTimeout(error) ? t("market.state.cached") : failureText(error, t),
          })
          return
        }
        setAudit({ state: "ready", value: null })
        toast.add({ type: "error", title: failureText(error, t) })
      })
    return () => {
      live = false
    }
  }, [open, row, market, t])

  if (row === null) return null

  const installed = installedRow(library.rows, row.source, row.skillId)
  const conflict = installed === undefined && nameConflict(library.rows, row.source, row.skillId)
  const stale = installed !== undefined && outdated(installed)
  const page = marketSkillUrl(row.source, row.skillId, true)
  const points = sparkPoints(row.weeklyInstalls, 260, 48)
  const auditValue = audit.state === "ready" ? audit.value : null
  const passed = auditValue?.audits.filter((entry) => entry.status === "pass").length ?? 0
  const total = auditValue?.audits.length ?? 0

  const primary = () => {
    if (stale && installed !== undefined) {
      setUpdating(true)
      void library
        .update(installed.name)
        .catch((error: unknown) => {
          toast.add({ type: "error", title: messageOf(error) })
        })
        .finally(() => setUpdating(false))
      return
    }
    if (installed === undefined && !conflict) onInstall(row)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[720px] max-h-[calc(100vh-2rem)] w-[1100px] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden rounded-xl bg-dialog p-0 ring-1 ring-border sm:max-w-[1100px]"
      >
        <div className="flex items-start gap-4 px-10 pt-6">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <DialogTitle className="truncate font-mono text-[22px] font-semibold">
              {row.name}
            </DialogTitle>
            {row.isOfficial === true ? (
              <BadgeCheckIcon
                className="size-4 shrink-0 text-muted-foreground"
                aria-label={t("market.detail.official")}
              />
            ) : null}
            <DialogDescription className="sr-only">
              {row.source}/{row.skillId}
            </DialogDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("market.detail.open")}
              render={<a href={page} target="_blank" rel="noreferrer" />}
            >
              <ArrowUpRightIcon />
            </Button>
            <Button
              size="lg"
              disabled={
                updating ||
                (installed !== undefined && !stale) ||
                conflict ||
                library.store === null
              }
              onClick={primary}
            >
              {updating
                ? t("market.state.loading")
                : installed !== undefined
                  ? stale
                    ? t("market.state.update")
                    : t("market.state.installed")
                  : conflict
                    ? t("market.state.conflict")
                    : library.store === null
                      ? t("market.state.noLibrary")
                      : t("market.action.install")}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("market.detail.close")}
              onClick={() => onOpenChange(false)}
            >
              <XIcon />
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
          <TabsList
            variant="line"
            className="mx-10 h-9 w-auto justify-start gap-6 border-b border-border"
          >
            <TabsTrigger value="content" className="flex-none px-0">
              {t("market.detail.content")}
            </TabsTrigger>
            <TabsTrigger value="files" className="flex-none px-0">
              {t("market.detail.files")}
            </TabsTrigger>
            <TabsTrigger value="audit" className="flex-none px-0">
              {t("market.detail.audit")}
            </TabsTrigger>
          </TabsList>

          <div className="flex min-h-0 flex-1 gap-10 px-10 pt-6 pb-6">
            <div className="min-w-0 flex-1 overflow-y-auto">
              <TabsContent value="content" className="m-0">
                <div className="flex max-w-[680px] flex-col gap-6">
                  {summary.state === "loading" ? (
                    <section className="flex flex-col gap-3">
                      <SectionLabel>{t("market.detail.summary")}</SectionLabel>
                      <div className="rounded-lg border border-border bg-muted/40 px-6 py-4">
                        <LoadingLines count={3} />
                      </div>
                    </section>
                  ) : summary.value === null ? null : (
                    <section className="flex flex-col gap-3">
                      <SectionLabel>{t("market.detail.summary")}</SectionLabel>
                      <div className="rounded-lg border border-border bg-muted/40 px-6 py-4">
                        <Markdown className="text-sm leading-6 text-muted-foreground">
                          {summary.value}
                        </Markdown>
                      </div>
                    </section>
                  )}

                  <section className="flex flex-col gap-3">
                    {summary.state === "ready" && summary.value !== null ? (
                      <SectionLabel>SKILL.md</SectionLabel>
                    ) : null}
                    {bundle.state === "loading" ? (
                      <LoadingLines count={8} />
                    ) : bundle.value === null ? (
                      <EmptyPanel
                        icon={<TriangleAlertIcon />}
                        title={t("market.empty.content")}
                        href={page}
                        label={t("market.detail.open")}
                      />
                    ) : (
                      (() => {
                        const found = skillFile(bundle.value.files)
                        if (found === undefined) {
                          return (
                            <EmptyPanel
                              icon={<TriangleAlertIcon />}
                              title={t("market.empty.content")}
                            />
                          )
                        }
                        return (
                          <MarkdownBody
                            text={parseSkillFile(found.contents).body}
                            locale={state.active}
                          />
                        )
                      })()
                    )}
                  </section>
                </div>
              </TabsContent>

              <TabsContent value="files" className="m-0 h-full">
                <FilesPanel
                  bundle={bundle}
                  file={file}
                  setFile={setFile}
                  page={page}
                  t={t}
                />
              </TabsContent>

              <TabsContent value="audit" className="m-0">
                <AuditPanel audit={audit} page={page} t={t} />
              </TabsContent>
            </div>

            <aside className="w-[300px] shrink-0 self-start rounded-xl bg-muted/40 p-4">
              <div className="flex items-center gap-1.5">
                <DownloadIcon className="size-3.5 text-muted-foreground" aria-hidden />
                <span className="font-mono text-2xl font-semibold">
                  {row.installs.toLocaleString(state.active)}
                </span>
              </div>
              {points === null ? null : (
                <svg
                  viewBox="0 0 260 48"
                  className="mt-2 h-12 w-full text-muted-foreground"
                  role="img"
                  aria-label={t("market.column.installs")}
                >
                  <polyline
                    points={points}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              <Separator className="my-4 bg-border" />
              <a
                href={page}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 font-mono text-[12.5px] font-medium text-foreground hover:underline"
              >
                <span className="min-w-0 truncate">{row.source}</span>
                <ArrowUpRightIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
              </a>
              <div className="mt-3 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                <ShieldCheckIcon className="size-3.5 shrink-0" aria-hidden />
                {audit.state === "loading" ? (
                  <Skeleton className="h-3 w-24" />
                ) : auditValue === null ? (
                  <span>{t("market.empty.audit")}</span>
                ) : (
                  <span>
                    {t("market.detail.auditPassed")
                      .replace("{passed}", String(passed))
                      .replace("{total}", String(total))}
                  </span>
                )}
              </div>
            </aside>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

/** A small title over one part of the content tab. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-border pb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </div>
  )
}

function MarkdownBody({ text, locale }: { text: string; locale: string }) {
  return (
    <div className="max-w-[680px] pb-2 text-sm leading-6 text-muted-foreground" lang={locale}>
      <Markdown className="text-sm leading-6 text-muted-foreground">{text}</Markdown>
    </div>
  )
}

function FilesPanel({
  bundle,
  file,
  setFile,
  page,
  t,
}: {
  bundle: Loaded<MarketBundle | null>
  file: string | null
  setFile: (path: string) => void
  page: string
  t: (key: string) => string
}) {
  if (bundle.state === "loading") return <LoadingLines count={7} />
  if (bundle.value === null) {
    return (
      <EmptyPanel
        icon={<TriangleAlertIcon />}
        title={t("market.empty.files")}
        href={page}
        label={t("market.detail.open")}
      />
    )
  }
  const entries = treeFromFiles(bundle.value.files)
  const selected = file ?? entries.find((entry) => !entry.directory)?.path
  const text = bundle.value.files.find((entry) => entry.path === selected)?.contents
  return (
    <div className="flex h-full min-h-0 gap-0">
      <div className="w-[200px] shrink-0 overflow-y-auto border-r border-border pr-3">
        <SkillFileTree
          key={fileTreeKey(entries)}
          files={entries}
          selected={selected ?? ""}
          onSelect={setFile}
        />
      </div>
      {selected === undefined || text === undefined ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {t("market.empty.files")}
        </div>
      ) : (
        <CodeCard
          className="ml-4 min-h-0 flex-1 rounded-lg"
          title={selected}
          path={selected}
          text={text}
          words={{ copy: t("market.detail.copy"), copied: t("market.detail.copied") }}
        />
      )}
    </div>
  )
}

function AuditPanel({
  audit,
  page,
  t,
}: {
  audit: Loaded<MarketAudit | null>
  page: string
  t: (key: string) => string
}) {
  if (audit.state === "loading") return <LoadingLines count={6} />
  if (audit.value === null || audit.value.audits.length === 0) {
    return (
      <EmptyPanel
        icon={<ShieldCheckIcon />}
        title={t("market.empty.audit")}
        href={page}
        label={t("market.detail.open")}
      />
    )
  }
  return (
    <div className="flex flex-col">
      {audit.value.audits.map((entry, index) => (
        <div
          key={`${entry.provider}:${entry.slug}`}
          className={`flex items-center gap-3 py-3 ${index === 0 ? "" : "border-t border-border"}`}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
            {entry.status === "pass" ? (
              <CheckIcon className="size-3.5" aria-hidden />
            ) : (
              <TriangleAlertIcon className="size-3.5" aria-hidden />
            )}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm font-medium">{entry.provider}</span>
            <span className="text-xs text-muted-foreground">{entry.summary}</span>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {entry.status === "pass"
              ? t("market.detail.auditPass")
              : entry.status === "warn"
                ? t("market.detail.auditWarn")
                : entry.status === "fail"
                  ? t("market.detail.auditFail")
                  : entry.status}
          </span>
        </div>
      ))}
    </div>
  )
}
