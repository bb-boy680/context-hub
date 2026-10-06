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

/** Rows-per-page control plus a first/prev/next/last pager, shared by every collection footer. */
export function TablePagination({
  pageText,
  compact = false,
}: {
  pageText: string
  /* Grid footers keep only the page text and the two step arrows. */
  compact?: boolean
}) {
  return (
    <div className="flex items-center gap-4">
      {compact ? null : (
        <>
          <span className="text-caption text-muted-foreground">
            Rows per page
          </span>
          <Select defaultValue="12">
            <SelectTrigger className="w-[100px]" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="12">12</SelectItem>
              <SelectItem value="24">24</SelectItem>
              <SelectItem value="48">48</SelectItem>
            </SelectContent>
          </Select>
        </>
      )}
      <span className="text-caption text-muted-foreground">{pageText}</span>
      <div className="flex items-center gap-1">
        {compact ? null : (
          <Button variant="outline" size="icon" disabled className={outline}>
            <ChevronsLeftIcon />
          </Button>
        )}
        <Button variant="outline" size="icon" disabled className={outline}>
          <ChevronLeftIcon />
        </Button>
        <Button variant="outline" size="icon" className={outline}>
          <ChevronRightIcon />
        </Button>
        {compact ? null : (
          <Button variant="outline" size="icon" className={outline}>
            <ChevronsRightIcon />
          </Button>
        )}
      </div>
    </div>
  )
}
