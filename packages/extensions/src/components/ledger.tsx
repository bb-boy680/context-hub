/**
 * The ledger: the card, the strip that heads it, and one row per record.
 *
 * Two screens read the same way — a tick column, a row of fields, and the
 * actions at the end — so the chrome lives here and each caller hands over what
 * its own cells hold. The columns carry their shares of the table as widths, so
 * a window wider than the design hands the extra space out in the design's
 * proportions rather than stretching one column.
 *
 * The strip is drawn whether or not a row is ticked: a batch action has to be
 * visible to be discovered, and a bar that comes and goes shifts the rows under
 * the pointer that just ticked one. What the batch can do belongs to the caller,
 * which is why the strip takes its action as a node.
 */
import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

/** One column of a ledger: its head, its share of the table, and its cells. */
export interface LedgerColumn<T> {
  key: string
  /** The head's words. The tick column has none: its head is the select-all box. */
  label?: string
  /** The column's share of the table, e.g. `43.1%`; the shares add up to 100. */
  width: string
  /** What this column holds in one row. A column without a cell is the tick
      column, which the ledger draws itself. */
  cell?: (row: T) => React.ReactNode
}

/** What the strip above the table states and offers. */
export interface LedgerBatch {
  /** The ticked count, already worded for the active locale. */
  label: string
  /** The button that empties the selection. */
  clearLabel: string
  onClear: () => void
  /** The one action a batch can take, e.g. a menu of install targets. */
  action?: React.ReactNode
}

const CARD = "[--card-spacing:1.5rem] gap-0 overflow-hidden rounded-xl ring-1 ring-border py-0"
const STRIP =
  "flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface-raised px-5"
const PILL =
  "flex h-7 items-center rounded-full bg-foreground px-3 text-[12.5px] font-semibold text-background"
const CLEAR =
  "ml-auto h-[34px] rounded-full border-border bg-transparent px-4 text-[13px] font-semibold dark:border-input dark:bg-transparent"
const HEAD = "text-[12px] font-semibold text-muted-soft"
/* A ticked row keeps its tint under the pointer: both classes are background
   utilities, and the merged class list is what decides the order. */
const ROW =
  "h-[66px] cursor-pointer border-b border-border outline-none last:border-b-0 hover:bg-accent/40 focus-visible:bg-accent/40"
/* The tick box wears the row's ink, at the size the canvas draws it. */
const BOX = "size-[18px] rounded-[4px]"

/** The padding one cell carries, which depends on where it sits in the row. */
function pad(index: number, count: number): string {
  if (index === 0) return "p-0 pl-5"
  return index === count - 1 ? "p-0 pr-5 pl-3.5" : "p-0 pl-3.5"
}

/**
 * The ledger's own table, with the tick column and the batch strip around it.
 *
 * @param columns — the head and the cells, in reading order.
 * @param rows — one row per record, in the order the page sends them.
 * @param rowKey — a row's identity, which the selection travels in.
 * @param checked — the keys of the ticked rows.
 * @param onCheck — the whole selection after a tick, not the one row that moved.
 * @param selectLabel — one row's accessible name for its tick box.
 * @param selectAllLabel — the accessible name of the head's tick box.
 * @param batch — the strip: what is ticked, how to empty it, what a batch does.
 * @param onOpen — what a row does when pressed; without it rows are read-only.
 */
export function Ledger<T>({
  columns,
  rows,
  rowKey,
  checked,
  onCheck,
  selectLabel,
  selectAllLabel,
  batch,
  onOpen,
}: {
  columns: readonly LedgerColumn<T>[]
  rows: readonly T[]
  rowKey: (row: T) => string
  checked: readonly string[]
  onCheck: (keys: string[]) => void
  selectLabel: (row: T) => string
  selectAllLabel: string
  batch: LedgerBatch
  onOpen?: (row: T) => void
}) {
  const keys = rows.map(rowKey)
  const allChecked = keys.length > 0 && keys.every((key) => checked.includes(key))
  const someChecked = checked.length > 0 && !allChecked

  return (
    <Card className={CARD}>
      <div className={STRIP}>
        <span className={PILL}>{batch.label}</span>
        <Button
          type="button"
          variant="outline"
          disabled={checked.length === 0}
          onClick={batch.onClear}
          className={CLEAR}
        >
          {batch.clearLabel}
        </Button>
        {batch.action}
      </div>
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="h-11 border-b border-border hover:bg-transparent">
            {columns.map((column, index) => (
              <TableHead
                key={column.key}
                style={{ width: column.width }}
                className={`${pad(index, columns.length)} ${
                  column.cell === undefined ? "" : HEAD
                }`}
              >
                {/* The head takes the whole page's rows at once; a page that is
                    only partly ticked shows the dash rather than a check. */}
                {column.cell === undefined ? (
                  <Checkbox
                    checked={allChecked}
                    indeterminate={someChecked}
                    onCheckedChange={(next) => onCheck(next === true ? keys : [])}
                    aria-label={selectAllLabel}
                    className={BOX}
                  />
                ) : (
                  column.label
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const key = rowKey(row)
            const ticked = checked.includes(key)

            return (
              <TableRow
                key={key}
                tabIndex={0}
                onClick={onOpen === undefined ? undefined : () => onOpen(row)}
                /* A row is not a button, so it answers the two keys a button
                   would rather than pretending to be one. */
                onKeyDown={(event) => {
                  if (onOpen === undefined) return
                  if (event.key !== "Enter" && event.key !== " ") return
                  if (event.target !== event.currentTarget) return
                  event.preventDefault()
                  onOpen(row)
                }}
                className={`${ROW} ${ticked ? "bg-muted" : ""}`}
              >
                {columns.map((column, index) => (
                  <TableCell
                    key={column.key}
                    className={pad(index, columns.length)}
                    /* A tick must not also follow the row's own press. */
                    onClick={column.cell === undefined ? (event) => event.stopPropagation() : undefined}
                  >
                    {column.cell === undefined ? (
                      <Checkbox
                        checked={ticked}
                        onCheckedChange={(next) => {
                          onCheck(
                            next === true
                              ? [...checked, key]
                              : checked.filter((item) => item !== key)
                          )
                        }}
                        aria-label={selectLabel(row)}
                        className={BOX}
                      />
                    ) : (
                      column.cell(row)
                    )}
                  </TableCell>
                ))}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </Card>
  )
}
