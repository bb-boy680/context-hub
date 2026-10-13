/**
 * The server ledger: the shared table, with this module's own cells in it.
 *
 * The strip, the header, and a row's chrome belong to `Ledger`; what a row
 * shows — the server, where it is declared, what the last check found, which
 * clients connect it, and the actions — is this page's business, so each column
 * brings its own cell. The shares are the canvas's column widths over its total,
 * which is what keeps the proportions when a wider window hands out slack.
 */
import { PlugZapIcon } from "lucide-react"

import { cn } from "cn"

import { isEnabled, isInstalled } from "./installs.ts"
import { InstallToMenu, ServerControls, type ServerActions } from "./menus.tsx"
import {
  AgentStack,
  CheckNote,
  LibraryChip,
  OffChip,
  ServerTile,
  StatusPill,
  SyncChip,
  TransportChip,
  UnstoredChip,
  checkLine,
} from "./parts.tsx"
import type { McpAgentPlace, McpServer } from "./types.ts"
import { useI18n } from "@workspace/extensions/react"
import { Ledger, type LedgerColumn } from "@workspace/extensions/components"

/** A server installed nowhere, which the batch menu draws its list against. */
const NOWHERE: McpServer = {
  id: "",
  name: "",
  transport: "stdio",
  declaration: "",
  description: "",
  unreadable: 0,
  installed: 0,
  stored: false,
  status: "ready",
  mark: "generic",
  tag: "",
  detail: { declaration: null, tags: [], installs: [], tools: [] },
}

/** One row's action cluster: test, enablement, and the install target. */
function RowActionCluster({ server, actions }: { server: McpServer; actions: ServerActions }) {
  const { t } = useI18n()

  return (
    <div className="flex items-center gap-3">
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
    </div>
  )
}

/** The ledger: the shared table, filled with one row per server. */
export function ServerListView({
  servers,
  places,
  selected,
  age,
  onCheck,
  onInstallSelected,
  onOpen,
  rowActions,
}: {
  servers: McpServer[]
  places: readonly McpAgentPlace[]
  selected: ReadonlySet<string>
  /** How long ago one server was checked, which its own cell says. */
  age: (server: McpServer) => string
  onCheck: (keys: string[]) => void
  onInstallSelected: (place: string) => void
  onOpen: (server: McpServer) => void
  rowActions: (server: McpServer) => ServerActions
}) {
  const { t } = useI18n()

  const columns: LedgerColumn<McpServer>[] = [
    { key: "select", width: "3.1%" },
    {
      key: "server",
      label: t("mcp.column.server"),
      width: "32.9%",
      cell: (server) => (
        <div className="flex min-w-0 items-center gap-4">
          <ServerTile mark={server.mark} icon={server.check?.icon} />
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <div className="flex items-center gap-2">
              <span className="truncate text-[13.5px] leading-[1.3] font-semibold text-foreground">
                {server.name}
              </span>
              <TransportChip transport={server.transport} />
              {server.stored ? null : <UnstoredChip />}
              {server.conflicts ? <SyncChip count={server.conflicts} /> : null}
            </div>
            {/* A server that says nothing about itself reads as the sentence
                saying so, rather than an empty line that looks unloaded. */}
            <span className="truncate text-[11.5px] leading-[1.3] text-muted-soft">
              {server.description || t("mcp.description.missing")}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "place",
      label: t("mcp.column.place"),
      width: "13.2%",
      /* Which agents hold it, as their own marks, beside the hub's record when
         it has one. A server no client file declares keeps the record chip
         alone, which is what it is. */
      cell: (server) => (
        <div className="flex min-w-0 items-center gap-2">
          {server.stored ? <LibraryChip /> : null}
          <AgentStack server={server} places={places} />
        </div>
      ),
    },
    {
      key: "check",
      label: t("mcp.column.check"),
      width: "14.6%",
      cell: (server) => <CheckNote line={checkLine(server, t, age(server))} />,
    },
    {
      key: "status",
      label: t("mcp.column.status"),
      width: "12.5%",
      cell: (server) => (
        <div className="flex items-center gap-2">
          <StatusPill status={server.status} />
          {/* The canvas tells "off" apart from "failing" by a second chip, so a
              server a client holds and none connects keeps the check's own
              verdict beside it. A server no file holds has no state to report:
              the place column already says it is installed nowhere. */}
          {isInstalled(server) && !isEnabled(server) ? <OffChip /> : null}
        </div>
      ),
    },
    {
      key: "action",
      label: t("mcp.column.action"),
      width: "23.7%",
      cell: (server) => <RowActionCluster server={server} actions={rowActions(server)} />,
    },
  ]

  return (
    <Ledger
      columns={columns}
      rows={servers}
      rowKey={(server) => server.id}
      checked={[...selected]}
      onCheck={onCheck}
      selectLabel={(server) => `${t("mcp.column.select")} ${server.name}`}
      selectAllLabel={t("mcp.column.selectAll")}
      batch={{
        label: t("mcp.bulk.selected").replace("{count}", String(selected.size)),
        clearLabel: t("mcp.bulk.clear"),
        onClear: () => onCheck([]),
        /* A batch is spread over several servers, so the menu is drawn against
           a server installed nowhere: every place reads unchecked, which is
           what "install into this one" means here. */
        action: (
          <InstallToMenu
            server={NOWHERE}
            places={places}
            onToggle={onInstallSelected}
            disabled={selected.size === 0}
          />
        ),
      }}
      onOpen={onOpen}
    />
  )
}
