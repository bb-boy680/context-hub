import { CheckIcon, CopyIcon, Loader2Icon, XIcon } from "lucide-react"
import * as React from "react"

import { useI18n } from "@context-hub/extensions/react"
import { Button } from "@context-hub/shadcn-ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@context-hub/shadcn-ui/components/dialog"
import { toast } from "@context-hub/shadcn-ui/components/toast"

import { nameConflict, type MarketLibrary, type MarketRow } from "./rows.ts"

/** The one target the market installs into: the hub's own skill library. */
export function MarketInstallDialog({
  row,
  open,
  onOpenChange,
  library,
}: {
  row: MarketRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  library: MarketLibrary
}) {
  const { t } = useI18n()
  const [running, setRunning] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  if (row === null) return null

  const conflict = nameConflict(library.rows, row.source, row.skillId)
  const command = `npx skills add ${row.source} --skill ${row.skillId}`
  const blocked = conflict || library.store === null

  const close = (next: boolean) => {
    if (running) return
    onOpenChange(next)
  }

  const copy = () => {
    const write = navigator.clipboard?.writeText(command)
    if (write === undefined) {
      toast.add({ type: "error", title: t("market.install.copyFailed") })
      return
    }
    void write
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {
        toast.add({ type: "error", title: t("market.install.copyFailed") })
      })
  }

  const install = () => {
    if (blocked || library.store === null) return
    setRunning(true)
    library.store
      .installPackage(row.source, [row.skillId])
      .then((result) => {
        if (result.installed.length === 0) {
          toast.add({
            type: "error",
            title: result.failed[0]?.reason ?? t("market.install.failed"),
          })
          return
        }
        return library.reload().then(() => {
          toast.add({
            type: "success",
            title: t("market.install.done").replace("{name}", row.name),
          })
          onOpenChange(false)
        })
      })
      .catch((error: unknown) => {
        toast.add({
          type: "error",
          title: error instanceof Error ? error.message : String(error),
        })
      })
      .finally(() => setRunning(false))
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        showCloseButton={false}
        className="flex w-[520px] max-w-[calc(100vw-2rem)] flex-col gap-0 rounded-xl bg-dialog p-0 ring-1 ring-border sm:max-w-[520px]"
      >
        <div className="flex items-start gap-4 px-6 pt-5 pb-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <DialogTitle className="truncate font-mono text-[15px] font-semibold">
              {t("market.install.title").replace("{name}", row.name)}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("market.install.target")}
            </DialogDescription>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("market.detail.close")}
            disabled={running}
            onClick={() => close(false)}
          >
            <XIcon />
          </Button>
        </div>

        <div className="flex flex-col gap-3 px-6 pb-5">
          <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-3 text-sm font-medium">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border bg-background">
              <CheckIcon className="size-3" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">{t("market.install.target")}</span>
          </div>

          <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2">
            <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-muted-foreground">
              {command}
            </code>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t("market.install.copy")}
              onClick={() => void copy()}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </Button>
          </div>

          {conflict ? (
            <p className="text-xs text-destructive">{t("market.state.conflict")}</p>
          ) : library.store === null ? (
            <p className="text-xs text-destructive">{t("market.state.noLibrary")}</p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <Button variant="ghost" disabled={running} onClick={() => close(false)}>
            {t("market.install.cancel")}
          </Button>
          <Button disabled={blocked || running} onClick={() => void install()}>
            {running ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
            {running ? t("market.install.running") : t("market.install.confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
