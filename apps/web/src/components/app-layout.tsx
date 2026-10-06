import * as React from "react"
import { Outlet } from "react-router"

import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"

import { AppHeader } from "@/components/app-header"
import { AppSidebar } from "@/components/app-sidebar"
import { SearchPalette } from "@/components/search-palette"

const blobs = [
  "left-[280px] -top-[140px] size-[460px] bg-blob-blue",
  "left-[920px] top-[160px] size-[420px] bg-blob-violet",
  "left-[120px] top-[720px] size-[380px] bg-blob-pink",
]

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
    <SidebarProvider className="relative">
      <div
        aria-hidden
        className="app-background pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        {blobs.map((blob) => (
          <div
            key={blob}
            className={`absolute rounded-full blur-blob ${blob}`}
          />
        ))}
      </div>
      <AppSidebar />
      <SidebarInset className="relative z-10 min-w-0 bg-transparent">
        <AppHeader onOpenSearch={() => setSearchOpen(true)} />
        <div className="flex flex-1 flex-col gap-6 p-6">
          <Outlet />
        </div>
      </SidebarInset>
      {searchOpen ? <SearchPalette onClose={closeSearch} /> : null}
    </SidebarProvider>
  )
}
