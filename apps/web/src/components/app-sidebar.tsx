import * as React from "react"
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

import { WorkspaceMenu } from "@/components/workspace-menu"
import { useNavGroups } from "@/lib/navigation"
import { useI18n } from "@workspace/extensions/react"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { pathname } = useLocation()
  const { t } = useI18n()
  const navGroups = useNavGroups()

  return (
    <Sidebar className="border-sidebar-border" {...props}>
      <SidebarHeader>
        <WorkspaceMenu />
      </SidebarHeader>
      <SidebarContent className="gap-6 px-3 pb-3">
        {navGroups.map((group) => (
          <SidebarGroup key={group.id} className="gap-1 p-0">
            <SidebarGroupLabel className="h-auto px-3 pb-1 text-[length:var(--text-caption)] font-semibold text-muted-foreground">
              {t(group.labelKey)}
            </SidebarGroupLabel>
            <SidebarMenu className="gap-0.5">
              {group.items.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    isActive={pathname === item.path}
                    className="h-9 rounded-full px-3 text-[length:var(--text-body)]"
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
