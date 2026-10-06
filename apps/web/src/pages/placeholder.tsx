import { useLocation } from "react-router"

import { findNavItem } from "@/lib/navigation"

/** Route target for sections that are not designed yet. */
export function PlaceholderPage() {
  const { pathname } = useLocation()
  const title = findNavItem(pathname)?.title ?? "Not found"

  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">
          This section has no design yet.
        </p>
      </div>
    </div>
  )
}
