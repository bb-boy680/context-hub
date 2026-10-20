/**
 * The shell around every page: the fixed rail, the header, and the page body.
 *
 * Nothing here knows about search. The search control is a header contribution
 * from its own extension, so the shell only has to offer the slot.
 */
import type * as React from "react"
import { Outlet } from "react-router"

import { SidebarInset, SidebarProvider } from "@context-hub/shadcn-ui/components/sidebar"

import { AppHeader } from "@/components/app-header"
import { AppSidebar } from "@/components/app-sidebar"
import { DesktopMenuActions } from "@/components/desktop-menu-actions"

export function AppLayout() {
  return (
    /* The design fixes the rail at 248px, which is what every page's 1192px
       content column is measured against. The top padding is the desktop
       shell's title bar; it is 0 in a plain browser. */
    <SidebarProvider
      className="pt-[var(--context-hub-titlebar-height,0px)]"
      style={{ "--sidebar-width": "248px" } as React.CSSProperties}
    >
      <DesktopMenuActions />
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <AppHeader />
        <div className="flex flex-1 flex-col gap-6 p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
