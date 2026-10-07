import {
  ArchiveIcon,
  BookOpenIcon,
  BugIcon,
  DatabaseIcon,
  FolderIcon,
  GitForkIcon,
  GlobeIcon,
  LayoutGridIcon,
  ListChecksIcon,
  ListIcon,
  MessageSquareIcon,
  PlusIcon,
  RefreshCwIcon,
  type LucideIcon,
} from "lucide-react"
import * as React from "react"

import {
  AddMcpServerDialog,
  type AddServerTab,
} from "@/components/add-mcp-server-dialog"
import {
  McpServerDialog,
  type DetailServer,
} from "@/components/mcp-server-dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Switch } from "@workspace/ui/components/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { TablePagination } from "@workspace/ui/components/table-pagination"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"

const cardSurface =
  "[--card-spacing:1.25rem] rounded-lg ring-glass-border shadow-glass backdrop-blur-glass"

const outline = "border-border bg-transparent dark:border-input dark:bg-transparent"

type ServerStatus = "Ready" | "Warning" | "Error"
type Transport = "stdio" | "sse" | "http"

const statusDot: Record<ServerStatus, string> = {
  Ready: "bg-chart-2",
  Warning: "bg-chart-3",
  Error: "bg-chart-5",
}

type McpServer = {
  name: string
  icon: LucideIcon
  transport: Transport
  tools: number
  resources: number
  latency: string
  /* The card abbreviates the time; the detail dialog spells it out. */
  updated: string
  connected: string
  status: ServerStatus
  enabled: boolean
  command: string
}

const servers: McpServer[] = [
  {
    name: "github-mcp",
    icon: GitForkIcon,
    transport: "stdio",
    tools: 24,
    resources: 6,
    latency: "412 ms",
    updated: "12 min ago",
    connected: "12 minutes ago",
    status: "Error",
    enabled: true,
    command: "npx -y @modelcontextprotocol/server-github",
  },
  {
    name: "playwright-mcp",
    icon: GlobeIcon,
    transport: "stdio",
    tools: 18,
    resources: 2,
    latency: "1.9 s",
    updated: "1 hour ago",
    connected: "1 hour ago",
    status: "Warning",
    enabled: false,
    command: "npx -y @playwright/mcp@latest",
  },
  {
    name: "filesystem-mcp",
    icon: FolderIcon,
    transport: "stdio",
    tools: 9,
    resources: 14,
    latency: "86 ms",
    updated: "3 min ago",
    connected: "3 minutes ago",
    status: "Ready",
    enabled: true,
    command: "npx -y @modelcontextprotocol/server-filesystem ./",
  },
  {
    name: "postgres-mcp",
    icon: DatabaseIcon,
    transport: "sse",
    tools: 12,
    resources: 4,
    latency: "204 ms",
    updated: "8 min ago",
    connected: "8 minutes ago",
    status: "Ready",
    enabled: true,
    command: "npx -y @database-labs/postgres-mcp",
  },
  {
    name: "slack-mcp",
    icon: MessageSquareIcon,
    transport: "http",
    tools: 7,
    resources: 3,
    latency: "318 ms",
    updated: "22 min ago",
    connected: "22 minutes ago",
    status: "Ready",
    enabled: true,
    command: "npx -y @community/slack-mcp",
  },
  {
    name: "linear-mcp",
    icon: ListChecksIcon,
    transport: "http",
    tools: 14,
    resources: 5,
    latency: "276 ms",
    updated: "40 min ago",
    connected: "40 minutes ago",
    status: "Ready",
    enabled: true,
    command: "npx -y @linear/mcp-server",
  },
  {
    name: "sentry-mcp",
    icon: BugIcon,
    transport: "sse",
    tools: 6,
    resources: 1,
    latency: "4.2 s",
    updated: "1 hour ago",
    connected: "1 hour ago",
    status: "Warning",
    enabled: true,
    command: "npx -y @sentry/mcp-server",
  },
  {
    name: "dsh-jira-legacy",
    icon: ArchiveIcon,
    transport: "stdio",
    tools: 11,
    resources: 0,
    latency: "—",
    updated: "2 days ago",
    connected: "2 days ago",
    status: "Error",
    enabled: false,
    command: "npx -y @dsh/jira-legacy-bridge",
  },
  {
    name: "context7-mcp",
    icon: BookOpenIcon,
    transport: "http",
    tools: 5,
    resources: 2,
    latency: "190 ms",
    updated: "yesterday",
    connected: "yesterday",
    status: "Ready",
    enabled: true,
    command: "npx -y @upstash/context7-mcp",
  },
]

const tabs = [
  { value: "all", label: "All 9" },
  { value: "connected", label: "Connected 7" },
  { value: "errors", label: "Errors 2" },
  { value: "disabled", label: "Disabled 2" },
]

