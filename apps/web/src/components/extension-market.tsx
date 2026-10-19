/**
 * The market source control on the Extensions page.
 *
 * The market's plugins are listed in the page's own categories, so this is the
 * only market-specific UI: where the index comes from, and when to re-read it.
 */
import { RefreshCwIcon } from "lucide-react"
import * as React from "react"

import { isMarketSource } from "@context-hub/core/extension-market"
import { useI18n, useSettings } from "@context-hub/extensions/react"
import { Button } from "@context-hub/shadcn-ui/components/button"
import { Input } from "@context-hub/shadcn-ui/components/input"

const outline = "border-border bg-transparent dark:border-input dark:bg-transparent"

export function MarketSourceBar({
  url,
  loading,
  failure,
  onRefresh,
}: {
  url: string
  loading: boolean
  failure: string | null
  onRefresh: () => void
}) {
  const { t } = useI18n()
  const settings = useSettings()
  const [invalid, setInvalid] = React.useState(false)

  const submit = (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()
    const typed = String(new FormData(event.currentTarget).get("url") ?? "")
    try {
      const next = typed.trim() === "" ? "" : isMarketSource(typed)
      setInvalid(false)
      settings.set({ extensionMarketUrl: next })
    } catch {
      setInvalid(true)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <form className="flex flex-wrap items-center gap-2" onSubmit={submit}>
        <Input
          key={url}
          id="extension-market-source"
          name="url"
          type="text"
          defaultValue={url}
          aria-label={t("extensions.market.sourceLabel")}
          placeholder={t("extensions.market.sourcePlaceholder")}
          className="h-9 w-[320px]"
        />
        <Button type="submit" variant="outline" className={`px-3 ${outline}`}>
          {t("extensions.market.sourceSave")}
        </Button>
        {url === "" ? null : (
          <Button
            type="button"
            variant="outline"
            className={`px-3 ${outline}`}
            disabled={loading}
            onClick={onRefresh}
          >
            <RefreshCwIcon />
            {t("extensions.market.refresh")}
          </Button>
        )}
      </form>
      {invalid ? (
        <p className="text-[12px] text-destructive">
          {t("extensions.market.sourceInvalid")}
        </p>
      ) : null}
      {failure === null ? null : (
        <p className="text-[12px] text-destructive">
          {t("extensions.market.failed").replace("{reason}", failure)}
        </p>
      )}
    </div>
  )
}
