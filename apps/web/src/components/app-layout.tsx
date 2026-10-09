import * as React from "react"
import { Outlet } from "react-router"

import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"

import { AppHeader } from "@/components/app-header"
import { AppSidebar } from "@/components/app-sidebar"
import { SearchPalette } from "@/components/search-palette"

export function AppLayout() {
  const [searchOpen, setSearchOpen] = React.useState(false)
  const closeSearch = React.useCallback(() => setSearchOpen(false), [])

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setSearchOpen((open) => !open)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <AppHeader onOpenSearch={() => setSearchOpen(true)} />
        <div className="flex flex-1 flex-col gap-6 p-6">
          <Outlet />
        </div>
      </SidebarInset>
      {searchOpen ? <SearchPalette onClose={closeSearch} /> : null}
    </SidebarProvider>
  )
}