type ToolCall = {
  time: string
  tool: string
  server: string
  duration: string
  status: ServerStatus
}

const toolCalls: ToolCall[] = [
  {
    time: "09:52",
    tool: "list_pull_requests",
    server: "github-mcp",
    duration: "412 ms",
    status: "Error",
  },
  {
    time: "09:47",
    tool: "browser_navigate",
    server: "playwright-mcp",
    duration: "1.9 s",
    status: "Warning",
  },
  {
    time: "09:41",
    tool: "read_file",
    server: "filesystem-mcp",
    duration: "86 ms",
    status: "Ready",
  },
]

/* Column widths include the 16px gutter the design leaves between columns. */
const serverColumns = [
  { label: "SERVER", width: 426 },
  { label: "TRANSPORT", width: 146 },
  { label: "RESOURCES", width: 166 },
  { label: "LATENCY", width: 126 },
  { label: "STATUS", width: 156 },
  { label: "ENABLED", width: 76 },
]

const toolCallColumns = [
  { label: "TIME", width: 126 },
  { label: "TOOL", width: 478 },
  { label: "SERVER", width: 236 },
  { label: "DURATION", width: 126 },
  { label: "STATUS", width: 130 },
]

const viewToggleSurface = "flex h-9 gap-1 rounded-lg bg-muted p-1"

function resourceCount(server: McpServer) {
  const word = server.resources === 1 ? "resource" : "resources"
  return `${server.tools} tools · ${server.resources} ${word}`
}

function StatusBadge({ status }: { status: ServerStatus }) {
  return (
    <Badge variant="outline" className="gap-1.5">
      <span className={`size-1.5 rounded-full ${statusDot[status]}`} />
      {status}
    </Badge>
  )
}

function TransportBadge({ transport }: { transport: string }) {
  return (
    <Badge variant="outline" className="gap-1.5">
      <span className="size-1.5 rounded-full bg-muted-foreground" />
      {transport}
    </Badge>
  )
}

function ServerTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-image-tile ring-1 ring-border ring-inset">
      <Icon className="size-[17px] text-secondary-foreground" />
    </span>
  )
}

function toDetail(server: McpServer): DetailServer {
  return {
    name: server.name,
    icon: server.icon,
    tools: server.tools,
    resources: server.resources,
    transport: server.transport,
    connected: server.connected,
    command: server.command,
  }
}

function ServerCard({
  server,
  onOpen,
}: {
  server: McpServer
  onOpen: () => void
}) {
  return (
    <div
      onDoubleClick={onOpen}
      className="flex h-[143px] cursor-pointer flex-col gap-3 rounded-lg bg-card p-5 ring-1 ring-glass-border shadow-glass backdrop-blur-glass"
    >
      <div className="flex items-center gap-2.5">
        <ServerTile icon={server.icon} />
        <span className="truncate text-sm font-medium">{server.name}</span>
        <span
          className="ml-auto shrink-0"
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <Switch
            defaultChecked={server.enabled}
            aria-label={`Enable ${server.name}`}
          />
        </span>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge status={server.status} />
        <TransportBadge transport={server.transport} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground">
          {resourceCount(server)}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {server.latency}  ·  {server.updated}
        </span>
      </div>
    </div>
  )
}

function ServerGrid({ onOpen }: { onOpen: (server: McpServer) => void }) {
  return (
    <div className="grid grid-cols-3 gap-6">
      {servers.map((server) => (
        <ServerCard
          key={server.name}
          server={server}
          onOpen={() => onOpen(server)}
        />
      ))}
    </div>
  )
}

