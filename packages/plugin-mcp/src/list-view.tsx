/**
 * The server ledger: a bulk bar that appears with a selection, a header row of
 * six fixed columns, and one row per server. Column widths are the design's, so
 * a row lines up with the canvas at the width the canvas was drawn at.
 */
import { PlugZapIcon } from "lucide-react"

import { cn } from "cn"

import { isEnabled } from "./installs.ts"
import { InstallToMenu, ServerControls, type ServerActions } from "./menus.tsx"
import {
  CheckNote,
  OffChip,
  PlaceChips,
  ServerTile,
  StatusPill,
  SyncChip,
  TransportChip,
  checkLine,
} from "./parts.tsx"
import type { McpAgentPlace, McpServer } from "./types.ts"
import { useI18n } from "@workspace/extensions/react"
import { Checkbox } from "@workspace/ui/components/checkbox"

/* Column widths from the canvas. Each column also carries its own width as a
   flex weight, so a window wider than the canvas hands out the extra space in
   the canvas's proportions instead of stretching the name column alone. */
const COLUMNS = {
  check: "min-w-0 shrink-0 grow-[32] basis-[32px]",
  server: "min-w-0 shrink-0 grow-[338] basis-[338px]",
  place: "min-w-0 shrink-0 grow-[136] basis-[136px]",
  checkNote: "min-w-0 shrink-0 grow-[150] basis-[150px]",
  status: "min-w-0 shrink-0 grow-[128] basis-[128px]",
  action: "min-w-0 shrink-0 grow-[244] basis-[244px]",
} as const

const rowShell = "flex h-[66px] items-center gap-3 px-5"

/* A checked box is the canvas's ink — near black on the light theme, white on
   the dark one. The `dark:` half is not optional: the shared component carries
   its own `dark:data-checked:bg-primary`, which outranks the plain override. */
const CHECKBOX = "size-[18px]"

/** A server installed nowhere, which the bulk menu draws its list against. */
const NOWHERE: McpServer = {
  id: "",
  name: "",
  transport: "stdio",
  declaration: "",
  description: "",
  places: [],
  unreadable: 0,
  installed: 0,
  status: "ready",
  mark: "generic",
  tag: "",
  detail: { declaration: null, tags: [], installs: [], tools: [] },
}

/** One row's action cluster: test, enablement, and the install target. */
function RowActionCluster({ server, actions }: { server: McpServer; actions: ServerActions }) {
  const { t } = useI18n()

  return (
    <>
      <button
        type="button"
        aria-label={t("mcp.action.testConnection")}
        disabled={actions.testing}
        onClick={(event) => {
          event.stopPropagation()
          actions.onTest()
        }}
        className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-secondary transition-colors hover:bg-muted"
      >
        <PlugZapIcon className={cn("size-[15px] text-copy", actions.testing && "animate-spin")} />
      </button>
      <ServerControls server={server} actions={actions} />
    </>
  )
}

/** One server as a ledger row. */
function ServerRow({
  server,
  actions,
  selected,
  onToggle,
  onOpen,
}: {
  server: McpServer
  actions: ServerActions
  selected: boolean
  onToggle: () => void
  onOpen: () => void
}) {
  const { t } = useI18n()

  return (
    <div
      className={cn(rowShell, "cursor-pointer border-b border-border", selected && "bg-muted")}
      onClick={onOpen}
    >
      <span
        className={cn("flex items-center justify-center", COLUMNS.check)}
        onClick={(event) => event.stopPropagation()}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={t("mcp.column.select")}
          className={CHECKBOX}
        />
      </span>

      <div className={cn("flex flex-col justify-center", COLUMNS.server)}>
        <div className="flex min-w-0 itemicon={server.check?.icon} s-center gap-4">
          <ServerTile mark={server.mark} />
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <div className="flex items-center gap-2">
              <span className="truncate text-[13.5px] leading-[1.3] font-semibold text-foreground">
                {server.name}
              </span>
              <TransportChip transport={server.transport} />
              {server.conflicts ? <SyncChip count={server.conflicts} /> : null}
            </div>
            <span className="truncate text-[11.5px] leading-[1.3] text-muted-soft">
              {server.description}
            </span>
          </div>
        </div>
      </div>

      <div className={COLUMNS.place}>
        <PlaceChips places={server.places} />
      </div>

      <div className={cn("flex items-center", COLUMNS.checkNote)}>
        <CheckNote text={checkLine(server, t)} ok={server.status === "ready"} />
      </div>

      <div className={cn("flex items-center gap-2", COLUMNS.status)}>
        <StatusPill status={server.status} />
        {/* The canvas tells "off" apart from "failing" by a second chip, so a
            server no client connects keeps the check's own verdict beside it. */}
        {isEnabled(server) ? null : <OffChip />}
      </div>

      <div className={cn("flex items-center gap-3", COLUMNS.action)}>
        <RowActionCluster server={server} actions={actions} />
      </div>
    </div>
  )
}

