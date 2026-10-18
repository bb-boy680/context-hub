/**
 * The variable panel MCP's inputs open on `$`.
 *
 * It is a panel, not an input: the field that owns the text keeps the keyboard
 * focus for the whole interaction. The panel only displays, filters by the text
 * typed after `$`, and listens for the arrows, Enter and Escape on the anchor
 * field's own keydown events. That is what keeps typing and caret movement in
 * the field working while the panel is open.
 *
 * The filter is the caller's `query`, not a field of this component; the caller
 * updates it as the user types. The panel reads the library itself when it
 * opens, so a consumer only hands it an anchor and a callback.
 */
import { SearchIcon, VariableIcon } from "lucide-react"
import * as React from "react"

import { cn } from "cn"

import { useI18n } from "@context-hub/extensions/react"
import { Badge } from "@context-hub/shadcn-ui/components/badge"
import { Popover, PopoverContent } from "@context-hub/shadcn-ui/components/popover"

import { createRemoteVariableStore } from "../remote-store.ts"
import type { Variable, VariableDocument } from "../store.ts"

/** What a caller supplies; the panel owns everything else. */
export interface VariablePickerProps {
  /** Whether the panel is on screen. A caller usually mounts it only when open. */
  open: boolean
  /** The field being edited; it keeps focus and receives the key events. */
  anchor?: React.RefObject<HTMLElement | null>
  /** The text already typed after `$`, used as the filter and shown in the header. */
  query?: string
  /** Called with the bare variable name; the caller writes `${name}`. */
  onPick: (name: string) => void
  onOpenChange: (open: boolean) => void
}

/** One group's count, including zero. */
function countOf(variables: readonly Variable[], group: string): number {
  return variables.filter((variable) => variable.group === group).length
}