function ServerTable({ onOpen }: { onOpen: (server: McpServer) => void }) {
  return (
    <Card className={`${cardSurface} gap-4`}>
      <CardHeader className="gap-1">
        <CardTitle className="text-base leading-tight font-semibold">
          Connected servers
        </CardTitle>
        <CardDescription className="text-sm leading-snug">
          Every MCP server registered in this workspace
        </CardDescription>
      </CardHeader>
      <div className="px-5">
        <Table className="table-fixed [&_td]:p-0 [&_th]:h-[38px] [&_th]:px-0">
          <TableHeader>
            <TableRow className="h-[38px]">
              {serverColumns.map((column) => (
                <TableHead
                  key={column.label}
                  style={{ width: column.width }}
                  className="text-muted-foreground"
                >
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {servers.map((server) => (
              <TableRow
                key={server.name}
                onDoubleClick={() => onOpen(server)}
                className="h-[38px] cursor-pointer"
              >
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <server.icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm">{server.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <TransportBadge transport={server.transport} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {resourceCount(server)}
                </TableCell>
                <TableCell className="text-[12.5px] text-muted-foreground">
                  {server.latency}
                </TableCell>
                <TableCell>
                  <StatusBadge status={server.status} />
                </TableCell>
                <TableCell
                  onDoubleClick={(event) => event.stopPropagation()}
                >
                  <Switch
                    defaultChecked={server.enabled}
                    aria-label={`Enable ${server.name}`}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between px-5">
        <span className="text-sm text-muted-foreground">1–9 of 9 servers</span>
        <TablePagination pageText="Page 1 of 1" />
      </div>
    </Card>
  )
}

function ToolCallsCard() {
  return (
    <Card className={`${cardSurface} gap-3`}>
      <CardHeader className="gap-1">
        <CardTitle className="text-base leading-tight font-semibold">
          Recent tool calls
        </CardTitle>
        <CardDescription className="text-sm leading-snug">
          Requests routed through MCP servers in the last hour
        </CardDescription>
      </CardHeader>
      <div className="px-5">
        <Table className="table-fixed [&_td]:p-0 [&_th]:h-8 [&_th]:px-0">
          <TableHeader>
            <TableRow className="h-8">
              {toolCallColumns.map((column) => (
                <TableHead
                  key={column.label}
                  style={{ width: column.width }}
                  className="text-muted-foreground"
                >
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {toolCalls.map((call) => (
              <TableRow key={call.tool} className="h-8">
                <TableCell className="text-[12.5px] text-muted-foreground">
                  {call.time}
                </TableCell>
                <TableCell className="font-mono text-[12.5px]">
                  {call.tool}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {call.server}
                </TableCell>
                <TableCell className="text-[12.5px] text-muted-foreground">
                  {call.duration}
                </TableCell>
                <TableCell>
                  <StatusBadge status={call.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between px-5">
        <span className="text-sm text-muted-foreground">
          Showing 3 of 128 calls
        </span>
        <Button variant="ghost" className="h-9">
          Open traces
        </Button>
      </div>
    </Card>
  )
}

function PageTitleRow({ onAddServer }: { onAddServer: () => void }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">MCP servers</h1>
        <p className="text-sm text-muted-foreground">
          Connect Model Context Protocol servers and expose their tools.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Select defaultValue="All transports">
          <SelectTrigger
            className={`w-[160px] data-[size=default]:h-9 ${outline}`}
            aria-label="Transport"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["All transports", "stdio", "SSE", "HTTP"].map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" className={`h-9 gap-2 px-4 ${outline}`}>
          <RefreshCwIcon className="text-muted-foreground" />
          Restart all
        </Button>
        <Button className="h-9 gap-2 px-4" onClick={onAddServer}>
          <PlusIcon />
          Add server
        </Button>
      </div>
    </div>
  )
}

function ViewButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: LucideIcon
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={onClick}
      className={`flex h-7 w-9 items-center justify-center rounded-md transition-colors ${
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="size-4" />
    </button>
  )
}

export function McpServersPage() {
  const [tab, setTab] = React.useState(tabs[0].value)
  const [view, setView] = React.useState<"grid" | "list">("list")
  const [addTab, setAddTab] = React.useState<AddServerTab | null>(null)
  const [detail, setDetail] = React.useState<McpServer | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)

  const openDetail = (server: McpServer) => {
    setDetail(server)
    setDetailOpen(true)
  }

  return (
    <>
      <PageTitleRow onAddServer={() => setAddTab("registry")} />
      <Tabs value={tab} onValueChange={setTab} className="gap-6">
        <div className="flex items-start justify-between gap-6">
          <TabsList className="h-9 gap-1 rounded-lg p-1">
            {tabs.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className="h-7 flex-none rounded-md px-3 text-[13px] text-muted-foreground data-active:bg-accent data-active:text-foreground dark:data-active:bg-accent dark:data-active:text-foreground"
              >
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className={viewToggleSurface}>
            <ViewButton
              icon={LayoutGridIcon}
              label="Grid view"
              active={view === "grid"}
              onClick={() => setView("grid")}
            />
            <ViewButton
              icon={ListIcon}
              label="List view"
              active={view === "list"}
              onClick={() => setView("list")}
            />
          </div>
        </div>
        <TabsContent value={tab} className="flex flex-col gap-6">
          {view === "grid" ? (
            <>
              <ServerGrid onOpen={openDetail} />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  1–9 of 9 servers
                </span>
                <TablePagination pageText="Page 1 of 1" />
              </div>
            </>
          ) : (
            <ServerTable onOpen={openDetail} />
          )}
          <ToolCallsCard />
        </TabsContent>
      </Tabs>
      <McpServerDialog
        server={detailOpen && detail ? toDetail(detail) : null}
        onOpenChange={(open) => {
          if (!open) setDetailOpen(false)
        }}
      />
      <AddMcpServerDialog
        open={addTab !== null}
        tab={addTab ?? "registry"}
        onTabChange={setAddTab}
        onOpenChange={(open) => {
          if (!open) setAddTab(null)
        }}
      />
    </>
  )
}
