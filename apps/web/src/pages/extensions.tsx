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
import { SearchIcon } from "lucide-react"
import * as React from "react"

import { ExtensionDetailDialog } from "@/components/extension-detail-dialog"
import {
  marketEntriesFor,
  useExtensionMarket,
  type MarketEntry,
} from "@/lib/extension-market"
import { cardSurface, categoryOrder, categoryTile } from "@/lib/extensions"
import { recommendedVersion } from "@context-hub/core/extension-market"
import {
  createRemoteExtensionMarket,
  createRemotePluginSource,
  discoverPlugins,
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

function ExtensionRow({
  entry,
  needle,
  busy,
  onOpen,
  onAction,
}: {
  entry: ExtensionView
  /** What the filter box holds, marked in the fields it matched. */
  needle: string
  /** True while this row's install is in flight. */
  busy: boolean
  onOpen: () => void
  onAction: () => void
}) {
  const { t, state: i18n } = useI18n()
  const { manifest, status } = entry
  const Icon = manifest.icon
  const name = localized(manifest.name, i18n.active)
  const description = localized(manifest.description, i18n.active)

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
            {status === "error" ? (
              <Badge variant="destructive">{t("extensions.status.error")}</Badge>
            ) : null}
            {status === "incompatible" ? (
              <Badge variant="destructive">
                {t("extensions.status.incompatible")}
              </Badge>
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
      {manifest.locked === true || status === "incompatible" ? null : (
        <ExtensionActionButton entry={entry} busy={busy} onAction={onAction} />
      )}
    </div>
  )
}

/** Installed extensions offer Uninstall; the rest offer Install. */
function ExtensionActionButton({
  entry,
  busy,
  onAction,
}: {
  entry: ExtensionView
  busy: boolean
  onAction: () => void
}) {
  const { t } = useI18n()
  const { enabled, status } = entry

  return (
    <Button
      type="button"
      size="default"
      variant={enabled ? "outline" : "default"}
      disabled={busy || status === "activating"}
      aria-label={t(
        enabled ? "extensions.action.uninstall" : "extensions.action.install"
      )}
      onClick={onAction}
      className={
        enabled
          ? `px-3 ${outline} text-secondary-foreground hover:bg-muted hover:text-foreground`
          : "px-3"
      }
    >
      {t(enabled ? "extensions.action.uninstall" : "extensions.action.install")}
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

  const market = useExtensionMarket(OFFICIAL_MARKET_URL)
  const marketEntries =
    market.index === null
      ? []
      : marketEntriesFor(snapshot.entries, market.index)
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

  /* Keep the origin block even after the install makes the market row disappear. */
  const detailMarket: MarketEntry | null = (() => {
    if (market.index === null || detailId === null || detail === null) return null
    const plugin = market.index.plugins.find((item) => item.id === detailId)
    if (plugin === undefined) return null
    return { plugin, version: recommendedVersion(plugin), view: detail }
  })()

  const install = React.useCallback(
    async (item: MarketEntry): Promise<void> => {
      setInstalling(item.plugin.id)
      try {
        await marketClient.install(
          OFFICIAL_MARKET_URL,
          item.plugin.id,
          item.version.version
        )
        const found = await discoverPlugins({
          source: createRemotePluginSource(),
          /* A fresh URL bypasses the module cache, so a reinstall runs the new file. */
          importModule: async (url) =>
            import(/* @vite-ignore */ `${url}?t=${String(Date.now())}`),
          ids: [item.plugin.id],
        })
        const loaded = found.find((entry) => entry.id === item.plugin.id)
        if (loaded?.module === undefined) {
          throw new Error(
            loaded?.problem ??
              `the installed extension "${item.plugin.id}" could not be loaded`
          )
        }
        await ctx.extensions.add(loaded.module)
        toast.add({
          type: "success",
          title: t("extensions.market.installedNotice").replace(
            "{name}",
            localized(item.view.manifest.name, i18n.active)
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
          </div>
          {market.failure === null ? null : (
            <p className="text-[12px] text-destructive">
              {t("extensions.market.failed").replace("{reason}", market.failure)}
            </p>
          )}
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
                  return (
                    <ExtensionRow
                      key={entry.manifest.id}
                      entry={entry}
                      needle={needle}
                      busy={installing === entry.manifest.id}
                      onOpen={() => setDetailId(entry.manifest.id)}
                      onAction={
                        remote === undefined
                          ? () =>
                              void ctx.extensions.toggle(
                                entry.manifest.id,
                                !entry.enabled
                              )
                          : () => void install(remote)
                      }
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
        onInstall={install}
        onOpenChange={(open) => {
          if (!open) setDetailId(null)
        }}
      />
    </>
  )
}
