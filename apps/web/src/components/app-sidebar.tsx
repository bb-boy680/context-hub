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
    <Sidebar className="border-sidebar-border backdrop-blur-glass" {...props}>
      <SidebarHeader>
        <WorkspaceMenu />
      </SidebarHeader>
      <SidebarContent className="gap-4 p-2">
        {navGroups.map((group) => (
          <SidebarGroup key={group.id} className="gap-0.5 p-0">
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
