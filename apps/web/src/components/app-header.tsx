import { SearchIcon } from "lucide-react"
import { useLocation } from "react-router"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@context-hub/shadcn-ui/components/breadcrumb"
import { Kbd } from "@context-hub/shadcn-ui/components/kbd"
import { SidebarTrigger } from "@context-hub/shadcn-ui/components/sidebar"

import { ThemeToggle } from "@/components/theme-toggle"
import { useNavItem } from "@/lib/navigation"
import { useContributions, useI18n } from "@context-hub/extensions/react"

export function AppHeader({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { pathname } = useLocation()
  const { t } = useI18n()
  const page = useNavItem(pathname)?.labelKey
  const contributions = useContributions("header")
  /* Catalog order breaks ties; sort is stable, so equal orders keep it. */
  const headerItems = [...contributions].sort((a, b) => a.order - b.order)

  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-4 border-b border-border bg-header px-6">
      <SidebarTrigger className="-ml-2 md:hidden" />
      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink>{t("header.workspace")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{page ? t(page) : null}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <button
        type="button"
        onClick={onOpenSearch}
        className="hidden h-11 w-[280px] shrink-0 items-center gap-2 rounded-full bg-secondary px-5 text-[length:var(--text-body)] text-muted-foreground transition-colors hover:text-foreground lg:flex"
      >
        <SearchIcon className="size-[15px]" />
        <span>{t("header.search")}</span>
        <Kbd className="ml-auto border-0 bg-transparent">Ctrl K</Kbd>
      </button>
      {headerItems.map((item, index) => {
        const Component = item.Component
        return <Component key={`${item.id}:${index}`} />
      })}
      <ThemeToggle />
    </header>
  )
}