/** The ledger: bulk bar, header, and a row per server. */
export function ServerListView({
  servers,
  places,
  selected,
  onToggle,
  onToggleAll,
  onClearSelection,
  onInstallSelected,
  onOpen,
  rowActions,
}: {
  servers: McpServer[]
  places: readonly McpAgentPlace[]
  selected: ReadonlySet<string>
  onToggle: (id: string) => void
  onToggleAll: () => void
  onClearSelection: () => void
  onInstallSelected: (place: string) => void
  onOpen: (server: McpServer) => void
  rowActions: (server: McpServer) => ServerActions
}) {
  const { t } = useI18n()
  const allSelected = servers.length > 0 && servers.every((server) => selected.has(server.id))

  return (
    /* The canvas's 690px while the window can afford it, and a share of a short
       one otherwise: a fixed height pushed the footer off a laptop screen. */
    <div className="flex h-[min(690px,calc(100dvh-400px))] min-h-[280px] flex-col overflow-hidden rounded-xl border border-border bg-card">
      {/* The columns are the canvas's fixed widths, so a viewport narrower than
          the canvas scrolls the ledger rather than compressing the columns. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-x-auto overflow-y-hidden">
        <div className="flex w-full min-w-[1128px] flex-1 flex-col">
          {selected.size > 0 ? (
            <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border bg-muted px-5">
              <span className="inline-flex h-6 items-center rounded-full bg-foreground px-2.5 text-[12px] leading-[1.3] font-medium text-background">
                {t("mcp.bulk.selected").replace("{count}", String(selected.size))}
              </span>
              <span className="h-px flex-1" />
              <button
                type="button"
                onClick={onClearSelection}
                className="h-8 rounded-full px-3 text-[12.5px] font-medium text-copy hover:bg-secondary"
              >
                {t("mcp.bulk.clear")}
              </button>
              {/* A batch is spread over several servers, so the menu is drawn
                  against a server installed nowhere: every place reads
                  unchecked, which is what "install into this one" means here. */}
              <InstallToMenu
                server={NOWHERE}
                places={places}
                onToggle={onInstallSelected}
              />
            </div>
          ) : null}

          <div className={cn(rowShell, "h-10 shrink-0 gap-3")}>
            <span className={cn("flex items-center justify-center", COLUMNS.check)}>
              <Checkbox
                checked={allSelected}
                onCheckedChange={onToggleAll}
                aria-label={t("mcp.column.select")}
                className={CHECKBOX}
              />
            </span>
            {(
              [
                ["server", "mcp.column.server", COLUMNS.server],
                ["place", "mcp.column.place", COLUMNS.place],
                ["check", "mcp.column.check", COLUMNS.checkNote],
                ["status", "mcp.column.status", COLUMNS.status],
                ["action", "mcp.column.action", COLUMNS.action],
              ] as const
            ).map(([key, label, column]) => (
              <span
                key={key}
                className={cn(
                  "truncate text-[12px] leading-[1.3] font-semibold tracking-[0.3px] text-muted-foreground",
                  column
                )}
              >
                {t(label)}
              </span>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-clip">
            {servers.map((server) => (
              <ServerRow
                key={server.id}
                server={server}
                actions={rowActions(server)}
                selected={selected.has(server.id)}
                onToggle={() => onToggle(server.id)}
                onOpen={() => onOpen(server)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
