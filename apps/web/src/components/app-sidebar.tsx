/**
 * The sidebar: who the hub is, where a person can go, the folders it knows, and
 * the agents it delivers to. Every group is a list of the same row, so the
 * column reads as one thing rather than three widgets stacked together.
 */
import { CheckIcon, ChevronDownIcon, WaypointsIcon } from "lucide-react"
import * as React from "react"
import { useLocation } from "react-router"

import { useContributions, useI18n } from "@workspace/extensions/react"
import { useSkillAgents } from "@workspace/plugin-skills"
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
 * How many agents the group lists before it offers the rest. How many
 * integrations a person enables is their own business, so the group cannot let
 * that number push everything below it off the column.
 */
const AGENTS_VISIBLE = 8

/**
 * The agents this hub delivers to: an integration that registers a place for
 * the skills module to read is one. A row exists exactly while such an
 * integration is enabled, and wears the mark that integration ships. Choosing
 * one is what puts its machine-wide place on the skills page, so several can be
 * chosen at once.
 */
function AgentGroup() {
  const { t } = useI18n()
  const { page, setAgent } = useWorkspaces()
  const [expanded, setExpanded] = React.useState(false)
  const chosen = page?.agents ?? []
  /* An agent is one this hub reads skills from: a target has a row while its
     own integration registered a place, which is what the skills page reads. */
  const agents = useSkillAgents()
  const targets = useContributions("target").filter((entry) =>
    agents.includes(entry.id)
  )

  if (targets.length === 0) return null

  const rest = targets.length - AGENTS_VISIBLE
  const shown = expanded || rest <= 0 ? targets : targets.slice(0, AGENTS_VISIBLE)

  return (
    <SidebarGroup label={t("agents.group.title")}>
      {shown.map((target) => {
        const Mark = target.icon
        const on = chosen.includes(target.id)
        return (
          <SidebarRow
            key={target.id}
            label={target.displayName}
            hint={target.format}
            active={on}
            iconWrap="rounded-xs bg-muted ring-1 ring-border"
            icon={<Mark className="size-3" aria-hidden />}
            onClick={() => setAgent(target.id, !on)}
            trailing={
              on ? (
                <span className="flex size-6 shrink-0 items-center justify-center">
                  <CheckIcon className="size-[15px] text-foreground" aria-hidden />
                </span>
              ) : null
            }
          />
        )
      })}
      {rest <= 0 ? null : (
        <SidebarRow
          label={
            expanded
              ? t("agents.group.collapse")
              : t("agents.group.expand").replace("{count}", String(rest))
          }
          active={false}
          expanded={expanded}
          icon={
            <ChevronDownIcon
              className={`size-[18px] shrink-0 transition-transform ${
                expanded ? "rotate-180" : ""
              }`}
              aria-hidden
            />
          }
          onClick={() => setExpanded(!expanded)}
        />
      )}
    </SidebarGroup>
  )
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const navGroups = useNavGroups()
  const assets = navGroups.find((group) => group.id === "assets")
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
        {assets === undefined ? null : <NavGroup group={assets} />}
        <WorkspaceGroup />
        <AgentGroup />
        {operate === undefined ? null : <NavGroup group={operate} />}
      </SidebarContent>
    </Sidebar>
  )
}
