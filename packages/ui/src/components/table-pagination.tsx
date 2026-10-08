import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

const outline = "border-input bg-transparent dark:bg-transparent"

/** Rows-per-page choices a wired pager offers. */
const PAGE_SIZE_CHOICES = [12, 24, 48]

/** Rows-per-page control plus a first/prev/next/last pager, shared by every collection footer. */
export function TablePagination({
  pageText,
  label = "Rows per page",
  compact = false,
  pageSize,
  onPageSizeChange,
  onFirst,
  onPrev,
  onNext,
  onLast,
  canPrev = false,
  canNext = false,
}: {
  pageText: string
  /* Localized caption and accessible name; the primitive ships no copy of its own. */
  label?: string
  /* Grid footers keep only the page text and the two step arrows. */
  compact?: boolean
  /* Supplying the handlers wires the pager to real data; without them it is a static mock. */
  pageSize?: number
  onPageSizeChange?: (size: number) => void
  onFirst?: () => void
  onPrev?: () => void
  onNext?: () => void
  onLast?: () => void
  canPrev?: boolean
  canNext?: boolean
}) {
  const wired = onNext !== undefined || onPrev !== undefined
  return (
    <div className="flex items-center gap-4">
      {compact ? null : (
        <>
          <span className="text-caption text-muted-foreground">{label}</span>
          <Select
            value={String(pageSize ?? 12)}
            onValueChange={(value) => onPageSizeChange?.(Number(value))}
            disabled={onPageSizeChange === undefined}
          >
            <SelectTrigger className="w-[100px]" aria-label={label}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(pageSize === undefined ? [12, 24, 48] : PAGE_SIZE_CHOICES).map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}
      <span className="text-caption text-muted-foreground">{pageText}</span>
      <div className="flex items-center gap-1">
        {compact ? null : (
          <Button
            variant="outline"
            size="icon"
            className={outline}
            disabled={!wired || !canPrev}
            onClick={onFirst}
          >
            <ChevronsLeftIcon />
          </Button>
        )}
        <Button
          variant="outline"
          size="icon"
          className={outline}
          disabled={!wired || !canPrev}
          onClick={onPrev}
        >
          <ChevronLeftIcon />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className={outline}
          disabled={wired && !canNext}
          onClick={onNext}
        >
          <ChevronRightIcon />
        </Button>
        {compact ? null : (
          <Button
            variant="outline"
            size="icon"
            className={outline}
            disabled={wired && !canNext}
            onClick={onLast}
          >
            <ChevronsRightIcon />
          </Button>
        )}
      </div>
    </div>
  )
}
