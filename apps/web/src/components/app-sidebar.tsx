/**
 * The sidebar: who the hub is, where a person can go, the folders it knows, and
 * the agents it delivers to. Every group is a list of the same row, so the
 * column reads as one thing rather than three widgets stacked together.
 */
import { CheckIcon, WaypointsIcon } from "lucide-react"
import * as React from "react"
import { useLocation } from "react-router"

import { useContributions, useI18n } from "@workspace/extensions/react"
import { Sidebar, SidebarContent, SidebarHeader } from "@workspace/ui/components/sidebar"

import { SidebarGroup, SidebarRow } from "@/components/sidebar-rows"
import { WorkspaceGroup } from "@/components/workspace-group"
import { useNavGroups } from "@/lib/navigation"
import type { NavGroup as NavGroupData } from "@/lib/navigation"
import { useWorkspaces } from "@/lib/workspaces"

/** One page group, straight from the navigation table. */
function NavGroup({ group }: { group: NavGroupData }) {
  const { pathname } = useLocation()
  const { t } = useI18n()

  return (
    <SidebarGroup label={t(group.labelKey)}>
      {group.items.map((item) => (
        <SidebarRow
          key={item.path}
          label={t(item.labelKey)}
          active={pathname === item.path}
          href={item.path}
          icon={<item.icon className="size-[18px]" aria-hidden />}
        />
      ))}
    </SidebarGroup>
  )
}

/**
 * The agents this hub delivers to: an integration that reads a workspace's
 * skills is one. The list is a contribution, so it exists exactly while such an
 * integration is enabled, and each row wears the mark that integration ships.
 */
function AgentGroup() {
  const { t } = useI18n()
  const { page, selectAgent } = useWorkspaces()
  const agent = page?.agent ?? null
  const targets = useContributions("target").filter(
    (entry) => entry.skillLocation !== undefined
  )

  if (targets.length === 0) return null

  return (
    <SidebarGroup label={t("agents.group.title")}>
      {targets.map((target) => {
        const Mark = target.icon
        return (
          <SidebarRow
            key={target.id}
            label={target.displayName}
            hint={target.format}
            active={target.id === agent}
            iconWrap="rounded-xs bg-muted ring-1 ring-border"
            icon={<Mark className="size-3" aria-hidden />}
            onClick={() => selectAgent(target.id === agent ? null : target.id)}
            trailing={
              target.id === agent ? (
                <span className="flex size-6 shrink-0 items-center justify-center">
                  <CheckIcon className="size-[15px] text-foreground" aria-hidden />
                </span>
              ) : null
            }
          />
        )
      })}
    </SidebarGroup>
  )
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const navGroups = useNavGroups()
  const manage = navGroups.find((group) => group.id === "manage")
  const operate = navGroups.find((group) => group.id === "operate")

  return (
    <Sidebar className="border-sidebar-border" {...props}>
      <SidebarHeader className="px-4 pt-5 pb-0">
        <div className="flex h-7 items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-sm bg-primary text-primary-foreground">
            <WaypointsIcon className="size-4" aria-hidden />
          </span>
          <span className="text-[15px] leading-[19px] font-semibold">Context Hub</span>
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-5 px-4 pt-5 pb-5">
        {manage === undefined ? null : <NavGroup group={manage} />}
        <WorkspaceGroup />
        <AgentGroup />
        {operate === undefined ? null : <NavGroup group={operate} />}
      </SidebarContent>
    </Sidebar>
  )
}
