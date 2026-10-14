/**
 * A screen tab that carries its own batch action: pressing it shows the set, and
 * the one action the set is for opens while the pointer rests on the tab.
 *
 * The tab is itself the trigger, so the whole pill is the area that opens the
 * menu. A press opens nothing — on this tab a press is the tab's own switch —
 * which is why the guard reads the reason the menu is opening rather than the
 * click that reaches the trigger.
 *
 * While the set's batch runs the tab's mark becomes a spinner: the menu closes
 * on the press that starts it, and this is what says the work is under way.
 *
 * It draws `<button>` rather than a tab primitive, so a caller places it inside
 * its own list and drives the screen's own value: a set that stands for what is
 * missing is a state of the list beside it, not a panel of its own.
 */
import { LoaderCircleIcon, type LucideIcon } from "lucide-react"
import * as React from "react"

import type { ExtensionIcon } from "../types.ts"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

export function ActionTab({
  icon: Icon,
  label,
  count,
  action,
  actionIcon: ActionIcon,
  state,
  active,
  onTab,
  onAction,
}: {
  icon: ExtensionIcon
  label: string
  count: number
  /** What the menu offers for the whole set, e.g. 一键收录. */
  action: string
  /** The mark that action carries, which is the action's own and not the tab's. */
  actionIcon: LucideIcon
  /** Whether this set's batch is idle, running here, or held up by another. */
  state: "idle" | "running" | "blocked"
  active: boolean
  onTab: () => void
  onAction: () => void
}) {
  const [open, setOpen] = React.useState(false)

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next, details) => {
        /* The pointer and the keyboard may open the action; a press may not. */
        if (next && details.reason === "trigger-press") return
        setOpen(next)
      }}
    >
      <DropdownMenuTrigger
        openOnHover
        /* Long enough to cross the gap between the tab and the menu. */
        closeDelay={140}
        render={
          <button
            type="button"
            /* The pill is the screen's own control rather than a tab panel, so
               being the screen on show is a current state. */
            aria-current={active ? "true" : undefined}
            aria-busy={state === "running" ? true : undefined}
            onClick={onTab}
            className={`flex h-9 flex-none shrink-0 items-center gap-1.5 rounded-full px-4 text-[length:var(--text-body)] outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active
                ? "bg-foreground text-background dark:bg-accent dark:text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {state === "running" ? (
              <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin" aria-hidden />
            ) : (
              <Icon className="size-3.5 shrink-0" aria-hidden />
            )}
            {label}
            <span className="font-mono text-[13px]">{count}</span>
          </button>
        }
      />
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        onClick={(event) => event.stopPropagation()}
        className="w-[220px] p-1"
      >
        <DropdownMenuItem
          className="gap-2.5 py-2"
          disabled={state !== "idle"}
          onClick={onAction}
        >
          <ActionIcon className="size-3.5" aria-hidden />
          <span className="text-[13.5px] leading-[18px] font-semibold">{action}</span>
          <span className="ml-auto font-mono text-[12.5px] text-muted-foreground">{count}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
