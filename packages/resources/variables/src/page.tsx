/**
 * Environment variables: the group rail, the list, the batch create dialog and
 * the row actions, from `designs/settings.pen`.
 *
 * The page owns one read of the whole library. Every write answers with the
 * next document, so a change lands in the rows and in the rail's counts at the
 * same time; there is no second read to fall behind. Names are the identity, so
 * the create and rename dialogs refuse a duplicate before the host does, and the
 * host refuses it again.
 */
import {
  CheckIcon,
  CopyIcon,
  EllipsisIcon,
  EyeIcon,
  EyeOffIcon,
  FolderInputIcon,
  KeyRoundIcon,
  LockIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TextCursorInputIcon,
  Trash2Icon,
  TriangleAlertIcon,
  VariableIcon,
  XIcon,
} from "lucide-react"
import * as React from "react"

import { cn } from "cn"

import { useI18n } from "@context-hub/extensions/react"
import { Badge } from "@context-hub/shadcn-ui/components/badge"
import { Button } from "@context-hub/shadcn-ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@context-hub/shadcn-ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@context-hub/shadcn-ui/components/dropdown-menu"
import { Input } from "@context-hub/shadcn-ui/components/input"
import { toast } from "@context-hub/shadcn-ui/components/toast"

import { createRemoteVariableStore } from "./remote-store.ts"
import {
  DEFAULT_GROUP,
  VARIABLE_NAME,
  type Variable,
  type VariableDocument,
  type VariableDraft,
} from "./store.ts"

/** Names that read as secrets are masked until the row's eye is used. */
const SENSITIVE = /(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)/i

/** The mask's width, which says "there is a value" without saying which. */
const MASK = "•".repeat(16)

/** The batch dialog's column track; header and rows share it. */
const CREATE_GRID = "grid-cols-[200px_minmax(0,1fr)_90px_34px]"

/** The row menu's item styling, matched to the app's other row menus. */
const MENU_ITEM = "h-9 gap-2.5 rounded-sm px-2.5 text-[13px] font-medium"

/** A failure as a sentence a toast can carry. */
function textOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Whether a row's value should be hidden until asked for. */
function isSecret(name: string): boolean {
  return SENSITIVE.test(name)
}

/* ------------------------------------------------------------------------- */
/* Dialogs                                                                    */
/* ------------------------------------------------------------------------- */

/** A small dialog whose body is one labelled field. */
function FieldDialog({
  open,
  title,
  description,
  label,
  value,
  type = "text",
  placeholder,
  helper,
  warning,
  submit,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  title: string
  description: string
  label: string
  value: string
  type?: "text" | "password"
  placeholder?: string
  helper?: string
  warning?: string
  submit: string
  onOpenChange: (open: boolean) => void
  onSubmit: (value: string) => Promise<void>
}) {
  const { t } = useI18n()
  const id = React.useId()
  const [draft, setDraft] = React.useState(value)
  const [revealed, setRevealed] = React.useState(false)
  const [failure, setFailure] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const submitNow = () => {
    if (busy) return
    setFailure(null)
    setBusy(true)
    void onSubmit(draft)
      .catch((error: unknown) => setFailure(textOf(error)))
      .finally(() => setBusy(false))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        style={{ maxWidth: "none" }}
        className="w-[min(480px,calc(100vw-2rem))] gap-0 overflow-clip rounded-xl border border-border bg-card p-0 ring-0"
      >
        <DialogHeader className="relative gap-1.5 border-b border-border px-6 py-5">
          <DialogTitle className="text-[15px] font-semibold">{title}</DialogTitle>
          <DialogDescription className="pr-10 text-[12.5px] leading-relaxed text-muted-foreground">
            {description}
          </DialogDescription>
          <DialogClose
            render={
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-4 right-4 size-8 rounded-full"
                aria-label={t("variables.action.close")}
              />
            }
          >
            <XIcon className="size-4 text-copy" />
          </DialogClose>
        </DialogHeader>
        <div className="flex flex-col gap-2 px-6 py-5">
          <label className="text-[12px] font-semibold text-foreground" htmlFor={id}>
            {label}
          </label>
          <div className="flex items-center gap-2">
            <Input
              id={id}
              autoFocus
              type={type === "password" && !revealed ? "password" : "text"}
              value={draft}
              placeholder={placeholder}
              className="h-10 font-mono text-[12.5px]"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitNow()
              }}
            />
            {type === "password" ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={t(revealed ? "variables.action.hide" : "variables.action.reveal")}
                onClick={() => setRevealed((shown) => !shown)}
              >
                {revealed ? <EyeOffIcon /> : <EyeIcon />}
              </Button>
            ) : null}
          </div>
          {helper === undefined ? null : (
            <span className="text-[11.5px] leading-relaxed text-muted-foreground">{helper}</span>
          )}
          {warning === undefined ? null : (
            <span className="flex items-start gap-2 rounded-md border border-notice-border bg-notice-bg px-3 py-2 text-[11.5px] leading-relaxed text-copy">
              <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
              {warning}
            </span>
          )}
          {failure === null ? null : (
            <span role="alert" className="text-[12px] leading-relaxed text-destructive">
              {failure}
            </span>
          )}
        </div>
        <div className="flex h-[72px] shrink-0 items-center justify-end gap-2 border-t border-border px-6">
          <Button
            variant="ghost"
            className="h-9 rounded-full px-4 text-[13px] font-medium"
            onClick={() => onOpenChange(false)}
          >
            {t("variables.cancel")}
          </Button>
          <Button
            disabled={busy || draft.trim() === ""}
            className="h-9 rounded-full px-4 text-[13px] font-medium"
            onClick={submitNow}
          >
            {submit}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** A confirmation for the one destructive action. */
