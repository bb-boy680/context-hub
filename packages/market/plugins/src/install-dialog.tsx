/**
 * Installing one market entry: pick the places it goes into, then let the
 * plugin library collect the pack and deliver it there.
 *
 * The places are the agents' own: each one declares where it keeps packs and
 * what it calls that place, so this lists them the way the skills market lists
 * its places — one row per agent and place, grouped by the root it belongs to.
 * The library row on top is the copy every delivery is made from, which is why
 * it is always the first thing checked.
 */
import {
  CheckIcon,
  ChevronDownIcon,
  LibraryIcon,
  Loader2Icon,
  XIcon,
} from "lucide-react"
import * as React from "react"

import type { AssetScope } from "@context-hub/extensions"
import { useHub, useI18n } from "@context-hub/extensions/react"
import { PLUGIN_SERVICE } from "@context-hub/plugins/provider"
import type { PluginPlace, PluginRecord } from "@context-hub/plugins"
import { usePluginLibrary, type PluginClient } from "@context-hub/plugins/library"
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

/** The root groups a place belongs to, in the order the list reads them. */
const SCOPES: readonly AssetScope[] = ["workspace", "global"]

/** Past this many places a group folds, the same count the skills page uses. */
const PLACES_VISIBLE = 8

/** The library row and every place row wear the same surface, so a choice
 * reads as one control whether it is the fixed target or a place to pick. */
const ROW =
  "flex w-full items-center gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-left"

/** An agent's own mark, the same 28px tile the skills page's place lists use. */
const TILE =
  "flex size-7 shrink-0 items-center justify-center overflow-clip rounded-lg bg-surface-raised ring-1 ring-border ring-inset"

const CIRCLE =
  "flex size-5 shrink-0 items-center justify-center rounded-full border border-border bg-background"

