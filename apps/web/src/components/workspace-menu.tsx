/**
 * The sidebar header's workspace switcher: the folders the hub knows, the one
 * in use, and the row that adds a folder by picking one. A workspace is a
 * folder, so a row shows the folder's own name over its path and carries no
 * name of its own.
 */
import { CheckIcon, ChevronsUpDownIcon, FolderIcon, PlusIcon, WaypointsIcon } from "lucide-react"
import * as React from "react"

import { useI18n } from "@workspace/extensions/react"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"
import { cn } from "@workspace/ui/lib/utils"

import { FolderPickerDialog } from "@/components/folder-picker-dialog"
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
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-lg",
          state === "current"
            ? "bg-primary text-primary-foreground"
            : state === "idle"
              ? "text-secondary-foreground ring-1 ring-border"
              : "text-muted-foreground ring-1 ring-border"
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
  const { page, failure, select, add } = useWorkspaces()
  const [open, setOpen] = React.useState(false)
  const [picking, setPicking] = React.useState(false)
  const current = page?.current ?? null
  const currentName = page?.folders.find((folder) => folder.id === current)?.name ?? null

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
              className="w-[300px] gap-0.5 rounded-lg bg-dialog p-2 shadow-[0_8px_24px_#0F172A29] ring-glass-border backdrop-blur-xl"
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
              <span className="flex h-[13px] items-center py-1.5">
                <span className="h-px w-full bg-border" />
              </span>
              <MenuRow
                icon={<PlusIcon className="size-[15px]" />}
                name={t("workspace.create")}
                state="action"
                onClick={() => {
                  setOpen(false)
                  setPicking(true)
                }}
              />
              {failure === null ? null : (
                <span className="px-2.5 pb-1 text-xs leading-[15px] text-destructive">{failure}</span>
              )}
            </PopoverContent>
          </Popover>
        </SidebarMenuItem>
      </SidebarMenu>
      <FolderPickerDialog open={picking} onOpenChange={setPicking} onPicked={add} />
    </>
  )
}
