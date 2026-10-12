/**
 * The 工具 tab: one collapsible card per tool, and the JSON-Schema tree its
 * input and output expand into. The tree is the whole point of the tab — a tool
 * is only usable if its arguments are legible — so the rows carry the type, the
 * required mark, the name, and the schema's own description.
 */
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import * as React from "react"

import { cn } from "cn"

import type { McpField, McpTool } from "./tools.ts"
import { useI18n } from "@workspace/extensions/react"

/** The glyph a type badge carries, at the canvas's 10.5px mono. */
const TYPE_GLYPH: Record<McpField["type"], string> = {
  object: "{}",
  array: "[]",
  string: "Aa",
  number: "#",
  boolean: "○",
}

/** One rendered tree row: where it sits, and what it says. */
interface TreeRow {
  depth: number
  label: string
  field: McpField
  /** Whether the row can expand, which is also when it draws a chevron. */
  expandable: boolean
}

/**
 * Flatten a schema into rows. An object contributes its properties one level
 * deeper; an array contributes a single `[name.items]` row for an object item,
 * because a primitive item has nothing under it to show.
 */
function flatten(fields: McpField[], depth: number): TreeRow[] {
  const rows: TreeRow[] = []
  for (const field of fields) {
    rows.push({
      depth,
      label: field.name,
      field,
      expandable: field.type === "object" && Boolean(field.children?.length),
    })
    if (field.type === "object" && field.children) {
      rows.push(...flatten(field.children, depth + 1))
      continue
    }
    if (field.type === "array" && field.children) {
      const item = field.children[0]!
      if (item.type === "object" && item.children) {
        rows.push({
          depth: depth + 1,
          label: `[${field.name}.items]`,
          field: { ...item, required: false, description: undefined },
          expandable: true,
        })
        rows.push(...flatten(item.children, depth + 2))
      }
    }
  }
  return rows
}

/** One line of a schema tree. */
function TreeLine({ row }: { row: TreeRow }) {
  const { field } = row

  return (
    <div className="flex h-[26px] items-center gap-1.5">
      {Array.from({ length: row.depth }, (_, index) => (
        <span key={index} className="flex h-[26px] w-4 shrink-0 items-center justify-center">
          <span className="h-[26px] w-px bg-border" />
        </span>
      ))}
      <span className="flex size-[14px] shrink-0 items-center justify-center">
        {row.expandable ? <ChevronDownIcon className="size-[14px] text-muted-soft" /> : null}
      </span>
      <span className="flex h-[18px] w-6 shrink-0 items-center justify-center rounded-xs bg-muted font-mono text-[10.5px] leading-none text-muted-foreground">
        {TYPE_GLYPH[field.type]}
      </span>
      <span
        className={cn(
          "w-2 shrink-0 font-mono text-[12px] leading-[1.3] font-semibold",
          field.required ? "text-destructive" : "text-transparent"
        )}
      >
        *
      </span>
      <span
        className={cn(
          "shrink-0 font-mono text-[12px] leading-[1.3]",
          field.required ? "font-semibold text-foreground" : "text-copy"
        )}
      >
        {row.label}
      </span>
      {field.description ? (
        <span className="truncate text-[12px] leading-[1.3] text-muted-foreground">
          {field.description}
        </span>
      ) : null}
    </div>
  )
}

/** One labelled tree: the root row, then everything under it. */
function Tree({ root, fields, description }: { root: string; fields: McpField[]; description: string }) {
  const rows: TreeRow[] = [
    {
      depth: 0,
      label: root,
      field: { name: root, type: "object", description },
      expandable: true,
    },
    ...flatten(fields, 1),
  ]

  return (
    <div className="flex flex-col gap-[3px]">
      {rows.map((row) => (
        <TreeLine key={`${row.depth}-${row.label}`} row={row} />
      ))}
    </div>
  )
}

/** One tool card: the always-visible head and description, and the schema body. */
function ToolCard({ tool }: { tool: McpTool }) {
  const { t } = useI18n()
  const [open, setOpen] = React.useState(false)

  return (
    <div className="overflow-clip rounded-lg border border-border bg-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-11 w-full items-center gap-2.5 px-4 text-left transition-colors hover:bg-muted"
      >
        {open ? (
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="shrink-0 font-mono text-[12px] leading-[1.3] font-semibold text-foreground">
          {tool.name}
        </span>
        <span className="shrink-0 text-[12px] leading-[1.3] text-muted-foreground">：</span>
        <span className="truncate text-[12px] leading-[1.3] text-copy">{tool.title}</span>
      </button>

      <div className="px-4 pb-3 pl-[42px]">
        <p className="truncate text-[12px] leading-[1.25] text-muted-foreground">
          {tool.description}
        </p>
      </div>

      {open ? (
        <div className="flex flex-col gap-2.5 border-t border-border pt-3 pr-4 pb-4 pl-[42px]">
          <div className="flex flex-col gap-1.5">
            <span className="text-[11.5px] leading-[1.3] font-semibold text-muted-foreground">
              {t("mcp.detail.tools.input")}
            </span>
            <Tree
              root="input"
              fields={tool.input}
              description={
                tool.inputDescription === ""
                  ? t("mcp.detail.tools.inputDesc")
                  : tool.inputDescription
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11.5px] leading-[1.3] font-semibold text-muted-foreground">
              {t("mcp.detail.tools.output")}
            </span>
            {/* The output schema is optional, and many servers never write one.
                A bare root row would read as "nothing to see", so a server that
                declared neither fields nor a sentence gets told apart from one
                whose output is simply not described here. */}
            {tool.output.length === 0 && tool.outputDescription === "" ? (
              <span className="text-[12px] leading-[1.4] text-muted-soft">
                {t("mcp.detail.tools.noOutput")}
              </span>
            ) : (
              <Tree
                root="output"
                fields={tool.output}
                description={
                  tool.outputDescription === ""
                    ? t("mcp.detail.tools.outputDesc")
                    : tool.outputDescription
                }
              />
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** The tools pane: a section head with the count, then the tool cards. */
export function ToolsPane({ tools, empty }: { tools: McpTool[]; empty: string }) {
  const { t } = useI18n()

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex h-[30px] shrink-0 items-center gap-2">
        <span className="text-[11.5px] leading-[1.3] font-semibold text-muted-soft">
          {t("mcp.detail.tab.tools")}
        </span>
        <span className="text-[12px] leading-[1.3] text-foreground">
          {t("mcp.detail.tools.count").replace("{count}", String(tools.length))}
        </span>
      </div>
      {/* The cards stack in the pane's own scroll, so this list keeps no
          scroller of its own and every tab's scrollbar sits in one place. */}
      {tools.length === 0 ? (
        <span className="text-[12.5px] leading-[1.5] text-muted-foreground">{empty}</span>
      ) : (
        <div className="flex flex-col gap-1.5">
          {tools.map((tool) => (
            <ToolCard key={tool.name} tool={tool} />
          ))}
        </div>
      )}
    </div>
  )
}
