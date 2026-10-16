import {
  ChevronRightIcon,
  GaugeIcon,
  PlugIcon,
  PlusIcon,
  ServerIcon,
  SparklesIcon,
  StethoscopeIcon,
  type LucideIcon,
} from "lucide-react"
import * as React from "react"

import { TablePagination } from "@context-hub/extensions/components"
import { Badge } from "@context-hub/shadcn-ui/components/badge"
import { Button } from "@context-hub/shadcn-ui/components/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@context-hub/shadcn-ui/components/card"
import { Checkbox } from "@context-hub/shadcn-ui/components/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@context-hub/shadcn-ui/components/select"
import { Switch } from "@context-hub/shadcn-ui/components/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@context-hub/shadcn-ui/components/table"

const cardSurface =
  "[--card-spacing:1.5rem] rounded-lg ring-glass-border shadow-glass backdrop-blur-glass"

const kpis: {
  label: string
  icon: LucideIcon
  value: string
  detail: string
}[] = [
  {
    label: "Skills",
    icon: SparklesIcon,
    value: "42",
    detail: "38 enabled · 4 disabled",
  },
  {
    label: "MCP servers",
    icon: ServerIcon,
    value: "8",
    detail: "6 connected · 2 errors",
  },
  {
    label: "Plugins",
    icon: PlugIcon,
    value: "17",
    detail: "15 enabled · 1 warning",
  },
  {
    label: "Context tokens",
    icon: GaugeIcon,
    value: "18.4k",
    detail: "of 32k budget",
  },
]

const chartDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const chartValues = [42, 58, 51, 73, 64, 88, 76]
const chartMax = 90

const issues: { name: string; reason: string; severity: "error" | "warning" }[] =
  [
    { name: "github-mcp", reason: "Connection refused", severity: "error" },
    {
      name: "playwright-mcp",
      reason: "Handshake timed out",
      severity: "warning",
    },
    {
      name: "legacy-bridge",
      reason: "Missing .claude-plugin/plugin.json",
      severity: "warning",
    },
  ]

const severityDot = {
  error: "bg-chart-5",
  warning: "bg-chart-3",
} as const

type SourceStatus = "Ready" | "Error" | "Warning"

const statusDot: Record<SourceStatus, string> = {
  Ready: "bg-chart-2",
  Error: "bg-chart-5",
  Warning: "bg-chart-3",
}

const sources: {
  name: string
  type: string
  status: SourceStatus
  tokens: string
  lastUsed: string
  enabled: boolean
}[] = [
  {
    name: "pdf-extract",
    type: "Skill",
    status: "Ready",
    tokens: "1.2k",
    lastUsed: "2 hours ago",
    enabled: true,
  },
  {
    name: "github-mcp",
    type: "MCP server",
    status: "Error",
    tokens: "2.8k",
    lastUsed: "12 minutes ago",
    enabled: true,
  },
  {
    name: "code-review",
    type: "Skill",
    status: "Ready",
    tokens: "2.4k",
    lastUsed: "yesterday",
    enabled: true,
  },
  {
    name: "playwright-mcp",
    type: "MCP server",
    status: "Warning",
    tokens: "3.1k",
    lastUsed: "1 hour ago",
    enabled: false,
  },
  {
    name: "engineering-kit",
    type: "Plugin",
    status: "Ready",
    tokens: "1.9k",
    lastUsed: "3 days ago",
    enabled: true,
  },
]

/* Column widths include the 16px gutter the design leaves between columns. */
const columns = [
  { label: "", width: 32 },
  { label: "NAME", width: 432 },
  { label: "TYPE", width: 126 },
  { label: "STATUS", width: 166 },
  { label: "TOKENS", width: 106 },
  { label: "LAST USED", width: 146 },
  { label: "ENABLED", width: 80 },
]

function PageTitleRow() {
  const [range, setRange] = React.useState("Last 7 days")

  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Context health across skills, MCP servers, and plugins.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Select
          value={range}
          onValueChange={(value) => {
            if (value) setRange(value)
          }}
        >
          <SelectTrigger
            className="w-[150px] data-[size=default]:h-9"
            aria-label="Time range"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Last 24 hours">Last 24 hours</SelectItem>
            <SelectItem value="Last 7 days">Last 7 days</SelectItem>
            <SelectItem value="Last 30 days">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
        <Button size="lg" className="px-3.5">
          <PlusIcon />
          Add source
        </Button>
      </div>
    </div>
  )
}

