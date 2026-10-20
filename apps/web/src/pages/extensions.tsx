/**
 * Extensions page: the catalog of packages that extend Context Hub itself —
 * installed agent integrations and language packs, plus the ones a configured
 * market lists but this machine does not have yet.
 *
 * Market entries are shaped like catalog rows and take part in the same
 * categories, the same search, the same detail dialog and the same action
 * button. Installing one writes its files, loads the module and registers it in
 * the live kernel, so the row updates without a reload.
 */
import { RefreshCwIcon, SearchIcon } from "lucide-react"
import * as React from "react"

import { ExtensionDetailDialog } from "@/components/extension-detail-dialog"
import {
  installMarketExtension,
  marketEntriesFor,
  marketUpdatesFor,
  useExtensionMarket,
  type MarketEntry,
  type MarketUpdateEntry,
} from "@/lib/extension-market"
import { cardSurface, categoryOrder, categoryTile } from "@/lib/extensions"
import { runExtensionCheck } from "@/lib/extension-updates"
import {
  compatibleVersion,
  type ExtensionMarketPlugin,
  type ExtensionMarketVersion,
} from "@context-hub/core/extension-market"
import {
  createRemoteExtensionMarket,
  localized,
  OFFICIAL_MARKET_URL,
  type ExtensionView,
} from "@context-hub/extensions"
import {
  useExtensionSnapshot,
  useHub,
  useI18n,
  useSearchPage,
} from "@context-hub/extensions/react"
import { Highlighted } from "@context-hub/extensions/components"
import { Badge } from "@context-hub/shadcn-ui/components/badge"
import { Button } from "@context-hub/shadcn-ui/components/button"
import { Input } from "@context-hub/shadcn-ui/components/input"
import { toast } from "@context-hub/shadcn-ui/components/toast"

const outline = "border-border bg-transparent dark:border-input dark:bg-transparent"

const marketClient = createRemoteExtensionMarket()

function matches(entry: ExtensionView, query: string, locale: string): boolean {
  if (query === "") return true
  const haystack =
    `${localized(entry.manifest.name, locale)} ${entry.manifest.id} ${localized(entry.manifest.description, locale)}`.toLowerCase()
  return haystack.includes(query.toLowerCase())
}

/** The one action a catalog row offers, in priority order. */
type RowAction = "update" | "install" | "uninstall" | "disable" | "enable"

function actionOf(
  entry: ExtensionView,
  update: MarketUpdateEntry | null,
  remote: MarketEntry | undefined
): RowAction | null {
  if (update !== null && update.target !== null) return "update"
  /* A listed plugin this hub cannot run has nothing to offer; an installed one
     keeps its row so it can still be removed. */
  if (remote !== undefined) return remote.version === null ? null : "install"
  if (entry.status === "incompatible" && !entry.stored) return null
  if (entry.enabled) return entry.stored ? "uninstall" : "disable"
  return entry.stored ? "uninstall" : "enable"
}

