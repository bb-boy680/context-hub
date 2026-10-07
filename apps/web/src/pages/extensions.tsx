/**
 * Extensions page: the catalog of packages that extend Context Hub itself —
 * agent integrations and language packs — with install, enablement, and a
 * detail dialog per entry.
 */
import { SearchIcon } from "lucide-react"
import * as React from "react"

import { ExtensionDetailDialog } from "@/components/extension-detail-dialog"
import { categoryOrder, categoryTile } from "@/lib/extensions"
import type { ExtensionView } from "@workspace/extensions"
import {
  useExtensionSnapshot,
  useHub,
  useI18n,
} from "@workspace/extensions/react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

const outline = "border-border bg-transparent dark:border-input dark:bg-transparent"

/* Glass card per section, matching the design's `$card` + `$glass-border` surface. */
const cardSurface =
  "rounded-lg bg-card p-5 ring-1 ring-glass-border shadow-glass backdrop-blur-glass"

function matches(entry: ExtensionView, query: string): boolean {
  if (query === "") return true
  const haystack =
    `${entry.manifest.name} ${entry.manifest.id} ${entry.manifest.description}`.toLowerCase()
  return haystack.includes(query.toLowerCase())
}

function ExtensionRow({
  entry,
  onOpen,
}: {
  entry: ExtensionView
  onOpen: () => void
}) {
  const { t } = useI18n()
  const ctx = useHub()
  const { manifest, enabled, status } = entry
  const Icon = manifest.icon

  return (
    <div className="flex h-[64px] items-center gap-3 rounded-md px-3 transition-colors hover:bg-accent/40">
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
            {manifest.name}
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
            {manifest.description}
          </span>
        </span>
      </button>
      {manifest.locked === true || status === "incompatible" ? null : (
        <ExtensionActionButton
          entry={entry}
          onAction={() => void ctx.extensions.toggle(manifest.id, !enabled)}
        />
      )}
    </div>
  )
}

/** Installed extensions offer Uninstall; the rest offer Install. */
function ExtensionActionButton({
  entry,
  onAction,
}: {
  entry: ExtensionView
  onAction: () => void
}) {
  const { t } = useI18n()
  const { enabled, status } = entry

  return (
    <Button
      type="button"
      size="default"
      variant={enabled ? "outline" : "default"}
      disabled={status === "activating"}
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
  const { t, state, setLocale } = useI18n()
  const snapshot = useExtensionSnapshot()
  const [query, setQuery] = React.useState("")
  const [detailId, setDetailId] = React.useState<string | null>(null)

  const entries = snapshot.entries.filter((entry) => matches(entry, query))
  const detail =
    snapshot.entries.find((entry) => entry.manifest.id === detailId) ?? null

  return (
    <>
      <div className="flex items-start justify-between gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{t("extensions.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("extensions.description")}
          </p>
        </div>
        {state.locales.length > 1 ? (
          <Select
            value={
              state.locales.find((locale) => locale.id === state.active)?.label ??
              state.active
            }
            onValueChange={(label) => {
              const locale = state.locales.find((item) => item.label === label)
              if (locale !== undefined) setLocale(locale.id)
            }}
          >
            <SelectTrigger
              className={`w-[150px] data-[size=default]:h-9 ${outline}`}
              aria-label={t("extensions.language")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {state.locales.map((locale) => (
                <SelectItem key={locale.id} value={locale.label}>
                  {locale.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <div className="flex flex-col gap-6">
        <label className="relative flex w-[320px] items-center">
          <SearchIcon className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("extensions.searchPlaceholder")}
            className="h-9 pl-9"
          />
        </label>

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
                {items.map((entry) => (
                  <ExtensionRow
                    key={entry.manifest.id}
                    entry={entry}
                    onOpen={() => setDetailId(entry.manifest.id)}
                  />
                ))}
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
        onOpenChange={(open) => {
          if (!open) setDetailId(null)
        }}
      />
    </>
  )
}