function KpiRow() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <Card
          key={kpi.label}
          className="gap-2 rounded-lg py-5 [--card-spacing:1.25rem] ring-glass-border shadow-glass backdrop-blur-glass"
        >
          <div className="flex items-center justify-between px-5">
            <span className="text-sm font-medium text-muted-foreground">
              {kpi.label}
            </span>
            <kpi.icon className="size-4 text-muted-foreground" />
          </div>
          <div className="px-5 text-2xl font-semibold">{kpi.value}</div>
          <p className="px-5 text-xs text-muted-foreground">{kpi.detail}</p>
        </Card>
      ))}
    </div>
  )
}

function ChartCard() {
  return (
    <Card className={`${cardSurface} gap-3`}>
      <CardHeader className="gap-1">
        <CardTitle className="text-base leading-tight font-semibold">
          Context requests
        </CardTitle>
        <CardDescription className="text-sm leading-snug">
          Requests per day across enabled sources
        </CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-3 px-6">
        <div className="flex h-[193px]">
          <div className="relative w-10 shrink-0 text-[11px] text-muted-foreground">
            <span className="absolute top-[5px] left-0">90</span>
            <span className="absolute top-[91px] left-0">45</span>
            <span className="absolute top-[177px] left-0">0</span>
          </div>
          <div className="relative flex-1">
            <div className="absolute inset-x-0 top-[12px] h-px bg-border" />
            <div className="absolute inset-x-0 top-[98px] h-px bg-border" />
            <div className="absolute inset-x-0 top-[184px] h-px bg-border" />
            <div className="absolute inset-x-0 top-[12px] flex h-[172px] items-end">
              {chartValues.map((value, index) => (
                <div
                  key={chartDays[index]}
                  className="flex h-full flex-1 items-end justify-center"
                >
                  <div
                    className="w-9 rounded-t bg-chart-1"
                    style={{ height: `${(value / chartMax) * 100}%` }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex">
          <div className="w-10 shrink-0" />
          <div className="flex flex-1">
            {chartDays.map((day) => (
              <span
                key={day}
                className="flex-1 text-center text-xs text-muted-foreground"
              >
                {day}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}

function NeedsAttentionCard() {
  return (
    <Card className={`${cardSurface} gap-3`}>
      <CardHeader className="gap-1">
        <CardTitle className="text-base leading-tight font-semibold">
          Needs attention
        </CardTitle>
        <CardDescription className="text-sm leading-snug">
          2 errors and 1 warning
        </CardDescription>
      </CardHeader>
      <div className="flex flex-1 flex-col px-6">
        {issues.map((issue) => (
          <div key={issue.name} className="flex items-center gap-3 py-3">
            <span className="flex size-4 shrink-0 items-center justify-center">
              <span
                className={`size-2 rounded-full ${severityDot[issue.severity]}`}
              />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-medium">
                {issue.name}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {issue.reason}
              </span>
            </div>
            <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
          </div>
        ))}
      </div>
      <div className="px-6">
        <Button
          variant="outline"
          className="border-input bg-transparent dark:bg-transparent"
        >
          <StethoscopeIcon />
          Open diagnostics
        </Button>
      </div>
    </Card>
  )
}

function SourcesCard() {
  return (
    <Card className={`${cardSurface} gap-4`}>
      <CardHeader className="gap-1">
        <CardTitle className="text-base leading-tight font-semibold">
          Sources
        </CardTitle>
        <CardDescription className="text-sm leading-snug">
          Every skill, MCP server, and plugin in this workspace
        </CardDescription>
      </CardHeader>
      <div className="px-6">
        <Table className="table-fixed [&_td]:p-0 [&_th]:px-0">
          <TableHeader>
            <TableRow>
              {columns.map((column, index) => (
                <TableHead
                  key={column.label || index}
                  style={{ width: column.width }}
                  className="text-muted-foreground"
                >
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources.map((source) => (
              <TableRow key={source.name} className="h-[41px]">
                <TableCell>
                  <Checkbox defaultChecked aria-label={`Select ${source.name}`} />
                </TableCell>
                <TableCell className="font-medium">{source.name}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="font-semibold">
                    {source.type}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-2.5 text-xs font-semibold">
                    <span
                      className={`size-2 rounded-full ${statusDot[source.status]}`}
                    />
                    {source.status}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-muted-foreground">
                  {source.tokens}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {source.lastUsed}
                </TableCell>
                <TableCell>
                  <Switch defaultChecked={source.enabled} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between px-6">
        <span className="text-sm text-muted-foreground">
          1–5 of 67 sources
        </span>
        <TablePagination pageText="Page 1 of 14" />
      </div>
    </Card>
  )
}

export function OverviewPage() {
  return (
    <>
      <PageTitleRow />
      <KpiRow />
      <div className="grid gap-6 lg:grid-cols-[732fr_380fr]">
        <ChartCard />
        <NeedsAttentionCard />
      </div>
      <SourcesCard />
    </>
  )
}
