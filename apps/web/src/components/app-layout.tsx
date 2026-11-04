/**
 * The shell around every page: the fixed rail, the header, and the page body.
 *
 * Nothing here knows about search. The search control is a header contribution
 * from its own extension, so the shell only has to offer the slot.
 */
import * as React from "react"
import { Outlet } from "react-router"

import { agentDisplayOrder, mergeAgentOrder } from "@context-hub/extensions"
import { AgentOrderProvider, useContributions, useHub, useI18n } from "@context-hub/extensions/react"
import { useSkillAgents } from "@context-hub/skills"
import { toast } from "@context-hub/shadcn-ui/components/toast"

import { SidebarInset, SidebarProvider } from "@context-hub/shadcn-ui/components/sidebar"

import { AppHeader } from "@/components/app-header"
import { AppSidebar } from "@/components/app-sidebar"
import { DesktopMenuActions } from "@/components/desktop-menu-actions"
import { useWorkspaces } from "@/lib/workspaces"

function AgentOrderBoundary({ children }: { children: React.ReactNode }) {
  const ctx = useHub()
  const { t } = useI18n()
  const { page } = useWorkspaces()
  const skillAgents = useSkillAgents()
  const targets = useContributions("target")
  const available = targets.filter((target) => skillAgents.includes(target.id)).map((target) => target.id)
  const [draft, setDraft] = React.useState<string[] | null>(null)
  const [saving, setSaving] = React.useState(false)
  const pending = React.useRef(false)
  const order = agentDisplayOrder(available, draft ?? page?.agentOrder ?? [])

  const reorder = (ids: readonly string[]) => {
    if (pending.current) return
    const service = ctx.get("hub.workspaces")
    if (service === undefined) {
      toast.add({ type: "error", title: t("agents.order.failed") })
      return
    }
    const next = mergeAgentOrder(page?.agentOrder ?? [], available, ids)
    pending.current = true
    setDraft(next)
    setSaving(true)
    void service.setAgentOrder(next).then((saved) => {
      if (!saved) toast.add({ type: "error", title: t("agents.order.failed") })
    }).catch(() => {
      toast.add({ type: "error", title: t("agents.order.failed") })
    }).finally(() => {
      pending.current = false
      setDraft(null)
      setSaving(false)
    })
  }

  return <AgentOrderProvider value={{ order, saving, reorder }}>{children}</AgentOrderProvider>
}

export function AppLayout() {
  return (
    /* The design fixes the rail at 248px, which is what every page's 1192px
       content column is measured against. The top padding is the desktop
       shell's title bar; it is 0 in a plain browser. */
    <AgentOrderBoundary>
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
    </AgentOrderBoundary>
  )
}
