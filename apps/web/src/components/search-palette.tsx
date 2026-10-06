import * as React from "react"
import {
  FileTextIcon,
  LayoutGridIcon,
  PlugIcon,
  SearchIcon,
  ServerIcon,
  SparklesIcon,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

type SearchResult = {
  name: string
  detail: string
  kind: "Skill" | "MCP" | "Plugin"
}

type SearchGroup = {
  label: string
  icon: LucideIcon
  results: SearchResult[]
}

const searchGroups: SearchGroup[] = [
  {
    label: "Skills",
    icon: FileTextIcon,
    results: [
      {
        name: "pdf-extract",
        detail: "Extract tables from PDFs and scans  ·  Workspace",
        kind: "Skill",
      },
      {
        name: "pdf-forms",
        detail: "Fill and flatten AcroForm fields  ·  skill.sh",
        kind: "Skill",
      },
    ],
  },
  {
    label: "MCP servers",
    icon: ServerIcon,
    results: [
      { name: "docling-mcp", detail: "6 tools  ·  connected", kind: "MCP" },
      { name: "filesystem-mcp", detail: "9 tools  ·  connected", kind: "MCP" },
    ],
  },
  {
    label: "Plugins",
    icon: PlugIcon,
    results: [
      {
        name: "engineering-kit",
        detail: "official marketplace  ·  12 skills  ·  v2.1.0",
        kind: "Plugin",
      },
    ],
  },
]

const filters = [
  { label: "All", icon: LayoutGridIcon },
  { label: "Skills", icon: SparklesIcon },
  { label: "MCP servers", icon: ServerIcon },
  { label: "Plugins", icon: PlugIcon },
] as const

const hints = ["↑↓  Navigate", "↵  Open", "Esc  Close"]

/**
 * Ctrl+K palette over the current page. Results are the fixed set the design
 * shows; the filter chips select a group and the query field is not wired to
 * the list yet.
 */
export function SearchPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = React.useState("pdf")
  const [activeFilter, setActiveFilter] =
    React.useState<(typeof filters)[number]["label"]>("All")

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  const visibleGroups = searchGroups.filter(
    (group) => activeFilter === "All" || group.label === activeFilter
  )
  const cursor = visibleGroups[0]?.results[0]
  const count = visibleGroups.reduce(
    (total, group) => total + group.results.length,
    0
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search context"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[calc(100vh-2rem)] w-[640px] max-w-full flex-col overflow-hidden rounded-lg bg-dialog shadow-[0_24px_56px_#0F172A3D] ring-1 ring-glass-border backdrop-blur-xl"
      >
        <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-border px-4">
          <SearchIcon className="size-[17px] shrink-0 text-primary" />
          <input
            autoFocus
            aria-label="Search query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none"
          />
          <span className="flex h-[22px] shrink-0 items-center justify-center rounded-[5px] bg-muted px-[7px] font-mono text-[11px] text-muted-foreground">
            Esc
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-4 py-2.5">
          {filters.map((filter) => (
            <button
              key={filter.label}
              type="button"
              aria-pressed={filter.label === activeFilter}
              onClick={() => setActiveFilter(filter.label)}
              className={cn(
                "flex h-[26px] shrink-0 items-center justify-center gap-1.5 rounded-full border px-2.5 text-[12.5px] transition-colors",
                filter.label === activeFilter
                  ? "border-transparent bg-primary font-semibold text-primary-foreground"
                  : "border-border font-medium text-muted-foreground hover:bg-muted"
              )}
            >
              <filter.icon className="size-3" />
              {filter.label}
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2">
          {visibleGroups.map((group) => (
            <div key={group.label}>
              <div className="px-2.5 pt-2 pb-1 text-[10.5px] leading-[14px] text-muted-foreground uppercase">
                {group.label}
              </div>
              {group.results.map((result) => {
                const isCursor = result === cursor

                return (
                  <div
                    key={result.name}
                    className={cn(
                      "flex h-[52px] items-center gap-2.5 rounded-md px-2.5",
                      isCursor ? "bg-muted" : "hover:bg-muted/60"
                    )}
                  >
                    <group.icon
                      className={cn(
                        "size-4 shrink-0",
                        isCursor ? "text-foreground" : "text-muted-foreground"
                      )}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[13.5px] leading-4 font-medium">
                        {result.name}
                      </span>
                      <span className="truncate text-xs leading-[15px] text-muted-foreground">
                        {result.detail}
                      </span>
                    </div>
                    <span className="flex h-5 shrink-0 items-center justify-center rounded-full border border-border px-2 text-[11.5px] text-muted-foreground">
                      {result.kind}
                    </span>
                    {isCursor ? (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        ↵
                      </span>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        <div className="flex h-11 shrink-0 items-center gap-4 border-t border-border px-4">
          {hints.map((hint) => (
            <span
              key={hint}
              className="flex h-[22px] items-center justify-center rounded-[5px] bg-muted px-[7px] font-mono text-[11px] whitespace-pre text-muted-foreground"
            >
              {hint}
            </span>
          ))}
          <span className="flex-1" />
          <span className="text-xs text-muted-foreground">
            {count} {count === 1 ? "result" : "results"}
          </span>
        </div>
      </div>
    </div>
  )
}
