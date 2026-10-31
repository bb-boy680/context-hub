/**
 * One market entry: what it says about itself, where it comes from, and the
 * one action that matters — install it, or say it is already here.
 */
import {
  ExternalLinkIcon,
  LoaderCircleIcon,
  SparklesIcon,
  SquareSlashIcon,
  TriangleAlertIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react"
import * as React from "react"

import { useI18n } from "@context-hub/extensions/react"
import type { PackContentItem, PluginRecord } from "@context-hub/plugins"
import { Button } from "@context-hub/shadcn-ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogTitle,
} from "@context-hub/shadcn-ui/components/dialog"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@context-hub/shadcn-ui/components/item"
import { Markdown } from "@context-hub/shadcn-ui/components/markdown"
import { Separator } from "@context-hub/shadcn-ui/components/separator"
import { Skeleton } from "@context-hub/shadcn-ui/components/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@context-hub/shadcn-ui/components/tabs"

import { CodeCard, DialogSplit } from "@context-hub/extensions/components"
import { previewMarketEntry, type MarketPreview } from "./apis/library.ts"
import { normalizeCategory } from "./contract.ts"
import {
  enrichmentOf,
  MarketMark,
  readEnrichment,
  type Enriched,
} from "./icons.tsx"
import {
  installCommit,
  installPath,
  offeredTabs,
  repoLabel,
  type DetailTab,
  type MarketRow,
} from "./rows.ts"

/** The page a person can open to read more. */
function homeOf(row: MarketRow): string {
  if (row.entry.homepage !== undefined) return row.entry.homepage
  const path = installPath(row)
  return path === undefined
    ? row.entry.install.url
    : `${row.entry.install.url}/tree/main/${path}`
}

/** One `label over value` line in the source block, as the narrow panel stacks them. */
function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] leading-[14px] text-muted-foreground">{label}</dt>
      <dd className="font-mono text-[11.5px] leading-[15px] break-all text-foreground">{value}</dd>
    </div>
  )
}

/** One small heading over a block, the way the design writes them. */
function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  )
}

/**
 * A section's label in the content pane, drawn as the skills market draws
 * "摘要" and "SKILL.md": the word, and a hairline under it that lets the body
 * below read as its own block.
 */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-border pb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </div>
  )
}

/**
 * One scanned tab's list, drawn the way a collected pack's own detail draws it:
 * a card per thing the pack ships, with the mark of the kind of thing it is.
 *
 * These files belong to the pack, so a row is a line of reading, not a field.
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
        <Item key={`${String(at)}:${item.title}`} variant="outline" className="bg-card">
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

/** The pack's own files, as the dialog holds the read that found them. */
type Preview =
  | { state: "loading" }
  | { state: "ready"; value: MarketPreview }
  | { state: "failed" }

/**
 * The detail of one entry.
 *
 * @param installed — the library record that is this entry, when the library holds it.
 * @param onInstall — opens the install dialog over this one.
 */
