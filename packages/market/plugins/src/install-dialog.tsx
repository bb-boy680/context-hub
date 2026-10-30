/**
 * Installing one market entry: choose the agent and the scope, then let the
 * plugin library collect the pack and deliver it.
 *
 * The dialog mounts only while it is open, which is what makes it the one
 * place that reads the whole plugin library — the directory above only needs
 * the names already collected.
 */
import { XIcon } from "lucide-react"
import * as React from "react"

import { useI18n } from "@context-hub/extensions/react"
import type { PluginInstallScope, PluginRecord } from "@context-hub/plugins"
import { usePluginLibrary } from "@context-hub/plugins/library"
import { Button } from "@context-hub/shadcn-ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@context-hub/shadcn-ui/components/dialog"
import { Separator } from "@context-hub/shadcn-ui/components/separator"
import { toast } from "@context-hub/shadcn-ui/components/toast"

import { collectMarketInstall } from "./apis/library.ts"
import { normalizeCategory } from "./contract.ts"
import {
  installCommit,
  installPath,
  installedRecord,
  repoLabel,
  type MarketRow,
} from "./rows.ts"

const SCOPES: readonly { value: PluginInstallScope; key: string }[] = [
  { value: "project", key: "market.plugins.install.thisRepo" },
  { value: "user", key: "market.plugins.install.thisMachine" },
]

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[60px_minmax(0,1fr)] items-baseline gap-4">
      <dt className="text-[12px] text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono text-[12.5px] text-foreground">{value}</dd>
    </div>
  )
}

/**
 * The install dialog for one entry.
 *
 * @param records — what the page already read, so an entry already in the
 * library goes straight to delivery.
 */
export function MarketInstallDialog({
  row,
  open,
  onOpenChange,
  records,
}: {
  row: MarketRow
  open: boolean
  onOpenChange: (open: boolean) => void
  records: readonly PluginRecord[]
}) {
  const { t } = useI18n()
  const library = usePluginLibrary()
  const [picked, setPicked] = React.useState<string | null>(null)
  const [scope, setScope] = React.useState<PluginInstallScope>("project")
  const [running, setRunning] = React.useState(false)
  const [failure, setFailure] = React.useState<string | null>(null)

  const client =
    library.clients.find((one) => one.id === picked && one.available) ??
    library.clients.find((one) => one.available)
  const record = installedRecord(records, row.entry)
  const path = installPath(row)
  const commit = installCommit(row)
  const category = t(`market.plugins.category.${normalizeCategory(row.entry.category)}`)

  const close = (next: boolean) => {
    if (running) return
    onOpenChange(next)
  }

  const install = () => {
    if (client === undefined || running) return
    setRunning(true)
    setFailure(null)
    Promise.resolve()
      .then(async () => {
        if (record !== undefined) return record.name
        const collected = await collectMarketInstall(row.entry.install)
        /* The collector wrote a record; the library has to read it before it
           can be delivered by name. */
        await library.refresh()
        return collected.record.name
      })
      .then((name) => library.install(name, client.id, scope))
      .then(() => {
        toast.add({
          type: "success",
          title: t("market.plugins.install.done").replace("{name}", row.entry.name),
        })
        onOpenChange(false)
      })
      .catch((error: unknown) => {
        setFailure(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        setRunning(false)
      })
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        showCloseButton={false}
        className="flex w-[min(540px,calc(100vw-32px))] flex-col gap-0 overflow-hidden rounded-xl bg-dialog p-0 shadow-soft ring-1 ring-border sm:max-w-[540px]"
      >
        <div className="flex min-w-0 items-start gap-2 px-6 pt-6 pb-4">
          <div className="flex min-w-0 flex-col gap-1">
            <DialogTitle className="truncate text-[17px] font-semibold text-foreground">
              {t("market.plugins.install.title").replace("{name}", row.entry.name)}
            </DialogTitle>
            <DialogDescription className="text-[12.5px] text-muted-foreground">
              {row.source.name} {t("market.plugins.detail.market")} · {category}
            </DialogDescription>
          </div>
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

        <div className="flex flex-col gap-5 px-6 pb-5">
          <section className="flex flex-col gap-2">
            <Heading>{t("market.plugins.install.to")}</Heading>
            {library.clients.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                {t("market.plugins.install.noAgent")}
              </p>
            ) : (
              <div role="radiogroup" className="flex flex-col gap-2">
                {library.clients.map((one) => {
                  const selected = client?.id === one.id
                  return (
                    <button
                      key={one.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={!one.available || running}
                      onClick={() => setPicked(one.id)}
                      className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
                        selected
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border"
                      }`}
                    >
                      <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-border">
                        {selected ? <span className="size-2 rounded-full bg-primary" /> : null}
                      </span>
                      <span className="truncate">{one.label}</span>
                      {one.available ? (
                        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                          {t("market.plugins.install.detected")}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <Heading>{t("market.plugins.install.scope")}</Heading>
            <div className="flex rounded-full bg-secondary p-1">
              {SCOPES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={scope === item.value}
                  disabled={running}
                  onClick={() => setScope(item.value)}
                  className={`flex-1 rounded-full py-1.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    scope === item.value
                      ? "bg-background font-medium text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t(item.key)}
                </button>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <Heading>{t("market.plugins.install.source")}</Heading>
            <dl className="flex flex-col gap-1.5">
              <MetaRow
                label={t("market.plugins.detail.repo")}
                value={repoLabel(row.entry.install.url)}
              />
              {path === undefined ? null : (
                <MetaRow label={t("market.plugins.detail.path")} value={path} />
              )}
              {commit === undefined ? null : (
                <MetaRow
                  label={t("market.plugins.detail.commit")}
                  value={commit.slice(0, 12)}
                />
              )}
            </dl>
            <p className="text-[12px] leading-5 text-muted-foreground">
              {t("market.plugins.install.note")}
            </p>
          </section>

          {failure === null ? null : (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12.5px] text-destructive">
              <p className="font-medium">{t("market.plugins.install.failed")}</p>
              <p className="mt-1 break-words">{failure}</p>
            </div>
          )}
        </div>

        <Separator />
        <div className="flex justify-end gap-2 px-6 py-4">
          <Button variant="secondary" disabled={running} onClick={() => close(false)}>
            {t("market.plugins.install.cancel")}
          </Button>
          <Button disabled={client === undefined || running} onClick={install}>
            {running ? t("market.plugins.install.running") : t("market.plugins.install.confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
