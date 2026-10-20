/**
 * The sidebar's workspace list: the folders the hub knows, the one in use, and
 * the row that adds a folder by picking one. A workspace is a folder, so a row
 * carries the folder's own name unless a person gave it another; the row's ⋯
 * menu renames or forgets the row and never the folder, which is why neither
 * asks for a confirmation.
 */
import { CheckIcon, EllipsisIcon, FolderIcon, PenLineIcon, PlusIcon, Trash2Icon } from "lucide-react"
import * as React from "react"

import { useI18n } from "@context-hub/extensions/react"
import { Button } from "@context-hub/shadcn-ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@context-hub/shadcn-ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@context-hub/shadcn-ui/components/dropdown-menu"
import { Input } from "@context-hub/shadcn-ui/components/input"

import { SidebarGroup, SidebarRow } from "@/components/sidebar-rows"
import { pickFolder } from "@/lib/folder-picker"
import { renameSubmission, useWorkspaces, workspaceLabel } from "@/lib/workspaces"

/** The box a row's trailing mark sits in, so ✓ and ⋯ land on the same spot. */
function TrailBox({ children }: { children: React.ReactNode }) {
  return <span className="flex size-6 shrink-0 items-center justify-center">{children}</span>
}

/** The rename dialog: one field, the workspace's current name in it. */
function RenameDialog({
  name,
  allowEmpty = false,
  onRename,
  onClose,
}: {
  name: string
  /** Whether an empty value may be saved, restoring the system name. */
  allowEmpty?: boolean
  /** Answers why the hub refused the name, or `null` once it took it. */
  onRename: (next: string) => Promise<string | null>
  onClose: () => void
}) {
  const { t } = useI18n()
  const [value, setValue] = React.useState(name)
  const [refused, setRefused] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const save = async () => {
    setBusy(true)
    const answer = await onRename(value)
    setBusy(false)
    if (answer === null) onClose()
    else setRefused(answer)
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex w-[420px] flex-col gap-0 rounded-lg bg-dialog p-0 shadow-[0_24px_56px_#0F172A3D] ring-glass-border backdrop-blur-xl sm:max-w-[420px]"
      >
        <div className="flex flex-col gap-1.5 px-6 pt-[22px] pb-5">
          <DialogTitle className="text-base leading-[19px] font-semibold">
            {t("workspace.rename.title")}
          </DialogTitle>
          <DialogDescription className="text-sm leading-[17px]">
            {t("workspace.rename.description")}
          </DialogDescription>
        </div>
        <div className="flex flex-col gap-1.5 px-6 pb-5">
          <label
            htmlFor="workspace-name"
            className="text-xs leading-[15px] font-medium text-copy"
          >
            {t("workspace.rename.field")}
          </label>
          <Input
            id="workspace-name"
            autoFocus
            value={value}
            disabled={busy}
            onChange={(event) => {
              setValue(event.target.value)
              setRefused(null)
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") void save()
            }}
          />
          {refused === null ? null : (
            <p className="text-xs leading-[15px] text-destructive">{refused}</p>
          )}
        </div>
        <div className="flex h-16 items-center justify-end gap-2 border-t border-border px-6">
          <DialogClose render={<Button variant="ghost" />}>
            {t("workspace.rename.cancel")}
          </DialogClose>
          <Button disabled={busy || (value.trim() === "" && !allowEmpty)} onClick={() => void save()}>
            {t("workspace.rename.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function WorkspaceGroup() {
  const { t } = useI18n()
  const { page, failure, select, add, rename, remove } = useWorkspaces()
  /** The workspace whose name is being changed, and the name it opened with. */
  const [editing, setEditing] = React.useState<{
    id: string
    name: string
    default: boolean
  } | null>(null)
  /** Why the last create attempt did not land, ready to show. */
  const [notice, setNotice] = React.useState<string | null>(null)
  const current = page?.current ?? null

  /**
   * Ask for a folder through the system's own dialog, which is the one a person
   * expects and the only one a page may open. The desktop carrier reports the
   * folder's absolute path; a browser reports its name and nothing else — a
   * page is never told where a folder is — so there the hub places that name
   * among the folders it knows.
   */
  const create = async () => {
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
    setNotice(await add(picked.path ?? picked.name))
  }

  /* One line for whichever of the two answers last: the form's own, or the hub's. */
  const message = notice ?? failure

  return (
    <SidebarGroup label={t("workspace.group.title")}>
      {(page?.folders ?? []).map((folder) => {
        const active = folder.id === current
        const label = workspaceLabel(folder, t)
        return (
          <SidebarRow
            key={folder.id}
            label={label}
            hint={folder.default ? null : folder.display}
            active={active}
            icon={<FolderIcon className="size-[18px]" aria-hidden />}
            onClick={() => select(folder.id)}
            trailing={
              active ? (
                <TrailBox>
                  <CheckIcon className="size-[15px] text-foreground" aria-hidden />
                </TrailBox>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        type="button"
                        aria-label={t("workspace.action.more")}
                        className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                      />
                    }
                  >
                    <EllipsisIcon className="size-4" aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="flex w-[200px] flex-col gap-0.5 rounded-md p-1.5 ring-1 ring-border shadow-soft"
                  >
                    <DropdownMenuItem
                      className="h-9 gap-2.5 rounded-sm px-2.5 text-[13px] font-medium"
                      onClick={() =>
                        setEditing({ id: folder.id, name: label, default: folder.default })
                      }
                    >
                      <PenLineIcon className="size-[15px]" aria-hidden />
                      {t("workspace.action.rename")}
                    </DropdownMenuItem>
                    {folder.default ? null : (
                      <DropdownMenuItem
                        variant="destructive"
                        className="h-9 gap-2.5 rounded-sm px-2.5 text-[13px] font-medium"
                        onClick={() => void remove(folder.id)}
                      >
                        <Trash2Icon className="size-[15px]" aria-hidden />
                        {t("workspace.action.remove")}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )
            }
          />
        )
      })}
      <SidebarRow
        label={t("workspace.create")}
        active={false}
        icon={<PlusIcon className="size-[18px]" aria-hidden />}
        onClick={() => void create()}
      />
      {message === null ? null : (
        <li className="px-3 text-xs leading-[15px] text-destructive" title={message}>
          {message}
        </li>
      )}
      {editing === null ? null : (
        <RenameDialog
          name={editing.name}
          allowEmpty={editing.default}
          onRename={(next) =>
            rename(editing.id, renameSubmission(editing.default, next, t))
          }
          onClose={() => setEditing(null)}
        />
      )}
    </SidebarGroup>
  )
}
