/**
 * The sidebar: who the hub is, where a person can go, the folders it knows, and
 * the agents it delivers to. Every group is a list of the same row, so the
 * column reads as one thing rather than three widgets stacked together.
 */
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import { DragDropContext, Draggable, Droppable, type DragStart, type DragUpdate, type DropResult, type ResponderProvided } from "@hello-pangea/dnd"
import * as React from "react"
import { useLocation } from "react-router"

import { useAgentOrder, useContributions, useI18n } from "@context-hub/extensions/react"
import { useSkillAgents } from "@context-hub/skills"
import { Sidebar, SidebarContent, SidebarHeader } from "@context-hub/shadcn-ui/components/sidebar"

import { SidebarGroup, SidebarRow } from "@/components/sidebar-rows"
import { WorkspaceGroup } from "@/components/workspace-group"
import { useDesktopInfo, useDesktopUpdate } from "@/lib/desktop"
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
          hint={item.soon === true ? t("nav.soon") : undefined}
          active={pathname === item.path}
          disabled={item.soon === true}
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
  const agentOrder = useAgentOrder()
  /* An agent is one this hub reads skills from: a target has a row while its
     own integration registered a place, which is what the skills page reads. */
  const agents = useSkillAgents()
  const available = useContributions("target").filter((entry) => agents.includes(entry.id))
  const byId = new Map(available.map((target) => [target.id, target]))
  const targets = agentOrder === null ? available : agentOrder.order.flatMap((id) => {
    const target = byId.get(id)
    return target === undefined ? [] : [target]
  })

  if (targets.length === 0) return null

  const rest = targets.length - AGENTS_VISIBLE
  const shown = expanded || rest <= 0 ? targets : targets.slice(0, AGENTS_VISIBLE)

  const nameOf = (id: string) => byId.get(id)?.displayName ?? id
  const announcement = (key: string, id: string, position: number) => t(key)
    .replace("{agent}", nameOf(id))
    .replace("{position}", String(position + 1))
    .replace("{count}", String(shown.length))
  const startDrag = (start: DragStart, { announce }: ResponderProvided) => {
    announce(announcement("agents.order.picked", start.draggableId, start.source.index))
  }
  const updateDrag = (update: DragUpdate, { announce }: ResponderProvided) => {
    if (update.destination !== null) announce(announcement("agents.order.moved", update.draggableId, update.destination.index))
  }
  const endDrag = (result: DropResult, { announce }: ResponderProvided) => {
    if (agentOrder === null || result.reason !== "DROP" || result.destination === null ||
      result.destination.index === result.source.index) {
      announce(t("agents.order.cancelled"))
      return
    }
    announce(announcement("agents.order.dropped", result.draggableId, result.destination.index))
    const next = shown.map((target) => target.id)
    const [moved] = next.splice(result.source.index, 1)
    if (moved === undefined) return
    next.splice(result.destination.index, 0, moved)
    agentOrder.reorder(next)
  }

  return (
    <DragDropContext onDragStart={startDrag} onDragUpdate={updateDrag} onDragEnd={endDrag} dragHandleUsageInstructions={t("agents.order.instructions")}>
      <Droppable droppableId="agents">
        {(drop) => (
          <SidebarGroup label={t("agents.group.title")} listProps={{ ...drop.droppableProps, ref: drop.innerRef }}>
            {shown.map((target, index) => {
              const Mark = target.icon
              const on = chosen.includes(target.id)
              return (
                <Draggable key={target.id} draggableId={target.id} index={index}
                  isDragDisabled={agentOrder === null || agentOrder.saving}>
                  {(drag) => (
                    <SidebarRow
                      itemProps={{ ...drag.draggableProps, ref: drag.innerRef }}
                      dragHandleProps={drag.dragHandleProps}
                      label={target.displayName}
                      hint={target.format}
                      active={on}
                      iconWrap="rounded-xs bg-muted ring-1 ring-border"
                      icon={<Mark className="size-3" aria-hidden />}
                      onClick={() => setAgent(target.id, !on)}
                      trailing={on ? (
                        <span className="flex size-6 shrink-0 items-center justify-center">
                          <CheckIcon className="size-[15px] text-foreground" aria-hidden />
                        </span>
                      ) : null}
                    />
                  )}
                </Draggable>
              )
            })}
            {drop.placeholder}
            {rest <= 0 ? null : (
              <SidebarRow
                label={expanded ? t("agents.group.collapse") : t("agents.group.expand").replace("{count}", String(rest))}
                active={false}
                expanded={expanded}
                icon={<ChevronDownIcon className={`size-[18px] shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden />}
                onClick={() => setExpanded(!expanded)}
              />
            )}
          </SidebarGroup>
        )}
      </Droppable>
    </DragDropContext>
  )
}

/** The sidebar's one-line update action; nothing renders without an offer. */
function UpdateNotice() {
  const { t } = useI18n()
  const { state, start } = useDesktopUpdate()

  if (state.status === "idle") return null
  if (state.status === "downloading") {
    return (
      <span className="min-w-0 truncate text-muted-foreground" aria-live="polite">
        {t("sidebar.update.downloading").replace(
          "{percent}",
          String(state.percent ?? 0)
        )}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={start}
      className="min-w-0 truncate text-ring hover:underline"
      aria-live="polite"
    >
      {t(state.status === "ready" ? "sidebar.update.ready" : "sidebar.update.available")}
    </button>
  )
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const navGroups = useNavGroups()
  const { version, updatesEnabled } = useDesktopInfo()
  const assets = navGroups.find((group) => group.id === "assets")
  const market = navGroups.find((group) => group.id === "market")
  const operate = navGroups.find((group) => group.id === "operate")

  return (
    <Sidebar
      className="border-sidebar-border top-[var(--context-hub-titlebar-height,0px)] h-[calc(100svh-var(--context-hub-titlebar-height,0px))]"
      {...props}
    >
      <SidebarHeader className="px-4 pt-5 pb-0">
        <div className="flex items-center gap-2.5">
          <img
            src="/icon-32.png"
            srcSet="/icon-64.png 2x"
            width={28}
            height={28}
            className="size-7 shrink-0 object-contain"
            alt=""
            aria-hidden
          />
          <div className="flex min-w-0 flex-col">
            <span className="text-[15px] leading-[19px] font-semibold">Context Hub</span>
            {version === null ? null : (
              <div className="flex items-center gap-2 text-[12px] leading-4">
                <span className="shrink-0 font-mono text-muted-foreground">v{version}</span>
                {updatesEnabled ? <UpdateNotice /> : null}
              </div>
            )}
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-5 px-4 pt-5 pb-5">
        {assets === undefined ? null : <NavGroup group={assets} />}
        {market === undefined ? null : <NavGroup group={market} />}
        <WorkspaceGroup />
        <AgentGroup />
        {operate === undefined ? null : <NavGroup group={operate} />}
      </SidebarContent>
    </Sidebar>
  )
}