function DeleteDialog({
  variable,
  open,
  onOpenChange,
  onDelete,
}: {
  variable: Variable | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: (variable: Variable) => Promise<void>
}) {
  const { t } = useI18n()
  const [pending, setPending] = React.useState(false)
  const [failure, setFailure] = React.useState<string | null>(null)

  if (variable === null) return null
  const ref = `\${${variable.name}}`

  const remove = () => {
    setPending(true)
    setFailure(null)
    void onDelete(variable)
      .catch((error: unknown) => setFailure(textOf(error)))
      .finally(() => setPending(false))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        style={{ maxWidth: "none" }}
        className="w-[min(440px,calc(100vw-2rem))] gap-0 overflow-clip rounded-xl border border-border bg-card p-0 ring-0"
      >
        <DialogHeader className="relative gap-1.5 px-6 pt-5">
          <DialogTitle className="text-[15px] font-semibold">
            {t("variables.delete.title").replace("{name}", variable.name)}
          </DialogTitle>
          <DialogDescription className="pr-10 text-[12.5px] leading-relaxed text-muted-foreground">
            {t("variables.delete.description")}
          </DialogDescription>
          <DialogClose
            render={
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-4 right-4 size-8 rounded-full"
                aria-label={t("variables.action.close")}
              />
            }
          >
            <XIcon className="size-4 text-copy" />
          </DialogClose>
        </DialogHeader>
        <div className="flex flex-col gap-3 px-6 py-4">
          <span className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11.5px] leading-relaxed text-destructive">
            <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
            {t("variables.delete.warning").replace("{ref}", ref)}
          </span>
          {failure === null ? null : (
            <span role="alert" className="text-[12px] text-destructive">
              {failure}
            </span>
          )}
        </div>
        <div className="flex h-[72px] shrink-0 items-center justify-end gap-2 border-t border-border px-6">
          <Button
            variant="ghost"
            className="h-9 rounded-full px-4 text-[13px] font-medium"
            onClick={() => onOpenChange(false)}
          >
            {t("variables.cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={pending}
            className="h-9 rounded-full px-4 text-[13px] font-medium"
            onClick={remove}
          >
            {t("variables.delete.confirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** One editable line in the batch dialog. */
interface DraftRow {
  key: number
  name: string
  value: string
}

/** The batch create dialog: one group, several names and values. */
function CreateDialog({
  open,
  groups,
  existing,
  onOpenChange,
  onCreate,
  onCreateGroup,
}: {
  open: boolean
  groups: readonly string[]
  existing: ReadonlySet<string>
  onOpenChange: (open: boolean) => void
  onCreate: (drafts: VariableDraft[]) => Promise<void>
  onCreateGroup: (group: string) => Promise<string>
}) {
  const { t } = useI18n()
  const [group, setGroup] = React.useState(groups[0] ?? DEFAULT_GROUP)
  const [rows, setRows] = React.useState<DraftRow[]>([{ key: 0, name: "", value: "" }])
  const [newGroup, setNewGroup] = React.useState<string | null>(null)
  const [failure, setFailure] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const nextKey = React.useRef(1)

  const filled = rows.filter((row) => row.name.trim() !== "")

  /** A row's own error, or null while it is usable. */
  const rowError = (row: DraftRow): string | null => {
    const name = row.name.trim()
    if (name === "") return null
    if (!VARIABLE_NAME.test(name)) return t("variables.create.invalid")
    if (row.value.trim() === "") return t("variables.create.valueRequired")
    if (filled.filter((one) => one.name.trim() === name).length > 1) {
      return t("variables.create.duplicateRow")
    }
    if (existing.has(name)) return t("variables.create.exists")
    return null
  }

  const invalid = filled.length === 0 || rows.some((row) => rowError(row) !== null)

  const setRow = (key: number, patch: Partial<DraftRow>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  const addRow = () => {
    setRows((current) => [...current, { key: nextKey.current++, name: "", value: "" }])
  }

  const removeRow = (key: number) => {
    setRows((current) => {
      const kept = current.filter((row) => row.key !== key)
      return kept.length === 0 ? [{ key: nextKey.current++, name: "", value: "" }] : kept
    })
  }

  const pasteNames = (key: number, text: string) => {
    if (!text.includes("\n")) return
    const names = text
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter((name) => name !== "")
    if (names.length < 2) return
    setRows((current) => {
      const at = current.findIndex((row) => row.key === key)
      if (at < 0) return current
      const before = current.slice(0, at)
      const after = current.slice(at + 1)
      const added = names.map((name, index) => ({
        key: nextKey.current++,
        name,
        value: index === 0 ? current[at]?.value ?? "" : "",
      }))
      return [...before, ...added, ...after]
    })
  }

  const submit = () => {
    if (invalid) return
    setFailure(null)
    setPending(true)
    void onCreate(filled.map((row) => ({ name: row.name.trim(), group, value: row.value })))
      .catch((error: unknown) => setFailure(textOf(error)))
      .finally(() => setPending(false))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        style={{ maxWidth: "none" }}
        className="w-[min(780px,calc(100vw-2rem))] gap-0 overflow-clip rounded-xl border border-border bg-card p-0 ring-0"
      >
        <DialogHeader className="relative gap-1.5 border-b border-border px-7 py-5">
          <DialogTitle className="text-[15px] font-semibold">{t("variables.create.title")}</DialogTitle>
          <DialogDescription className="pr-10 text-[12.5px] leading-relaxed text-muted-foreground">
            {t("variables.create.description")}
          </DialogDescription>
          <DialogClose
            render={
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-4 right-4 size-8 rounded-full"
                aria-label={t("variables.action.close")}
              />
            }
          >
            <XIcon className="size-4 text-copy" />
          </DialogClose>
        </DialogHeader>

        <div className="flex flex-col gap-5 px-7 py-5">
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-[12px] font-semibold text-foreground">{t("variables.create.group")}</span>
              <span className="text-[11px] text-muted-foreground">{t("variables.create.groupHint")}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {groups.map((one) => (
                <Button
                  key={one}
                  type="button"
                  size="sm"
                  variant={one === group ? "secondary" : "outline"}
                  className={cn(
                    "h-7 rounded-full px-3 text-[12px]",
                    one === group && "ring-1 ring-ring"
                  )}
                  onClick={() => setGroup(one)}
                >
                  {one}
                </Button>
              ))}
              {newGroup === null ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 rounded-full px-2.5 text-[12px]"
                  onClick={() => setNewGroup("")}
                >
                  <PlusIcon className="size-3.5" />
                  {t("variables.create.newGroup")}
                </Button>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Input
                    autoFocus
                    value={newGroup}
                    placeholder={t("variables.create.newGroupPlaceholder")}
                    className="h-7 w-[150px] text-[12px]"
                    onChange={(event) => setNewGroup(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setNewGroup(null)
                      if (event.key !== "Enter" || newGroup.trim() === "") return
                      void onCreateGroup(newGroup.trim())
                        .then((created) => {
                          setGroup(created)
                          setNewGroup(null)
                        })
                        .catch((error: unknown) => setFailure(textOf(error)))
                    }}
                  />
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-4">
              <span className="flex items-center gap-2 text-[12px] font-semibold text-foreground">
                {t("variables.create.variables")}
                <Badge variant="secondary" className="font-mono text-[10.5px]">
                  {filled.length}
                </Badge>
              </span>
              <span className="text-[11px] text-muted-foreground">{t("variables.create.pasteHint")}</span>
            </div>
            <div className={cn("grid gap-2 px-0.5 text-[10.5px] font-semibold tracking-[0.05em] text-muted-foreground", CREATE_GRID)}>
              <span>{t("variables.create.name")}</span>
              <span>{t("variables.create.value")}</span>
              <span>{t("variables.create.status")}</span>
              <span />
            </div>
            <div className="flex flex-col gap-2">
              {rows.map((row) => {
                const error = rowError(row)
                const known = existing.has(row.name.trim())
                return (
                  <div key={row.key} className="flex flex-col gap-1">
                    <div className={cn("grid items-center gap-2", CREATE_GRID)}>
                      <Input
                        value={row.name}
                        placeholder="ANTHROPIC_API_KEY"
                        aria-invalid={error !== null || undefined}
                        className="h-10 font-mono text-[12px]"
                        onChange={(event) => setRow(row.key, { name: event.target.value })}
                        onPaste={(event) => {
                          const text = event.clipboardData.getData("text")
                          if (!text.includes("\n")) return
                          event.preventDefault()
                          pasteNames(row.key, text)
                        }}
                      />
                      <Input
                        value={row.value}
                        placeholder={t("variables.edit.label")}
                        className="h-10 font-mono text-[12px]"
                        onChange={(event) => setRow(row.key, { value: event.target.value })}
                      />
                      <span className="flex items-center gap-1.5 text-[10.5px]">
                        {row.name.trim() === "" ? null : known ? (
                          <>
                            <span className="size-1.5 rounded-full bg-chart-3" />
                            <span className="text-muted-foreground">{t("variables.create.exists")}</span>
                          </>
                        ) : (
                          <>
                            <span className="size-1.5 rounded-full bg-chart-2" />
                            <span className="text-muted-foreground">{t("variables.create.new")}</span>
                          </>
                        )}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("variables.action.delete")}
                        onClick={() => removeRow(row.key)}
                      >
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </div>
                    {error === null ? null : (
                      <span className="text-[11px] leading-relaxed text-destructive">{error}</span>
                    )}
                  </div>
                )
              })}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-fit gap-1.5 px-1.5 text-[12px]"
              onClick={addRow}
            >
              <PlusIcon className="size-3.5" />
              {t("variables.create.addRow")}
            </Button>
            <span className="text-[11.5px] leading-relaxed text-muted-foreground">
              {t("variables.create.helper")}
            </span>
          </div>

          <span className="flex items-center gap-2 text-[11.5px] leading-relaxed text-muted-foreground">
            <LockIcon className="size-3.5 shrink-0" />
            {t("variables.create.privacy")}
          </span>

          {failure === null ? null : (
            <span role="alert" className="text-[12px] leading-relaxed text-destructive">
              {failure}
            </span>
          )}
        </div>

        <div className="flex h-[72px] shrink-0 items-center justify-between gap-3 border-t border-border px-7">
          <span className="text-[11.5px] text-muted-foreground">
            {t("variables.create.count").replace("{count}", String(filled.length))}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="ghost"
              className="h-9 rounded-full px-4 text-[13px] font-medium"
              onClick={() => onOpenChange(false)}
            >
              {t("variables.cancel")}
            </Button>
            <Button
              disabled={invalid || pending}
              className="h-9 rounded-full px-4 text-[13px] font-medium"
              onClick={submit}
            >
              {t("variables.create.submit").replace("{count}", String(filled.length))}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** A group's name, created from the rail or from the batch dialog. */
function GroupDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (group: string) => Promise<void>
}) {
  const { t } = useI18n()
  return (
    <FieldDialog
      open={open}
      title={t("variables.groupDialog.title")}
      description={t("variables.groupDialog.description")}
      label={t("variables.groupDialog.label")}
      value=""
      placeholder={t("variables.groupDialog.placeholder")}
      submit={t("variables.groupDialog.submit")}
      onOpenChange={onOpenChange}
      onSubmit={onCreate}
    />
  )
}

/* ------------------------------------------------------------------------- */
/* Rows and the page                                                          */
/* ------------------------------------------------------------------------- */

/** The eye and the masked text one row's value cell carries. */
function ValueCell({
  variable,
  revealed,
  onToggle,
}: {
  variable: Variable
  revealed: boolean
  onToggle: () => void
}) {
  const { t } = useI18n()
  const secret = isSecret(variable.name)
  const show = variable.value !== "" && (!secret || revealed)
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        className={cn(
          "min-w-0 truncate font-mono text-[12px]",
          variable.value === "" ? "text-muted-foreground" : "text-copy"
        )}
        title={show ? undefined : secret && variable.value !== "" ? t("variables.action.reveal") : undefined}
      >
        {variable.value === "" ? "—" : show ? variable.value : MASK}
      </span>
      {secret && variable.value !== "" ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={t(revealed ? "variables.action.hide" : "variables.action.reveal")}
          onClick={onToggle}
        >
          {revealed ? <EyeOffIcon className="size-3" /> : <EyeIcon className="size-3" />}
        </Button>
      ) : null}
    </span>
  )
}

/** One row's menu. */
function RowMenu({
  variable,
  groups,
  onEdit,
  onRename,
  onMove,
  onCopy,
  onDelete,
  onNewGroup,
}: {
  variable: Variable
  groups: readonly string[]
  onEdit: () => void
  onRename: () => void
  onMove: (group: string) => void
  onCopy: () => void
  onDelete: () => void
  onNewGroup: () => void
}) {
  const { t } = useI18n()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("variables.action.more")}
            className="text-muted-foreground"
          />
        }
      >
        <EllipsisIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="flex w-[210px] flex-col gap-0.5 rounded-md p-1.5 ring-1 ring-border shadow-soft"
      >
        <DropdownMenuItem className={MENU_ITEM} onClick={onEdit}>
          <PencilIcon />
          {t("variables.action.editValue")}
        </DropdownMenuItem>
        <DropdownMenuItem className={MENU_ITEM} onClick={onRename}>
          <TextCursorInputIcon />
          {t("variables.action.rename")}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={MENU_ITEM}>
            <FolderInputIcon />
            {t("variables.action.moveGroup")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-[190px]">
            {groups.map((group) => (
              <DropdownMenuItem key={group} className={MENU_ITEM} onClick={() => onMove(group)}>
                {group}
                {group === variable.group ? <CheckIcon className="ml-auto" /> : null}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className={cn(MENU_ITEM, "text-primary")}
              onClick={onNewGroup}
            >
              <PlusIcon />
              {t("variables.group.new")}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem className={MENU_ITEM} onClick={onCopy}>
          <CopyIcon />
          {t("variables.action.copyReference")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" className={MENU_ITEM} onClick={onDelete}>
          <Trash2Icon />
          {t("variables.action.delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The page. */
export function VariablesPage() {
  const { t } = useI18n()
  const store = React.useMemo(() => createRemoteVariableStore(), [])
  const [document, setDocument] = React.useState<VariableDocument | null>(null)
  const [failure, setFailure] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState("")
  const [group, setGroup] = React.useState<string | null>(null)
  const [revealed, setRevealed] = React.useState<ReadonlySet<string>>(new Set())
  const [createOpen, setCreateOpen] = React.useState(false)
  const [groupOpen, setGroupOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Variable | null>(null)
  const [renaming, setRenaming] = React.useState<Variable | null>(null)
  const [deleting, setDeleting] = React.useState<Variable | null>(null)
  /* A new group opened from "move to group" moves the row as soon as it exists. */
  const [moveAfterGroup, setMoveAfterGroup] = React.useState<Variable | null>(null)

  const load = React.useCallback(() => {
    void store.read()
      .then((next) => {
        setDocument(next)
        setFailure(null)
      })
      .catch((error: unknown) => {
        setFailure(textOf(error))
      })
  }, [store])

  React.useEffect(() => {
    load()
  }, [load])

  const toggle = (name: string) => {
    setRevealed((current) => {
      const next = new Set(current)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const counts = React.useMemo(() => {
    const found = new Map<string, number>()
    for (const variable of document?.variables ?? []) {
      found.set(variable.group, (found.get(variable.group) ?? 0) + 1)
    }
    return found
  }, [document])

  const rows = React.useMemo(() => {
    const visible = (document?.variables ?? []).filter((variable) => {
      if (group !== null && variable.group !== group) return false
      const needle = query.trim().toLowerCase()
      if (needle === "") return true
      return (
        variable.name.toLowerCase().includes(needle) ||
        variable.group.toLowerCase().includes(needle)
      )
    })
    const order = new Map((document?.groups ?? []).map((one, index) => [one, index]))
    return visible.sort((a, b) => {
      const byGroup = (order.get(a.group) ?? 0) - (order.get(b.group) ?? 0)
      return byGroup !== 0 ? byGroup : a.name.localeCompare(b.name)
    })
  }, [document, group, query])

  const remember = (next: VariableDocument) => {
    setDocument(next)
  }

  const create = async (drafts: VariableDraft[]) => {
    const next = await store.create(drafts)
    remember(next)
    setCreateOpen(false)
    toast.add({
      type: "success",
      title: t("variables.create.done").replace("{count}", String(drafts.length)),
    })
  }

  const createGroup = async (name: string): Promise<string> => {
    const next = await store.createGroup(name)
    remember(next)
    toast.add({ type: "success", title: t("variables.groupDialog.done") })
    return name
  }

  const saveValue = async (value: string) => {
    if (editing === null) return
    const next = await store.update(editing.name, { value })
    remember(next)
    setEditing(null)
    toast.add({ type: "success", title: t("variables.edit.done") })
  }

  const rename = async (name: string) => {
    if (renaming === null) return
    const next = await store.update(renaming.name, { name })
    remember(next)
    setRenaming(null)
    toast.add({ type: "success", title: t("variables.rename.done") })
  }

  const remove = async (variable: Variable) => {
    const next = await store.remove(variable.name)
    remember(next)
    setDeleting(null)
    toast.add({ type: "success", title: t("variables.delete.done") })
  }

  const move = (variable: Variable, nextGroup: string) => {
    if (variable.group === nextGroup) return
    void store
      .update(variable.name, { group: nextGroup })
      .then((next) => {
        remember(next)
        toast.add({
          type: "success",
          title: t("variables.move.done").replace("{group}", nextGroup),
        })
      })
      .catch((error: unknown) => {
        toast.add({ type: "error", title: textOf(error) })
      })
  }

  const copy = (variable: Variable) => {
    const ref = `\${${variable.name}}`
    void navigator.clipboard
      .writeText(ref)
      .then(() => {
        toast.add({
          type: "success",
          title: t("variables.copy.done").replace("{ref}", ref),
        })
      })
      .catch((error: unknown) => {
        toast.add({ type: "error", title: t("variables.copy.failed"), description: textOf(error) })
      })
  }

  const existing = new Set((document?.variables ?? []).map((variable) => variable.name))
  const groups = document?.groups ?? [DEFAULT_GROUP]

  return (
    <div className="-mx-6 bg-background">
      <div className="flex w-full flex-col gap-10 px-16 py-10 font-mono">
        <header className="flex flex-col gap-3">
          <span className="text-[12px] font-semibold tracking-[0.1em] text-ring">
            {t("variables.eyebrow")}
          </span>
          <h1 className="text-[44px] leading-none font-normal tracking-[-1px] text-foreground">
            {t("variables.title")}
          </h1>
          <p className="text-[16px] leading-relaxed text-copy">{t("variables.description")}</p>
        </header>

        <div className="flex items-center gap-3.5 rounded-2xl bg-secondary/40 px-5 py-[18px]">
          <KeyRoundIcon className="size-5 shrink-0 text-ring" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[14px] font-semibold text-foreground">
              {t("variables.banner.title")}
            </span>
            <span className="text-[13px] leading-relaxed text-copy">
              {t("variables.banner.description")}
            </span>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11.5px] font-medium text-copy">
            <EyeIcon className="size-3" />
            {t("variables.banner.chip")}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="relative w-[380px] max-w-full">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              placeholder={t("variables.search")}
              className="h-10 pl-9 text-[12.5px]"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <Button size="lg" className="gap-1.5 px-3.5" onClick={() => setCreateOpen(true)}>
            <PlusIcon />
            {t("variables.action.add")}
          </Button>
        </div>

        {failure !== null ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-5 py-4">
            <span className="flex items-center gap-2 text-[12.5px] text-destructive">
              <TriangleAlertIcon className="size-4" />
              {t("variables.load.failed")}
            </span>
            <span className="font-mono text-[11px] text-destructive/80">{failure}</span>
            <Button variant="outline" size="sm" onClick={load}>
              {t("variables.retry")}
            </Button>
          </div>
        ) : null}

        <div className="grid items-start gap-5 lg:grid-cols-[232px_minmax(0,1fr)]">
          <aside className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3">
            <div className="flex items-center justify-between px-2.5 pb-2 pt-1 text-[10.5px] font-semibold tracking-[0.05em] text-muted-foreground">
              <span>{t("variables.group.title")}</span>
              <span>{groups.length}</span>
            </div>
            <button
              type="button"
              onClick={() => setGroup(null)}
              className={cn(
                "flex h-9 items-center justify-between rounded-md px-2.5 text-[13px] transition-colors",
                group === null
                  ? "bg-secondary font-semibold text-foreground"
                  : "text-copy hover:bg-secondary/60"
              )}
            >
              <span>{t("variables.group.all")}</span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {document?.variables.length ?? 0}
              </span>
            </button>
            {groups.map((one) => (
              <button
                key={one}
                type="button"
                onClick={() => setGroup(one)}
                className={cn(
                  "flex h-9 items-center justify-between rounded-md px-2.5 text-[13px] transition-colors",
                  group === one
                    ? "bg-secondary font-semibold text-foreground"
                    : "text-copy hover:bg-secondary/60"
                )}
              >
                <span className="truncate">{one}</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {counts.get(one) ?? 0}
                </span>
              </button>
            ))}
            <div className="my-1 h-px bg-border" />
            <Button
              variant="ghost"
              size="sm"
              className="h-9 justify-start gap-1.5 px-2.5 text-[12.5px]"
              onClick={() => {
                setMoveAfterGroup(null)
                setGroupOpen(true)
              }}
            >
              <PlusIcon className="size-3.5" />
              {t("variables.group.new")}
            </Button>
          </aside>

          <section className="overflow-clip rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between gap-3 px-5 py-4">
              <span className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
                {group ?? t("variables.group.all")}
                <Badge variant="secondary" className="font-mono text-[10.5px]">
                  {rows.length}
                </Badge>
              </span>
              <span className="text-[11px] text-muted-foreground">{t("variables.list.hint")}</span>
            </div>

            <div className="hidden grid-cols-[minmax(0,1fr)_250px_92px_36px] gap-3 border-y border-border bg-secondary/40 px-5 py-2 text-[10.5px] font-semibold tracking-[0.05em] text-muted-foreground md:grid">
              <span>{t("variables.column.name")}</span>
              <span>{t("variables.column.value")}</span>
              <span>{t("variables.column.status")}</span>
              <span className="sr-only">{t("variables.column.actions")}</span>
            </div>

            {rows.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
                <VariableIcon className="size-6 text-muted-foreground" />
                <span className="text-[13px] font-medium text-foreground">
                  {t("variables.list.empty")}
                </span>
                <span className="text-[12px] text-muted-foreground">
                  {t("variables.list.emptyHint")}
                </span>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {rows.map((variable) => {
                  const set = variable.value !== ""
                  return (
                    <li
                      key={variable.name}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3.5 md:grid-cols-[minmax(0,1fr)_250px_92px_36px]"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 truncate font-mono text-[12.5px] font-semibold text-foreground">
                          {variable.name}
                        </span>
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          {variable.group}
                        </Badge>
                      </span>
                      <span className="hidden min-w-0 md:block">
                        <ValueCell
                          variable={variable}
                          revealed={revealed.has(variable.name)}
                          onToggle={() => toggle(variable.name)}
                        />
                      </span>
                      <span className="hidden items-center gap-1.5 text-[11.5px] md:flex">
                        <span
                          className={cn(
                            "size-1.5 rounded-full",
                            set ? "bg-chart-2" : "bg-chart-3"
                          )}
                        />
                        <span className="text-muted-foreground">
                          {t(set ? "variables.status.set" : "variables.status.unset")}
                        </span>
                      </span>
                      <span className="flex items-center justify-end">
                        <RowMenu
                          variable={variable}
                          groups={groups}
                          onEdit={() => setEditing(variable)}
                          onRename={() => setRenaming(variable)}
                          onMove={(next) => move(variable, next)}
                          onCopy={() => copy(variable)}
                          onDelete={() => setDeleting(variable)}
                          onNewGroup={() => {
                            setMoveAfterGroup(variable)
                            setGroupOpen(true)
                          }}
                        />
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}

            <div className="border-t border-border px-5 py-3.5">
              <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <LockIcon className="size-3.5" />
                {t("variables.footer.note")}
              </span>
            </div>
          </section>
        </div>
      </div>

      {createOpen ? (
        <CreateDialog
          open
          groups={groups}
          existing={existing}
          onOpenChange={setCreateOpen}
          onCreate={create}
          onCreateGroup={createGroup}
        />
      ) : null}

      {groupOpen ? (
        <GroupDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setGroupOpen(false)
              setMoveAfterGroup(null)
            }
          }}
          onCreate={async (name) => {
            await createGroup(name)
            setGroupOpen(false)
            if (moveAfterGroup !== null) {
              move(moveAfterGroup, name)
              setMoveAfterGroup(null)
            }
          }}
        />
      ) : null}

      {editing === null ? null : (
        <FieldDialog
          key={editing.name}
          open
          title={t("variables.edit.title")}
          description={t("variables.edit.description")}
          label={t("variables.edit.label")}
          value={editing.value}
          type="password"
          helper={t("variables.edit.helper")}
          submit={t("variables.edit.save")}
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
          onSubmit={saveValue}
        />
      )}

      {renaming === null ? null : (
        <FieldDialog
          key={renaming.name}
          open
          title={t("variables.rename.title")}
          description={t("variables.rename.description")}
          label={t("variables.rename.label")}
          value={renaming.name}
          helper={t("variables.rename.helper")}
          warning={t("variables.rename.warning").replace(
            "{ref}",
            `\${${renaming.name}}`
          )}
          submit={t("variables.rename.submit")}
          onOpenChange={(open) => {
            if (!open) setRenaming(null)
          }}
          onSubmit={rename}
        />
      )}

      {deleting === null ? null : (
        <DeleteDialog
          variable={deleting}
          open
          onOpenChange={(open) => {
            if (!open) setDeleting(null)
          }}
          onDelete={remove}
        />
      )}
    </div>
  )
}
