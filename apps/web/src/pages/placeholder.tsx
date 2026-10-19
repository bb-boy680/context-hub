import { useLocation } from "react-router"

import { useNavItem } from "@/lib/navigation"
import { useI18n } from "@context-hub/extensions/react"

/** Route target for sections that are not designed yet. */
export function PlaceholderPage() {
  const { pathname } = useLocation()
  const { t } = useI18n()
  const labelKey = useNavItem(pathname)?.labelKey

  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{labelKey ? t(labelKey) : null}</h1>
        <p className="text-sm text-muted-foreground">
          This section has no design yet.
        </p>
      </div>
    </div>
  )
}