export function MarketDetailDialog({
  row,
  open,
  onOpenChange,
  installed,
  onInstall,
}: {
  row: MarketRow
  open: boolean
  onOpenChange: (open: boolean) => void
  installed: PluginRecord | undefined
  onInstall: (row: MarketRow) => void
}) {
  const { t } = useI18n()
  const [enriched, setEnriched] = React.useState<Enriched | undefined>(() =>
    enrichmentOf(row.entry.id)
  )

  /* A Codex row carries no sentence in its index; the manifest read for the
     visible row is the same read this dialog needs. */
  React.useEffect(() => {
    let live = true
    void readEnrichment(row).then((answer) => {
      if (live) setEnriched(answer)
    })
    return () => {
      live = false
    }
  }, [row])

  const description = row.entry.description ?? enriched?.description

  /* The pack's README and what it carries are read once as the dialog opens,
     from a staging fetch the library never sees. A failure changes nothing the
     index already said; it only stands where the README would have been. */
  const [preview, setPreview] = React.useState<Preview>({ state: "loading" })
  const [attempt, setAttempt] = React.useState(0)
  React.useEffect(() => {
    let live = true
    queueMicrotask(() => {
      if (!live) return
      setPreview({ state: "loading" })
      void previewMarketEntry(row.entry.install)
        .then((value) => {
          if (live) setPreview({ state: "ready", value })
        })
        .catch(() => {
          if (live) setPreview({ state: "failed" })
        })
    })
    return () => {
      live = false
    }
  }, [row, attempt])

  const contents = preview.state === "ready" ? preview.value.contents : null
  const tabs = offeredTabs(contents)
  const [tab, setTab] = React.useState<DetailTab>("content")
  /* A tab that is no longer offered — a retry that read less — leaves the pane
     on Content rather than on nothing. */
  const shown = tabs.includes(tab) ? tab : "content"

  const path = installPath(row)
  const commit = installCommit(row)
  const home = homeOf(row)
  const category = t(`market.plugins.category.${normalizeCategory(row.entry.category)}`)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogSplit
        pane={
          <Tabs
            value={shown}
            onValueChange={(value) => setTab(value as DetailTab)}
            className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden"
          >
            <div className="flex h-12 shrink-0 items-center border-b border-border px-8">
              <TabsList variant="line" className="h-12! gap-7 p-0">
                {tabs.map((one) => (
                  <TabsTrigger
                    key={one}
                    value={one}
                    className="h-12 flex-none rounded-none border-0 px-0 py-0 text-[13.5px] leading-[1.4] font-medium text-muted-foreground after:inset-x-0 after:bottom-0! after:h-0.5 after:bg-primary data-active:font-semibold data-active:text-foreground"
                  >
                    {t(`market.plugins.detail.tab.${one}`)}
                  </TabsTrigger>
                ))}
              </TabsList>
              {/* A preview is a fetch, so the tab bar says so while it is out;
                  the tabs themselves only appear once the read found them. */}
              {preview.state === "loading" ? (
                <LoaderCircleIcon
                  className="ml-auto size-3.5 shrink-0 animate-spin text-muted-foreground"
                  aria-hidden
                />
              ) : null}
            </div>

            <TabsContent
              value="content"
              className="min-h-0 flex-1 scrollbar-gutter-stable overflow-y-auto px-8 py-7"
            >
              <div className="flex flex-col gap-6">
                <section className="flex flex-col gap-3">
                  <SectionLabel>{t("market.plugins.detail.about")}</SectionLabel>
                  <p className="text-[13.5px] leading-6 text-foreground">
                    {description ?? t("market.plugins.noDescription")}
                  </p>
                </section>

                {/* The index already said what the pack is, so the about block
                    stands while the read is out; only the part that comes from
                    the pack itself waits, under its own label. */}
                {preview.state === "loading" ? (
                  <section className="flex flex-col gap-2.5">
                    <div className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                      <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin" aria-hidden />
                      {t("market.plugins.preview.loading")}
                    </div>
                    {/* The pane sits on `surface-raised`, which is the same
                        colour the skeleton defaults to — its own `bg-border`
                        keeps the bars visible against it. */}
                    <div className="flex flex-col gap-3 pt-1">
                      <Skeleton className="h-2.5 w-[92%] bg-border" />
                      <Skeleton className="h-2.5 w-[84%] bg-border" />
                      <Skeleton className="h-2.5 w-[72%] bg-border" />
                      <Skeleton className="h-2.5 w-[88%] bg-border" />
                    </div>
                  </section>
                ) : null}

                {preview.state === "failed" ? (
                  <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                    <TriangleAlertIcon className="size-3.5 shrink-0" aria-hidden />
                    <span>{t("market.plugins.preview.failed")}</span>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto shrink-0 p-0 text-xs"
                      onClick={() => setAttempt((at) => at + 1)}
                    >
                      {t("market.plugins.action.retry")}
                    </Button>
                  </div>
                ) : null}

                {preview.state === "ready" && preview.value.readme !== null ? (
                  <section className="flex flex-col gap-3">
                    <SectionLabel>{t("market.plugins.detail.readme")}</SectionLabel>
                    <Markdown className="text-[13.5px] leading-6 text-foreground">
                      {preview.value.readme}
                    </Markdown>
                  </section>
                ) : null}
              </div>
            </TabsContent>

            {tabs.includes("skills") ? (
              <TabsContent
                value="skills"
                className="min-h-0 flex-1 scrollbar-gutter-stable overflow-y-auto px-8 py-7"
              >
                <ContentList items={contents?.skills ?? []} icon={SparklesIcon} />
              </TabsContent>
            ) : null}
            {tabs.includes("commands") ? (
              <TabsContent
                value="commands"
                className="min-h-0 flex-1 scrollbar-gutter-stable overflow-y-auto px-8 py-7"
              >
                <ContentList items={contents?.commands ?? []} icon={SquareSlashIcon} />
              </TabsContent>
            ) : null}
            {/* The MCP tab is the pack's own declaration read as a file: what a
                client is handed is exactly what is written there. */}
            {tabs.includes("mcp") ? (
              <TabsContent value="mcp" className="min-h-0 flex-1 px-8 py-7">
                <CodeCard path=".mcp.json" text={contents?.mcp ?? ""} className="h-full" />
              </TabsContent>
            ) : null}
          </Tabs>
        }
        panel={
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex h-[84px] shrink-0 items-center gap-3 border-b border-border px-5">
              <MarketMark row={row} enrichment={enriched} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <DialogTitle className="truncate font-mono text-[17px] leading-[22px] font-semibold text-foreground">
                  {row.entry.name}
                </DialogTitle>
                <DialogDescription className="truncate font-mono text-[12px] leading-[16px] text-muted-foreground">
                  {row.source.name} · {category}
                </DialogDescription>
              </div>
              <DialogClose
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 rounded-full"
                    aria-label={t("market.plugins.action.close")}
                  />
                }
              >
                <XIcon className="size-4" />
              </DialogClose>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
              <section className="flex flex-col gap-2.5">
                <Heading>{t("market.plugins.detail.source")}</Heading>
                <dl className="flex flex-col gap-3">
                  <MetaRow label={t("market.plugins.detail.market")} value={row.source.name} />
                  <MetaRow label={t("market.plugins.detail.repo")} value={repoLabel(row.entry.install.url)} />
                  {path === undefined ? null : (
                    <MetaRow label={t("market.plugins.detail.path")} value={path} />
                  )}
                  {commit === undefined ? null : (
                    <MetaRow label={t("market.plugins.detail.commit")} value={commit} />
                  )}
                </dl>
              </section>

              <Separator />

              <section className="flex flex-col gap-2">
                <Heading>{t("market.plugins.detail.home")}</Heading>
                <a
                  href={home}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-fit items-center gap-1.5 text-[13px] text-primary hover:underline"
                >
                  <ExternalLinkIcon className="size-3.5" aria-hidden />
                  {t("market.plugins.detail.viewOnGithub")}
                </a>
              </section>
            </div>

            <div className="shrink-0 p-5 pt-0">
              {installed === undefined ? (
                <Button
                  className="h-10 w-full rounded-full text-[13.5px] font-semibold"
                  onClick={() => onInstall(row)}
                >
                  {t("market.plugins.detail.install")}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="h-10 w-full rounded-full text-[13.5px] font-semibold"
                  render={<a href="/plugins" />}
                >
                  {t("market.plugins.detail.manage")}
                </Button>
              )}
            </div>
          </div>
        }
      />
    </Dialog>
  )
}
