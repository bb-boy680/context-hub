/**
 * Detail dialog for one extension: what it is, what it contributes, and which
 * permissions it asks for, with the install or uninstall action in its footer.
 */
import { DownloadIcon, PowerIcon, Trash2Icon, XIcon } from "lucide-react"
import * as React from "react"

import { categoryTile } from "@/lib/extensions"
import type { MarketEntry, MarketUpdateEntry } from "@/lib/extension-market"
import type { ExtensionView } from "@context-hub/extensions"
import { localized } from "@context-hub/extensions"
import {
  useExtensionContributions,
  useHub,
  useI18n,
} from "@context-hub/extensions/react"
import { Badge } from "@context-hub/shadcn-ui/components/badge"
import { Button } from "@context-hub/shadcn-ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@context-hub/shadcn-ui/components/dialog"
import { toast } from "@context-hub/shadcn-ui/components/toast"

const outline = "border-border bg-transparent dark:border-input dark:bg-transparent"
const destructive =
  "border-destructive/35 bg-transparent text-destructive hover:bg-destructive/5 hover:text-destructive dark:border-destructive/35 dark:bg-transparent"
const warning =
  "border-amber-600/35 bg-transparent text-amber-600 hover:bg-amber-600/5 hover:text-amber-700 dark:border-amber-400/35 dark:bg-transparent dark:text-amber-400 dark:hover:bg-amber-400/10 dark:hover:text-amber-300"

/** One source fact in the market origin block. */
function SourceRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <>
      <span className="text-[11.5px] text-muted-foreground">{label}</span>
      <span className={`break-all text-[12.5px] ${mono ? "font-mono" : ""}`}>{value}</span>
    </>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[13px] leading-[17px] font-semibold">{title}</h3>
      {children}
    </section>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-[22px] items-center rounded-full bg-secondary px-2 text-[11.5px] font-medium text-secondary-foreground">
      {children}
    </span>
  )
}

