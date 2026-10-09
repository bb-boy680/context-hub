/**
 * The sidebar header's workspace switcher: the folders the hub knows, the one
 * in use, the agent it delivers to, and the row that adds a folder by picking
 * one. A workspace is a folder, so a row shows the folder's own name and
 * carries no name of its own; an agent is an integration, so its rows are
 * whatever the enabled extensions contribute.
 */
import { CheckIcon, ChevronsUpDownIcon, FolderIcon, PlusIcon, WaypointsIcon } from "lucide-react"
import * as React from "react"

import { useContributions, useI18n } from "@workspace/extensions/react"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"
import { cn } from "@workspace/ui/lib/utils"

import { pickFolder } from "@/lib/folder-picker"
import { useWorkspaces } from "@/lib/workspaces"

/** How a row reads: the workspace in use, another one, or the action that adds one. */
type RowState = "current" | "idle" | "action"

/** One menu row: a tile and the folder's own name. */
function MenuRow({
  icon,
  name,
  hint,
  state,
  trailing,
  disabled,
  onClick,
}: {
  icon: React.ReactNode
  name: string
  /** The folder's path, kept as a hover hint rather than a line of its own. */
  hint?: string | null
  state: RowState
  trailing?: React.ReactNode
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={hint ?? undefined}
      className={cn(
        "flex h-11 w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-left disabled:pointer-events-none disabled:opacity-50",
        state === "current" ? "bg-primary/10" : "hover:bg-muted"
      )}
    >
      {/* The tile stays unfilled: a mark that carries its own colour, like a
          brand icon, would otherwise sit on a plate of the hub's accent. The
          row's own tint and the check mark are what say which one is in use. */}
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-lg",
          state === "action"
            ? "text-muted-foreground ring-1 ring-border"
            : "text-secondary-foreground ring-1 ring-border"
        )}
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col justify-center">
        <span
          className={cn(
            "truncate text-[13px] leading-[17px] font-medium",
            state === "action" ? "text-secondary-foreground" : "text-foreground"
          )}
        >
          {name}
        </span>
      </span>
      {trailing}
    </button>
  )
}

export function WorkspaceMenu() {
  const { t } = useI18n()
  const { page, failure, select, selectAgent, add } = useWorkspaces()
  const [open, setOpen] = React.useState(false)
  /** Why the last create attempt did not land, ready to show. */
  const [notice, setNotice] = React.useState<string | null>(null)
  const current = page?.current ?? null
  const currentName = page?.folders.find((folder) => folder.id === current)?.name ?? null
  const agent = page?.agent ?? null
  /* An integration that reads a workspace's skills is one this menu can pick. */
  const targets = useContributions("target").filter(
    (entry) => entry.skillLocation !== undefined
  )

  /**
   * Ask for a folder through the system's own dialog, which is the one a person
   * expects and the only one a page may open. It reports the folder's name and
   * nothing else — a page is never told where a folder is — so the hub places
   * that name among the folders it knows.
   */
  const create = async () => {
    setOpen(false)
    const picked = await pickFolder()
    /* A dismissed dialog answers nothing, and is not a failure to report. */
    if (picked === null) {
      setNotice(null)
      return
    }
    if (picked === "unsupported") {
      setNotice(t("workspace.create.unsupported"))
      return
    }
    setNotice(null)
    await add(picked.name)
  }

  /* One line for whichever of the two answers last: the form's own, or the hub's. */
  const message = notice ?? failure

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
              render={
                <SidebarMenuButton size="lg" aria-expanded={open}>
                  <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                    <WaypointsIcon className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left leading-none">
                    <span className="text-sm font-medium">Context Hub</span>
                    <span className="mt-0.5 truncate text-xs text-muted-foreground">
                      {currentName ?? t("workspace.none")}
                    </span>
                  </div>
                  <ChevronsUpDownIcon className="ml-auto text-muted-foreground" />
                </SidebarMenuButton>
              }
            />
            <PopoverContent
              side="right"
              align="start"
              sideOffset={8}
              className="w-[300px] gap-0.5 rounded-xl bg-popover p-2 ring-1 ring-border shadow-soft"
            >
              <span className="flex h-[30px] items-center px-2.5 text-[13px] leading-[17px] font-medium text-muted-foreground">
                {t("workspace.menu.title")}
              </span>
              {(page?.folders ?? []).map((folder) => (
                <MenuRow
                  key={folder.id}
                  icon={<FolderIcon className="size-[15px]" />}
                  name={folder.name}
                hint={folder.display}
                  state={folder.id === current ? "current" : "idle"}
                  trailing={
                    folder.id === current ? (
                      <CheckIcon className="size-[15px] shrink-0 text-primary" />
                    ) : null
                  }
                  onClick={() => {
                    select(folder.id)
                    setOpen(false)
                  }}
                />
              ))}
              {/* Agents are integrations, so this section exists exactly while
                  an enabled one reads a workspace's skills. Creating a folder
                  stays the last row either way. */}
              {targets.length === 0 ? null : (
                <>
                  <span className="flex h-[13px] items-center py-1.5">
                    <span className="h-px w-full bg-border" />
                  </span>
                  <span className="flex h-[30px] items-center px-2.5 text-[13px] leading-[17px] font-medium text-muted-foreground">
                    {t("agents.menu.title")}
                  </span>
                  {targets.map((target) => {
                    const Icon = target.icon
                    return (
                      <MenuRow
                        key={target.id}
                        icon={<Icon className="size-[15px]" aria-hidden />}
                        name={target.displayName}
                        hint={target.format}
                        state={target.id === agent ? "current" : "idle"}
                        trailing={
                          target.id === agent ? (
                            <CheckIcon className="size-[15px] shrink-0 text-primary" />
                          ) : null
                        }
                        onClick={() => {
                          /* Choosing the agent in use again clears the choice. */
                          selectAgent(target.id === agent ? null : target.id)
                          setOpen(false)
                        }}
                      />
                    )
                  })}
                </>
              )}
              <span className="flex h-[13px] items-center py-1.5">
                <span className="h-px w-full bg-border" />
              </span>
              <MenuRow
                icon={<PlusIcon className="size-[15px]" />}
                name={t("workspace.create")}
                state="action"
                onClick={() => void create()}
              />
              {message === null ? null : (
                <span className="px-2.5 pb-1 text-xs leading-[15px] text-destructive">{message}</span>
              )}
            </PopoverContent>
          </Popover>
        </SidebarMenuItem>
      </SidebarMenu>
    </>
  )
}