export function VariablePicker({
  open,
  anchor,
  query = "",
  onPick,
  onOpenChange,
}: VariablePickerProps) {
  const { t } = useI18n()
  const store = React.useMemo(() => createRemoteVariableStore(), [])
  const [document, setDocument] = React.useState<VariableDocument | null>(null)
  const [failure, setFailure] = React.useState<string | null>(null)
  const [group, setGroup] = React.useState<string | null>(null)
  const [activeName, setActiveName] = React.useState<string | null>(null)
  const listRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    let cancelled = false
    void store
      .read()
      .then((next) => {
        if (!cancelled) setDocument(next)
      })
      .catch((error: unknown) => {
        if (!cancelled) setFailure(error instanceof Error ? error.message : String(error))
      })
    return () => {
      cancelled = true
    }
  }, [store])

  const needle = query.trim().toLowerCase()
  const rows = React.useMemo(() => {
    if (document === null) return []
    const order = new Map(document.groups.map((one, at) => [one, at]))
    return document.variables
      .filter((variable) => {
        if (group !== null && variable.group !== group) return false
        return needle === "" || variable.name.toLowerCase().includes(needle)
      })
      .sort((a, b) => {
        const byGroup = (order.get(a.group) ?? 0) - (order.get(b.group) ?? 0)
        return byGroup !== 0 ? byGroup : a.name.localeCompare(b.name)
      })
  }, [document, group, needle])

  /* The selected row is remembered by name, so typing another filter keeps it
     selected while it is still a match, and otherwise falls back to the first. */
  const found = rows.findIndex((row) => row.name === activeName)
  const active = rows.length === 0 ? -1 : found < 0 ? 0 : found

  React.useEffect(() => {
    if (active < 0) return
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [active])

  /* The field keeps focus; the panel listens on it while it is open. */
  React.useEffect(() => {
    const field = anchor?.current
    if (!open || field === null || field === undefined) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault()
        event.stopPropagation()
        const next = rows[Math.min(active + 1, rows.length - 1)]
        if (next !== undefined) setActiveName(next.name)
        return
      }
      if (event.key === "ArrowUp") {
        event.preventDefault()
        event.stopPropagation()
        const next = rows[Math.max(active - 1, 0)]
        if (next !== undefined) setActiveName(next.name)
        return
      }
      if (event.key === "Enter") {
        const row = rows[active]
        if (row === undefined) return
        event.preventDefault()
        event.stopPropagation()
        onPick(row.name)
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        onOpenChange(false)
      }
    }

    field.addEventListener("keydown", onKey, true)
    return () => field.removeEventListener("keydown", onKey, true)
  }, [open, anchor, rows, active, onPick, onOpenChange])

  const groups = document?.groups ?? []
  const variables = document?.variables ?? []

  return (
    <Popover open={open} onOpenChange={onOpenChange} modal={false}>
      <PopoverContent
        anchor={anchor}
        side="bottom"
        align="start"
        sideOffset={6}
        initialFocus={false}
        finalFocus={false}
        className="flex h-[440px] w-[560px] flex-col gap-0 overflow-clip rounded-xl border border-border bg-card p-0 shadow-lg ring-0"
      >
        <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-border px-3.5">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <span
            className={cn(
              "min-w-0 flex-1 truncate font-mono text-[12.5px]",
              query === "" ? "text-muted-foreground" : "text-foreground"
            )}
          >
            {query === "" ? t("variables.search") : `$${query}`}
          </span>
          <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">
            {t("variables.list.count").replace("{count}", String(rows.length))}
          </span>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[156px_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col gap-0.5 overflow-y-auto border-r border-border bg-secondary/40 p-2">
            <span className="px-2 pb-1 pt-1 text-[10.5px] font-semibold tracking-[0.05em] text-muted-foreground">
              {t("variables.group.title")}
            </span>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setGroup(null)
                setActiveName(null)
              }}
              className={cn(
                "flex h-8 items-center justify-between rounded-md px-2 text-[12px]",
                group === null
                  ? "bg-card font-semibold text-foreground shadow-sm"
                  : "text-copy hover:bg-secondary/60"
              )}
            >
              <span>{t("variables.picker.all")}</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {variables.length}
              </span>
            </button>
            {groups.map((one) => (
              <button
                key={one}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setGroup(one)
                  setActiveName(null)
                }}
                className={cn(
                  "flex h-8 items-center justify-between rounded-md px-2 text-[12px]",
                  group === one
                    ? "bg-card font-semibold text-foreground shadow-sm"
                    : "text-copy hover:bg-secondary/60"
                )}
              >
                <span className="truncate">{one}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {countOf(variables, one)}
                </span>
              </button>
            ))}
          </div>

          <div
            ref={listRef}
            className="flex min-h-0 flex-col gap-0.5 overflow-y-auto p-1.5"
          >
            {failure !== null ? (
              <p className="px-2 py-6 text-center text-[12px] text-destructive">{failure}</p>
            ) : document === null ? (
              <p className="px-2 py-6 text-center text-[12px] text-muted-foreground">
                {t("variables.picker.loading")}
              </p>
            ) : rows.length === 0 ? (
              <p className="px-2 py-6 text-center text-[12px] text-muted-foreground">
                {t("variables.picker.empty")}
              </p>
            ) : (
              rows.map((variable, at) => (
                <button
                  key={variable.name}
                  type="button"
                  data-index={at}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveName(variable.name)}
                  onClick={() => onPick(variable.name)}
                  className={cn(
                    "flex h-9 shrink-0 items-center gap-2 rounded-md px-2.5 text-left",
                    at === active ? "bg-secondary" : "hover:bg-secondary/60"
                  )}
                >
                  <VariableIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground">
                    {variable.name}
                  </span>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {variable.group}
                  </Badge>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-t border-border px-3.5 text-[10.5px] text-muted-foreground">
          <span className="truncate font-mono">{t("variables.picker.hint")}</span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-card px-1 font-mono text-[9.5px]">
                ↑↓
              </kbd>
              {t("variables.picker.select")}
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-card px-1 font-mono text-[9.5px]">
                ↵
              </kbd>
              {t("variables.picker.insert")}
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-card px-1 font-mono text-[9.5px]">
                Esc
              </kbd>
              {t("variables.picker.close")}
            </span>
          </span>
        </div>
      </PopoverContent>
    </Popover>
  )
}
