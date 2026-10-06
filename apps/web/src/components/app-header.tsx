import { GitForkIcon, RefreshCwIcon, SearchIcon } from "lucide-react"
import { useLocation } from "react-router"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb"
import { Button } from "@workspace/ui/components/button"
import { Kbd } from "@workspace/ui/components/kbd"
import { SidebarTrigger } from "@workspace/ui/components/sidebar"

import { ThemeToggle } from "@/components/theme-toggle"
import { findNavItem } from "@/lib/navigation"

/** Changes waiting to leave the workspace; mirrored on the Repository page. */
const pendingChanges = 3

export function AppHeader({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { pathname } = useLocation()
  const page = findNavItem(pathname)?.title ?? "Overview"

  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-4 border-b border-glass-border bg-header px-6 backdrop-blur-header">
      <SidebarTrigger className="-ml-2 md:hidden" />
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink>Workspace</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{page}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <button
        type="button"
        onClick={onOpenSearch}
        className="hidden h-9 w-[260px] shrink-0 items-center gap-2 rounded-md border border-input px-3 text-body text-muted-foreground transition-colors hover:bg-accent/60 lg:flex"
      >
        <SearchIcon className="size-[15px]" />
        <span>Search context</span>
        <Kbd className="ml-auto">Ctrl K</Kbd>
      </button>
      <Button
        size="lg"
        variant="outline"
        className="hidden border-input bg-transparent px-3.5 lg:inline-flex dark:bg-transparent"
      >
        <GitForkIcon />
        Connect repo
      </Button>
      <Button size="lg" className="px-3.5">
        <RefreshCwIcon />
        Sync repo
        <span className="ml-1 inline-flex h-[18px] min-w-[19px] items-center justify-center rounded-full bg-primary-foreground px-1 text-[11px] font-semibold text-primary">
          {pendingChanges}
        </span>
      </Button>
      <ThemeToggle />
    </header>
  )
}