function ExtensionRow({
  entry,
  update,
  action,
  needle,
  busy,
  onOpen,
  onAction,
}: {
  entry: ExtensionView
  update: MarketUpdateEntry | null
  action: RowAction | null
  /** What the filter box holds, marked in the fields it matched. */
  needle: string
  /** True while this row's action is in flight. */
  busy: boolean
  onOpen: () => void
  onAction: () => void
}) {
  const { t, state: i18n } = useI18n()
  const { manifest, status } = entry
  const Icon = manifest.icon
  const name = localized(manifest.name, i18n.active)
  const description = localized(manifest.description, i18n.active)
  const updateAvailable = update !== null && update.target !== null
  const updateBlocked = update !== null && update.target === null

  return (
    <div
      data-testid={`extension-${manifest.id}`}
      className="flex h-[64px] items-center gap-3 rounded-md px-3 transition-colors hover:bg-accent/40"
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-[10px] ${categoryTile[manifest.category]}`}
        >
          <Icon className="size-5 text-secondary-foreground" />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-2 text-sm leading-5 font-medium">
            <Highlighted text={name} needle={needle} />
            {manifest.locked === true ? (
              <Badge variant="secondary">{t("extensions.status.builtin")}</Badge>
            ) : null}
            {updateAvailable ? (
              <Badge>{t("extensions.market.updateAvailable")}</Badge>
            ) : null}
            {updateBlocked || (status === "incompatible" && !updateAvailable) ? (
              <Badge variant="destructive">
                {t("extensions.status.incompatible")}
              </Badge>
            ) : null}
            {status === "error" ? (
              <Badge variant="destructive">{t("extensions.status.error")}</Badge>
            ) : null}
            {status === "waiting" ? (
              <Badge variant="secondary">
                {t("extensions.status.waiting")}
              </Badge>
            ) : null}
          </span>
          <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
            <Highlighted text={description} needle={needle} />
          </span>
        </span>
      </button>
      {action === null ? null : (
        <ExtensionActionButton action={action} busy={busy} onAction={onAction} />
      )}
    </div>
  )
}

const ACTION_LABEL: Record<RowAction, string> = {
  update: "extensions.market.update",
  install: "extensions.action.install",
  uninstall: "extensions.action.uninstall",
  disable: "extensions.action.disable",
  enable: "extensions.action.enable",
}

/** The row's one button; which action it runs is decided by {@link actionOf}. */
function ExtensionActionButton({
  action,
  busy,
  onAction,
}: {
  action: RowAction
  busy: boolean
  onAction: () => void
}) {
  const { t } = useI18n()
  const secondary = action === "uninstall" || action === "disable"
  const label = t(ACTION_LABEL[action])

  return (
    <Button
      type="button"
      size="default"
      variant={secondary ? "outline" : "default"}
      disabled={busy}
      aria-label={label}
      onClick={onAction}
      className={
        secondary
          ? `px-3 ${outline} text-secondary-foreground hover:bg-muted hover:text-foreground`
          : "px-3"
      }
    >
      {label}
    </Button>
  )
}

export function ExtensionsPage() {
  const { t, state: i18n } = useI18n()
  const ctx = useHub()
  const snapshot = useExtensionSnapshot()
  const search = useSearchPage()
  const query = search.query
  const setQuery = search.setQuery
  const [detailId, setDetailId] = React.useState<string | null>(null)
  const [installing, setInstalling] = React.useState<string | null>(null)
  const [checking, setChecking] = React.useState(false)

  const market = useExtensionMarket(OFFICIAL_MARKET_URL)
  const updates =
    market.index === null
      ? new Map<string, MarketUpdateEntry>()
      : marketUpdatesFor(snapshot.entries, market.index, ctx.host.version)
  const marketEntries =
    market.index === null
      ? []
      : marketEntriesFor(snapshot.entries, market.index, ctx.host.version)
  const allEntries = [
    ...snapshot.entries,
    ...marketEntries.map((item) => item.view),
  ]
  const entries = allEntries.filter((entry) =>
    matches(entry, query, i18n.active)
  )
  const needle = query.trim()
  const detail =
    allEntries.find((entry) => entry.manifest.id === detailId) ?? null

  /* A market read failure is reported once, through the same toast channel as
     every other failure on this page, rather than as a line above the list. */
  const lastFailure = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (market.failure === null) {
      lastFailure.current = null
      return
    }
    if (lastFailure.current === market.failure) return
    lastFailure.current = market.failure
    toast.add({
      type: "error",
      title: t("extensions.market.failed").replace("{reason}", market.failure),
    })
  }, [market.failure, t])

  /* Keep the origin block even after the install makes the market row disappear. */
  const detailMarket: MarketEntry | null = (() => {
    if (market.index === null || detailId === null || detail === null) return null
    const plugin = market.index.plugins.find((item) => item.id === detailId)
    if (plugin === undefined) return null
    return { plugin, version: compatibleVersion(plugin, ctx.host.version), view: detail }
  })()
  const detailUpdate = detailId === null ? null : (updates.get(detailId) ?? null)
  const detailInstalled =
    detail !== null &&
    snapshot.entries.some((entry) => entry.manifest.id === detail.manifest.id)

  const install = React.useCallback(
    async (
      plugin: ExtensionMarketPlugin,
      version: ExtensionMarketVersion
    ): Promise<void> => {
      setInstalling(plugin.id)
      try {
        const result = await installMarketExtension({
          ctx,
          plugin,
          version,
          hubVersion: ctx.host.version,
        })
        toast.add({
          type: "success",
          title: t(
            result.fresh
              ? "extensions.market.installedNotice"
              : "extensions.market.updatedNotice"
          ).replace("{name}", localized(plugin.title, i18n.active)),
        })
      } catch (reason) {
        toast.add({
          type: "error",
          title: reason instanceof Error ? reason.message : String(reason),
        })
      } finally {
        setInstalling(null)
      }
    },
    [ctx, t, i18n.active]
  )

  /**
   * Remove one extension from this machine, or switch a built-in off.
   *
   * A stored package stops first, then loses its files, then its catalog row:
   * a failed deletion leaves it installed and disabled rather than running code
   * whose files are gone.
   */
  const uninstall = React.useCallback(
    async (entry: ExtensionView): Promise<void> => {
      const id = entry.manifest.id
      setInstalling(id)
      try {
        if (entry.enabled) await ctx.extensions.disable(id)
        if (!entry.stored) return
        await marketClient.remove(id)
        await ctx.extensions.remove(id)
        toast.add({
          type: "success",
          title: t("extensions.market.removedNotice").replace(
            "{name}",
            localized(entry.manifest.name, i18n.active)
          ),
        })
      } catch (reason) {
        toast.add({
          type: "error",
          title: reason instanceof Error ? reason.message : String(reason),
        })
      } finally {
        setInstalling(null)
      }
    },
    [ctx, t, i18n.active]
  )

  const runAction = (
    entry: ExtensionView,
    action: RowAction | null,
    update: MarketUpdateEntry | null,
    remote: MarketEntry | undefined
  ): void => {
    if (action === "update" && update !== null && update.target !== null) {
      void install(update.plugin, update.target)
      return
    }
    if (action === "install" && remote !== undefined && remote.version !== null) {
      void install(remote.plugin, remote.version)
      return
    }
    if (action === "uninstall" || action === "disable") {
      void uninstall(entry)
      return
    }
    if (action === "enable") {
      void ctx.extensions.enable(entry.manifest.id).catch((reason: unknown) => {
        toast.add({
          type: "error",
          title: reason instanceof Error ? reason.message : String(reason),
        })
      })
    }
  }

  /** Read the market now; auto-update, when on, installs what it finds. */
  const check = async (): Promise<void> => {
    setChecking(true)
    try {
      const outcome = await runExtensionCheck(ctx)
      toast.add({
        type: outcome.failed.length > 0 ? "error" : "success",
        title: t("extensions.market.checked")
          .replace("{checked}", String(outcome.checked))
          .replace("{updated}", String(outcome.updated.length))
          .replace("{failed}", String(outcome.failed.length)),
      })
      for (const failure of outcome.failed) {
        toast.add({ type: "error", title: `${failure.name}: ${failure.reason}` })
      }
    } catch (reason) {
      toast.add({
        type: "error",
        title: t("extensions.market.checkFailed").replace(
          "{reason}",
          reason instanceof Error ? reason.message : String(reason)
        ),
      })
    } finally {
      setChecking(false)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("extensions.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("extensions.description")}
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-start gap-3">
            <label className="relative flex w-[320px] items-center">
              <SearchIcon className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("extensions.searchPlaceholder")}
                className="h-9 pl-9"
              />
            </label>
            <Button
              type="button"
              variant="outline"
              className={`h-9 px-3 text-secondary-foreground hover:bg-muted hover:text-foreground ${outline}`}
              disabled={checking}
              onClick={() => void check()}
            >
              <RefreshCwIcon className={checking ? "animate-spin" : undefined} />
              {t("extensions.market.check")}
            </Button>
          </div>
        </div>

        {categoryOrder.map((category) => {
          const items = entries.filter(
            (entry) => entry.manifest.category === category
          )
          if (items.length === 0) return null
          return (
            <section
              key={category}
              className={`flex flex-col gap-4 ${cardSurface}`}
            >
              <div className="flex flex-col gap-1">
                <h2 className="text-base leading-5 font-semibold">
                  {t(`extensions.category.${category}`)}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t(`extensions.category.${category}.description`)}
                </p>
              </div>
              <div className="grid gap-x-10 gap-y-2 lg:grid-cols-2">
                {items.map((entry) => {
                  const remote = marketEntries.find(
                    (item) => item.plugin.id === entry.manifest.id
                  )
                  const update = updates.get(entry.manifest.id) ?? null
                  const action = actionOf(entry, update, remote)
                  return (
                    <ExtensionRow
                      key={entry.manifest.id}
                      entry={entry}
                      update={update}
                      action={action}
                      needle={needle}
                      busy={installing === entry.manifest.id}
                      onOpen={() => setDetailId(entry.manifest.id)}
                      onAction={() => runAction(entry, action, update, remote)}
                    />
                  )
                })}
              </div>
            </section>
          )
        })}

        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("extensions.empty")}</p>
        ) : null}
      </div>

      <ExtensionDetailDialog
        entry={detail}
        market={detailMarket}
        update={detailUpdate}
        installed={detailInstalled}
        onInstall={install}
        onUninstall={uninstall}
        onOpenChange={(open) => {
          if (!open) setDetailId(null)
        }}
      />
    </>
  )
}
