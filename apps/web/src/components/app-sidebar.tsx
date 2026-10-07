import * as React from "react"
import { ChevronsUpDownIcon, WaypointsIcon } from "lucide-react"
import { Link, useLocation } from "react-router"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"

import { navGroups } from "@/lib/navigation"
import { useI18n } from "@workspace/extensions/react"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { pathname } = useLocation()
  const { t } = useI18n()

  return (
    <Sidebar className="border-sidebar-border backdrop-blur-glass" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link to="/" />}>
              <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <WaypointsIcon className="size-4" />
              </div>
              <div className="grid flex-1 text-left leading-none">
                <span className="text-sm font-medium">Context Hub</span>
                <span className="mt-0.5 text-xs text-muted-foreground">
                  dsh-context-hub
                </span>
              </div>
              <ChevronsUpDownIcon className="ml-auto text-muted-foreground" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="gap-4 p-2">
        {navGroups.map((group) => (
          <SidebarGroup key={group.labelKey} className="gap-0.5 p-0">
            <SidebarGroupLabel className="text-[length:var(--text-body)] font-semibold text-foreground">
              {t(group.labelKey)}
            </SidebarGroupLabel>
            <SidebarMenu className="ml-4 w-auto gap-0.5 border-l border-border pl-2.5">
              {group.items.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    isActive={pathname === item.path}
                    render={<Link to={item.path} />}
                  >
                    <item.icon />
                    <span>{t(item.labelKey)}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  )
}