function ContributionList({ entry }: { entry: ExtensionView }) {
  const { t } = useI18n()
  const locales = useExtensionContributions(entry.manifest.id, "locale")
  const targets = useExtensionContributions(entry.manifest.id, "target")
  const { capabilities } = useHub().host

  return (
    <div className="flex flex-col gap-4">
      {locales.length > 0
        ? locales.map((locale) => (
            <div key={locale.id} className="flex items-center gap-2 text-[13px]">
              <span className="font-medium">{locale.label}</span>
              <span className="text-muted-foreground">{locale.id}</span>
              <Chip>{`${Object.keys(locale.messages).length} keys`}</Chip>
            </div>
          ))
        : null}
      {targets.map((target) => (
        <div key={target.id} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-medium">{target.displayName}</span>
            {target.supports.map((kind) => (
              <Chip key={kind}>{t(`extensions.asset.${kind}`)}</Chip>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">
              {t("extensions.detail.locations")}
            </span>
            {target.locations.map((location) => (
              <div
                key={location.path}
                className="flex items-center justify-between gap-3 text-[13px]"
              >
                <span>{location.label}</span>
                <span className="truncate font-mono text-[11.5px] text-muted-foreground">
                  {location.path}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-2 text-[13px]">
            <span className="shrink-0 text-muted-foreground">
              {t("extensions.detail.format")}
            </span>
            <span className="min-w-0">{target.format}</span>
          </div>
          {!capabilities.filesystem ? (
            <p className="rounded-md bg-muted px-3 py-2 text-[12.5px] text-muted-foreground">
              {t("extensions.requiresRuntime")}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function ExtensionDetailBody({
  entry,
  market,
  installed,
  update,
  onInstall,
  onUninstall,
}: {
  entry: ExtensionView
  /** The index entry behind an installed market plugin, or one not installed yet. */
  market: MarketEntry | null
  /** Whether the kernel already holds this id. */
  installed: boolean
  /** A newer listing for this installed plugin, if the market has one. */
  update: MarketUpdateEntry | null
  onInstall?: (plugin: MarketEntry["plugin"], version: NonNullable<MarketEntry["version"]>) => Promise<void>
  onUninstall?: (entry: ExtensionView) => Promise<void>
}) {
  const { t, state: i18n } = useI18n()
  const ctx = useHub()
  const { manifest } = entry
  const Icon = manifest.icon
  const name = localized(manifest.name, i18n.active)
  const description = localized(manifest.description, i18n.active)
  const permissions = manifest.permissions ?? []
  const [busy, setBusy] = React.useState(false)

  /** What installing or updating would put on this machine. */
  const target = update?.target ?? market?.version ?? null

  /** Run one footer action, reporting a failure where the user clicked. */
  const run = (task: () => Promise<void> | void): void => {
    setBusy(true)
    void Promise.resolve()
      .then(task)
      .catch((reason: unknown) => {
        toast.add({
          type: "error",
          title: reason instanceof Error ? reason.message : String(reason),
        })
      })
      .finally(() => {
        setBusy(false)
      })
  }

  type Primary = "update" | "install" | "uninstall" | "disable" | "enable"

  /*
   * An update wins over every other action; an installed package then offers
   * removal (stored) or the enablement switch (built in). A package this hub
   * cannot run offers nothing unless its files can still be removed.
   */
  const primary: Primary | null = (() => {
    if (manifest.locked === true) return null
    if (update !== null && update.target !== null) return "update"
    if (!installed) return market?.version == null ? null : "install"
    if (entry.status === "incompatible" && !entry.stored) return null
    if (entry.stored) return "uninstall"
    return entry.enabled ? "disable" : "enable"
  })()

  const runPrimary = (): void => {
    if (primary === "update" && update !== null && update.target !== null && onInstall !== undefined) {
      const { plugin, target: version } = update
      run(() => onInstall(plugin, version))
      return
    }
    if (primary === "install" && market !== null && market.version !== null && onInstall !== undefined) {
      const { plugin, version } = market
      run(() => onInstall(plugin, version))
      return
    }
    if (primary === "uninstall" && onUninstall !== undefined) {
      run(() => onUninstall(entry))
      return
    }
    if (primary === "disable") {
      run(() => ctx.extensions.disable(manifest.id))
      return
    }
    if (primary === "enable") {
      run(() => ctx.extensions.enable(manifest.id))
    }
  }

  const actionLabel =
    primary === null
      ? ""
      : t(
          primary === "update"
            ? "extensions.market.update"
            : primary === "install"
              ? "extensions.action.install"
              : primary === "uninstall"
                ? "extensions.action.uninstall"
                : primary === "disable"
                  ? "extensions.action.disable"
                  : "extensions.action.enable"
        )

  return (
    <>
      <div className="flex h-[84px] shrink-0 items-center gap-3.5 px-6 pt-[22px] pb-[18px]">
        <span
          className={`flex size-11 shrink-0 items-center justify-center rounded-[10px] ${categoryTile[manifest.category]}`}
        >
          <Icon className="size-5 text-secondary-foreground" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <DialogTitle className="flex items-center gap-2 text-base leading-[21px] font-semibold">
            {name}
            <Badge variant="secondary">{t(`extensions.kind.${manifest.kind}`)}</Badge>
          </DialogTitle>
          <DialogDescription className="truncate text-[13px] leading-4">
            {`v${manifest.version}  ·  ${t("extensions.detail.form")} ${ctx.host.form}`}
          </DialogDescription>
        </div>
        <DialogClose
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto shrink-0"
              aria-label="Close"
            />
          }
        >
          <XIcon className="text-muted-foreground" />
        </DialogClose>
      </div>
      <div className="flex max-h-[60vh] shrink-0 flex-col gap-5 overflow-y-auto border-t border-border px-6 py-5">
        {entry.status === "error" && entry.error !== undefined ? (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
            {entry.error}
          </p>
        ) : null}
        <Section title={t("extensions.detail.about")}>
          <p className="text-[13px] leading-[19px] text-muted-foreground">
            {description}
          </p>
        </Section>
        {market === null ? null : (
          <Section title={t("extensions.market.origin")}>
            {target === null ? (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
                {t("extensions.market.incompatible")
                  .replace(
                    "{range}",
                    market.plugin.versions[0]?.engines.contextHub ?? ""
                  )
                  .replace("{version}", ctx.host.version)}
              </p>
            ) : (
              <div className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-1.5">
                <SourceRow
                  label={t("extensions.market.confirmVersion")}
                  value={target.version}
                />
                <SourceRow
                  label={t("extensions.market.confirmRequires")}
                  value={target.engines.contextHub}
                  mono
                />
                <SourceRow
                  label={t("extensions.market.confirmSource")}
                  value={target.source.url}
                  mono
                />
                {target.source.path === undefined ? null : (
                  <SourceRow
                    label={t("extensions.market.confirmPath")}
                    value={target.source.path}
                    mono
                  />
                )}
              </div>
            )}
          </Section>
        )}
        {market !== null && !entry.enabled ? null : (
          <Section title={t("extensions.detail.contributes")}>
            {manifest.kind === "builtin" ? (
              <p className="text-[13px] text-muted-foreground">
                {t("extensions.detail.noPermissions")}
              </p>
            ) : (
              <ContributionList entry={entry} />
            )}
          </Section>
        )}
        <Section title={t("extensions.detail.permissions")}>
          {permissions.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              {t("extensions.detail.noPermissions")}
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {permissions.map((permission) => (
                <Chip key={permission}>{t(`extensions.permission.${permission}`)}</Chip>
              ))}
            </div>
          )}
        </Section>
      </div>
      <div className="flex h-16 shrink-0 items-center justify-end gap-2 border-t border-border px-6">
        <DialogClose render={<Button variant="ghost" />}>
          {t("extensions.action.close")}
        </DialogClose>
        {primary === "update" && entry.stored && onUninstall !== undefined ? (
          <Button
            className={`px-3 ${destructive}`}
            variant="outline"
            disabled={busy}
            onClick={() => run(() => onUninstall(entry))}
          >
            <Trash2Icon />
            {t("extensions.action.uninstall")}
          </Button>
        ) : null}
        {primary === null ? null : (
          <Button
            className={
              primary === "update"
                ? `px-3 ${warning}`
                : primary === "uninstall"
                  ? `px-3 ${destructive}`
                  : primary === "disable"
                    ? `px-3 text-secondary-foreground hover:bg-muted hover:text-foreground ${outline}`
                    : "px-3"
            }
            variant={
              primary === "update" ||
              primary === "uninstall" ||
              primary === "disable"
                ? "outline"
                : "default"
            }
            disabled={busy || entry.status === "activating"}
            data-testid="extension-action"
            onClick={runPrimary}
          >
            {primary === "uninstall" ? (
              <Trash2Icon />
            ) : primary === "disable" || primary === "enable" ? (
              <PowerIcon />
            ) : (
              <DownloadIcon />
            )}
            {actionLabel}
          </Button>
        )}
      </div>
    </>
  )
}

/** Detail dialog for one extension; opens from a catalog row. */
export function ExtensionDetailDialog({
  entry,
  market = null,
  installed = false,
  update = null,
  onInstall,
  onUninstall,
  onOpenChange,
}: {
  entry: ExtensionView | null
  /** The market entry behind this row, when the page merged one in. */
  market?: MarketEntry | null
  /** Whether the kernel already holds this id. */
  installed?: boolean
  /** A newer listing for this installed plugin, if the market has one. */
  update?: MarketUpdateEntry | null
  onInstall?: (
    plugin: MarketEntry["plugin"],
    version: NonNullable<MarketEntry["version"]>
  ) => Promise<void>
  onUninstall?: (entry: ExtensionView) => Promise<void>
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex w-[640px] flex-col gap-0 rounded-lg bg-dialog p-0 shadow-[0_24px_56px_#0F172A3D] ring-glass-border backdrop-blur-xl sm:max-w-[640px]"
      >
        {entry ? (
          <ExtensionDetailBody
            key={entry.manifest.id}
            entry={entry}
            market={market}
            installed={installed}
            update={update}
            onInstall={onInstall}
            onUninstall={onUninstall}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