/** The agent's own word for a place, which is what the row's second line says. */
function scopeWordKey(place: PluginPlace): string {
  return `plugins.scope.${place.scopeWord}`
}

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
 * library goes straight to delivery instead of being collected again.
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
  const ctx = useHub()
  const library = usePluginLibrary()
  const [picked, setPicked] = React.useState<readonly string[]>([])
  const [unfolded, setUnfolded] = React.useState<readonly string[]>([])
  const [running, setRunning] = React.useState(false)
  const [failure, setFailure] = React.useState<string | null>(null)

  const record = installedRecord(records, row.entry)
  const path = installPath(row)
  const commit = installCommit(row)
  const category = t(`market.plugins.category.${normalizeCategory(row.entry.category)}`)
  /* The folded rows are what say which places already hold the pack; the
     records above only say whether the library has a copy at all. */
  const held =
    record === undefined
      ? undefined
      : library.rows.find((one) => one.name === record.name)
  const belongs = (client: PluginClient, place: PluginPlace): boolean =>
    held?.held
      .find((one) => one.client === client.id)
      ?.places.some((one) => one.group === place.scope && one.scope === place.scopeWord) ===
    true
  const artifactIn = (client: PluginClient): boolean =>
    (held?.held.find((one) => one.client === client.id)?.places.length ?? 0) > 0
  const targets = library.clients.flatMap((client) =>
    client.places
      .filter((place) => (place.installable !== false || (place.initialInstallable === true && !artifactIn(client))) && picked.includes(place.id) && !belongs(client, place))
      .map((place) => ({ client, place }))
  )
  /* Already in the library and nothing picked: installing again would only
     replace the same copy. */
  const nothingToDo = record !== undefined && targets.length === 0

  const close = (next: boolean) => {
    if (running) return
    onOpenChange(next)
  }

  const toggle = (id: string) => {
    setPicked((current) =>
      current.includes(id) ? current.filter((one) => one !== id) : [...current, id]
    )
  }

  /* Each root folds on its own: the machine-wide list grows with every agent a
     person enables, while a workspace holds only the places this hub knows. */
  const fold = (scope: string) =>
    setUnfolded((current) =>
      current.includes(scope)
        ? current.filter((one) => one !== scope)
        : [...current, scope]
    )

  const install = () => {
    if (running || nothingToDo) return
    setRunning(true)
    setFailure(null)
    void (async () => {
      /* Collect first: every delivery is made from the library's copy. */
      let name = record?.name
      if (name === undefined) {
        const collected = await collectMarketInstall(row.entry.install, ctx.get(PLUGIN_SERVICE)?.manifestPaths() ?? [])
        await library.refresh()
        name = collected.record.name
      }
      /* One refusal must not hide the places that did land, so each is tried
         and the first reason is what the dialog keeps. */
      let refused: string | null = null
      const warnings: string[] = []
      for (const target of targets) {
        try {
          const report = await library.install(name, target.client.id, target.place.scopeWord)
          if (report.warning !== undefined && report.warning.trim() !== "") warnings.push(report.warning)
        } catch (error: unknown) {
          refused ??= error instanceof Error ? error.message : String(error)
        }
      }
      if (refused !== null) {
        setFailure(refused)
        return
      }
      /* A committed delivery may still need follow-up; a success notice alone
         would hide that from the person who asked for it. */
      if (warnings.length > 0) {
        toast.add({
          type: "warning",
          title: t("market.plugins.install.followUp").replace("{name}", row.entry.name),
          description: warnings.join("\n"),
        })
      } else {
        toast.add({
          type: "success",
          title: t("market.plugins.install.done").replace("{name}", row.entry.name),
        })
      }
      onOpenChange(false)
    })()
      .catch((error: unknown) => {
        setFailure(error instanceof Error ? error.message : String(error))
      })
      .finally(() => setRunning(false))
  }

  const placeRow = (client: PluginClient, place: PluginPlace) => {
    const already = belongs(client, place)
    const blocked =
      client.error !== undefined
        ? t("plugins.client.unread")
        : client.available
          ? undefined
          : t("plugins.client.absent")
    const checked = already || picked.includes(place.id)
    const disabled = already || blocked !== undefined || running
    const Mark = client.icon
    return (
      <button
        key={place.id}
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={`${client.label} ${t(scopeWordKey(place))}`}
        disabled={disabled}
        title={blocked}
        onClick={() => toggle(place.id)}
        className={`${ROW} outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <span className={TILE}>
          <Mark className="size-4" aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{client.label}</span>
          <span className="truncate font-mono text-[11.5px] text-muted-foreground">
            {t(scopeWordKey(place))}
          </span>
        </span>
        {blocked === undefined ? null : (
          <span className="shrink-0 text-[11.5px] text-muted-foreground">{blocked}</span>
        )}
        <span className={CIRCLE}>
          {checked ? <CheckIcon className="size-3" aria-hidden /> : null}
        </span>
      </button>
    )
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[calc(100vh-2rem)] w-[min(540px,calc(100vw-32px))] flex-col gap-0 overflow-hidden rounded-xl bg-dialog p-0 shadow-soft ring-1 ring-border sm:max-w-[540px]"
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

        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-6 pb-5">
          <section className="flex flex-col gap-2.5">
            <Heading>{t("market.plugins.install.to")}</Heading>
            {/* The library is the copy every place is delivered from, so it is
                the one target that cannot be unpicked. */}
            <div className={ROW}>
              <span className={TILE}>
                <LibraryIcon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 text-sm font-medium">
                {t("plugins.tab.library")}
              </span>
              <span className={CIRCLE}>
                <CheckIcon className="size-3" aria-hidden />
              </span>
            </div>

            {SCOPES.map((scope) => {
              const group = library.clients.flatMap((client) =>
                client.places
                  .filter((place) => place.scope === scope && (place.installable !== false || (place.initialInstallable === true && !artifactIn(client))))
                  .map((place) => ({ client, place }))
              )
              if (group.length === 0) return null
              const open = unfolded.includes(scope)
              const rest = group.length - PLACES_VISIBLE
              const shown = open || rest <= 0 ? group : group.slice(0, PLACES_VISIBLE)
              return (
                <div key={scope} className="flex flex-col gap-2">
                  <span className="px-1 pt-1 text-[11.5px] font-semibold text-muted-soft">
                    {t(`plugins.detail.group.${scope}`)}
                  </span>
                  {shown.map((one) => placeRow(one.client, one.place))}
                  {rest <= 0 ? null : (
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => fold(scope)}
                      className="flex h-10 w-full items-center gap-2.5 rounded-md pr-3 pl-[5px] text-left text-sm font-medium text-copy outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex size-[18px] shrink-0 items-center justify-center">
                        <ChevronDownIcon
                          className={`size-[18px] shrink-0 transition-transform ${
                            open ? "rotate-180" : ""
                          }`}
                          aria-hidden
                        />
                      </span>
                      {open
                        ? t("plugins.place.collapse")
                        : t("plugins.place.expand").replace("{count}", String(rest))}
                    </button>
                  )}
                </div>
              )
            })}

            {library.failure !== null ? (
              <p className="px-1 text-xs text-destructive">{library.failure}</p>
            ) : library.clients.length === 0 && !library.busy ? (
              <p className="px-1 text-xs text-muted-foreground">
                {t("market.plugins.install.noAgent")}
              </p>
            ) : null}
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
          <Button disabled={running || nothingToDo} onClick={install}>
            {running ? (
              <Loader2Icon className="animate-spin" aria-hidden />
            ) : null}
            {running
              ? t("market.plugins.install.running")
              : nothingToDo
                ? t("market.plugins.install.installed")
                : t("market.plugins.install.confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
