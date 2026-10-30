/**
 * One market entry: what it says about itself, where it comes from, and the
 * one action that matters — install it, or say it is already here.
 */
import { ExternalLinkIcon, XIcon } from "lucide-react"
import * as React from "react"

import { useI18n } from "@context-hub/extensions/react"
import type { PluginRecord } from "@context-hub/plugins"
import { Badge } from "@context-hub/shadcn-ui/components/badge"
import { Button } from "@context-hub/shadcn-ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogTitle,
} from "@context-hub/shadcn-ui/components/dialog"
import { Separator } from "@context-hub/shadcn-ui/components/separator"

import { DialogSplit } from "@context-hub/extensions/components"
import { normalizeCategory } from "./contract.ts"
import { enrichmentOf, readEnrichment } from "./icons.tsx"
import { installCommit, installPath, repoLabel, type MarketRow } from "./rows.ts"

/** The page a person can open to read more. */
function homeOf(row: MarketRow): string {
  if (row.entry.homepage !== undefined) return row.entry.homepage
  const path = installPath(row)
  return path === undefined
    ? row.entry.install.url
    : `${row.entry.install.url}/tree/main/${path}`
}

/** One `label / value` line in the source block. */
function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-baseline gap-4">
      <dt className="text-[12px] text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono text-[12.5px] text-foreground">{value}</dd>
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
 * The detail of one entry.
 *
 * @param installed — the library record that is this entry, when the library holds it.
 * @param onInstall — opens the install dialog; the page closes this one first.
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
  const [description, setDescription] = React.useState<string | undefined>(
    () => row.entry.description ?? enrichmentOf(row.entry.id)?.description
  )

  /* A Codex row carries no sentence in its index; the manifest read for the
     visible row is the same read this dialog needs. */
  React.useEffect(() => {
    if (description !== undefined) return
    let live = true
    void readEnrichment(row).then((answer) => {
      if (live && answer.description !== undefined) setDescription(answer.description)
    })
    return () => {
      live = false
    }
  }, [row, description])

  const path = installPath(row)
  const commit = installCommit(row)
  const home = homeOf(row)
  const category = t(`market.plugins.category.${normalizeCategory(row.entry.category)}`)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogSplit
        pane={
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex min-w-0 items-center gap-2.5 px-8 pt-7 pb-5">
              <DialogTitle className="truncate font-mono text-[20px] font-semibold text-foreground">
                {row.entry.name}
              </DialogTitle>
              <Badge variant="secondary">{row.source.name}</Badge>
              <Badge variant="secondary">{category}</Badge>
              <DialogClose
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto shrink-0 rounded-full"
                    aria-label={t("market.plugins.action.close")}
                  />
                }
              >
                <XIcon className="size-4" />
              </DialogClose>
            </div>
            <Separator />

            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-8 py-7">
              <DialogDescription className="sr-only">{row.entry.name}</DialogDescription>

              <section className="flex flex-col gap-2.5">
                <Heading>{t("market.plugins.detail.about")}</Heading>
                <p className="text-[13.5px] leading-6 text-foreground">
                  {description ?? t("market.plugins.noDescription")}
                </p>
              </section>

              <Separator />

              <section className="flex flex-col gap-2.5">
                <Heading>{t("market.plugins.detail.source")}</Heading>
                <dl className="flex flex-col gap-1.5">
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

              <section className="flex flex-col gap-2.5">
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
          </div>
        }
        panel={
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-7">
              <section className="flex flex-col gap-2">
                <Heading>{t("market.plugins.detail.status")}</Heading>
                <p className="text-[15px] font-medium text-foreground">
                  {installed === undefined
                    ? t("market.plugins.detail.notInstalled")
                    : t("market.plugins.installed")}
                </p>
              </section>

              <Separator />

              <section className="flex flex-col gap-2.5">
                <Heading>{t("market.plugins.detail.install")}</Heading>
                <p className="text-[13px] text-foreground">
                  {row.source.name} · {t("market.plugins.install.thisRepo")}
                </p>
                <p className="text-[12.5px] leading-5 text-muted-foreground">
                  {t("market.plugins.install.note")}
                </p>
              </section>
            </div>

            <div className="p-6 pt-2">
              {installed === undefined ? (
                <Button className="w-full" onClick={() => onInstall(row)}>
                  {t("market.plugins.detail.install")}
                </Button>
              ) : (
                <Button variant="outline" className="w-full" render={<a href="/plugins" />}>
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
