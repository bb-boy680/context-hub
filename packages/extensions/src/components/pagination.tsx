/**
 * The foot of one collection: how many rows a page holds, which page is on
 * screen, and the four ways through the pages.
 *
 * Supplying the handlers wires the pager to real data; without them the control
 * still draws, disabled, which is how a screen whose data is still sample-sized
 * keeps the footer's geometry. The caption and the page text are the caller's,
 * since the primitive ships no copy of its own.
 */
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react"

import { Button } from "@context-hub/shadcn-ui/components/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@context-hub/shadcn-ui/components/select"

const outline = "border-input bg-transparent dark:bg-transparent"

/** Rows-per-page choices a wired pager offers. */
const PAGE_SIZE_CHOICES = [12, 24, 48]

/**
 * Rows-per-page control plus a first/prev/next/last pager.
 *
 * @param pageText — which page is shown, already formatted, e.g. `2 / 5`.
 * @param label — the rows-per-page caption, which is also the select's
 * accessible name.
 * @param compact — keeps only the page text and the two step arrows.
 * @param pageSize — the rows a page holds; omitting it leaves the select.
 * @param onPageSizeChange — picks a new page size; omitting it disables the select.
 * @param onFirst / onPrev / onNext / onLast — the page the person asked for.
 * @param canPrev / canNext — whether a page sits before or after this one.
 */
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
  label?: string
  compact?: boolean
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
              {PAGE_SIZE_CHOICES.map((size) => (
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
