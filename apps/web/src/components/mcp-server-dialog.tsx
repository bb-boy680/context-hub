import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  PlusIcon,
  ShieldIcon,
  Trash2Icon,
  XIcon,
  type LucideIcon,
} from "lucide-react"
import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Switch } from "@workspace/ui/components/switch"

export type DetailServer = {
  name: string
  icon: LucideIcon
  tools: number
  resources: number
  transport: string
  connected: string
  command: string
}

const outline = "border-border bg-transparent dark:border-input dark:bg-transparent"

type Access = "Allow" | "Ask" | "Deny"

/* `Allow` reuses the data tint the design assigns it; `Ask` and `Deny` are their own tokens. */
const accessPill: Record<Access, string> = {
  Allow: "bg-chip-data text-chart-2",
  Ask: "bg-chip-ask text-chart-3",
  Deny: "bg-chip-deny text-chart-5",
}

const accessDot: Record<Access, string> = {
  Allow: "bg-chart-2",
  Ask: "bg-chart-3",
  Deny: "bg-chart-5",
}

type ToolAccess = { name: string; description: string; access: Access }

const serverTools: ToolAccess[] = [
  {
    name: "list_pull_requests",
    description: "List pull requests in a repository",
    access: "Allow",
  },
  {
    name: "create_pull_request",
    description: "Open a pull request from a branch",
    access: "Ask",
  },
  {
    name: "get_file_contents",
    description: "Read a file from a repository",
    access: "Allow",
  },
  {
    name: "search_issues",
    description: "Search issues and pull requests",
    access: "Allow",
  },
  {
    name: "merge_pull_request",
    description: "Merge a pull request",
    access: "Deny",
  },
  {
    name: "list_commits",
    description: "List commits on a branch",
    access: "Allow",
  },
  { name: "create_issue", description: "File a new issue", access: "Ask" },
  {
    name: "add_comment",
    description: "Comment on an issue or PR",
    access: "Allow",
  },
]

type LogLevel = "INFO" | "WARN" | "ERROR"
type LogLine = { time: string; level: LogLevel; message: string }

const logLevelOptions: ("All" | LogLevel)[] = ["All", "INFO", "WARN", "ERROR"]

const logLevelColor: Record<LogLevel, string> = {
  INFO: "text-secondary-foreground",
  WARN: "text-chart-3",
  ERROR: "text-chart-5",
}

const logLines: LogLine[] = [
  {
    time: "09:52:41",
    level: "INFO",
    message: "handshake complete, protocol 2025-06-18, 24 tools, 6 resources",
  },
  {
    time: "09:52:41",
    level: "INFO",
    message: "capabilities: tools, resources",
  },
  {
    time: "09:53:02",
    level: "WARN",
    message: "rate limit 82% of 5000/h used, throttling refresh",
  },
  {
    time: "09:54:18",
    level: "INFO",
    message: "tools/list served from cache (ttl 60s)",
  },
  {
    time: "09:55:07",
    level: "ERROR",
    message: "tools/call list_pull_requests failed: 401 Bad credentials",
  },
  {
    time: "09:55:07",
    level: "INFO",
    message: "retrying with refreshed token (attempt 1/3)",
  },
  {
    time: "09:55:09",
    level: "ERROR",
    message: "retry failed after 2s, backing off",
  },
  {
    time: "09:56:30",
    level: "WARN",
    message: "tool create_pull_request requires approval, queued",
  },
  {
    time: "09:57:12",
    level: "INFO",
    message: "tools/call get_file_contents ok in 86 ms",
  },
  {
    time: "09:58:44",
    level: "INFO",
    message: "resources/read served 2 resources from cache",
  },
  { time: "10:01:05", level: "INFO", message: "token refreshed, connection healthy" },
]

type EnvVar = { key: string; value: string; masked?: boolean }

const environment: EnvVar[] = [
  { key: "GITHUB_TOKEN", value: "ghp_••••••••••••4f2a", masked: true },
  { key: "GITHUB_ORG", value: "dsh-workspace" },
]

type Capability = { title: string; description: string; enabled: boolean }

const capabilities: Capability[] = [
  {
    title: "Tools",
    description: "Model can call the 24 tools this server exposes.",
    enabled: true,
  },
  {
    title: "Resources",
    description: "Model can read the 6 resources it publishes.",
    enabled: true,
  },
  {
    title: "Prompts",
    description: "Model can use its prompt templates.",
    enabled: false,
  },
  {
    title: "Sampling",
    description: "Server may request model completions.",
    enabled: false,
  },
]

function SectionHead({
  label,
  hint,
  action,
}: {
  label: string
  hint?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm leading-[17px] font-semibold">{label}</span>
      {hint ? (
        <span className="text-xs leading-[15px] text-muted-foreground">
          {hint}
        </span>
      ) : null}
      {action ? <div className="ml-auto">{action}</div> : null}
    </div>
  )
}

/** Borderless value box: the design shows these as filled fields, not editable inputs. */
function ValueField({
  children,
  className = "",
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`flex h-[38px] items-center gap-2 rounded-lg border border-input px-2.5 ${className}`}
    >
      {children}
    </div>
  )
}

function SelectField({
  value,
  className = "",
}: {
  value: string
  className?: string
}) {
  return (
    <div
      className={`flex h-9 items-center justify-between gap-2 rounded-lg border border-input px-2.5 ${className}`}
    >
      <span className="truncate text-sm">{value}</span>
      <ChevronDownIcon className="size-4 text-muted-foreground" />
    </div>
  )
}

function ConfigurationPanel({
  server,
  variables,
  onAddVariable,
}: {
  server: DetailServer
  variables: EnvVar[]
  onAddVariable: () => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <SectionHead
          label="Transport"
          hint="How the harness reaches this server"
        />
        <div className="flex items-start gap-4">
          <SelectField value="stdio" className="w-[180px] shrink-0" />
          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-xs leading-[15px] text-muted-foreground">
              Command
            </span>
            <ValueField>
              <span className="truncate font-mono text-xs">
                {server.command}
              </span>
            </ValueField>
          </label>
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        <SectionHead
          label="Environment"
          action={
            <Button
              variant="ghost"
              className="h-8 gap-1.5 px-2.5"
              onClick={onAddVariable}
            >
              <PlusIcon />
              Add variable
            </Button>
          }
        />
        <div className="flex flex-col gap-2">
          {variables.map((variable) => (
            <div key={variable.key} className="flex items-center gap-3">
              <ValueField className="w-[240px] shrink-0">
                <span className="truncate font-mono text-xs">
                  {variable.key}
                </span>
              </ValueField>
              <ValueField className="min-w-0 flex-1">
                <span className="truncate font-mono text-xs">
                  {variable.value}
                </span>
                {variable.masked ? (
                  <EyeIcon className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
                ) : null}
              </ValueField>
              <Button
                variant="outline"
                size="icon"
                className={outline}
                aria-label={`Remove ${variable.key}`}
              >
                <Trash2Icon />
              </Button>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        <SectionHead
          label="Capabilities"
          hint="What this server may expose to the model"
        />
        <div>
          {capabilities.map((capability) => (
            <div
              key={capability.title}
              className="flex h-[50px] items-center gap-3 border-b border-border"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm leading-[17px]">
                  {capability.title}
                </span>
                <span className="text-xs leading-[15px] text-muted-foreground">
                  {capability.description}
                </span>
              </div>
              <Switch
                defaultChecked={capability.enabled}
                aria-label={capability.title}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function AccessPill({ access }: { access: Access }) {
  return (
    <span
      className={`inline-flex h-[26px] w-fit items-center gap-1.5 rounded-full px-2.5 text-xs font-medium ${accessPill[access]}`}
    >
      <span className={`size-1.5 rounded-full ${accessDot[access]}`} />
      {access}
    </span>
  )
}

function ToolsPanel() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center gap-2.5 rounded-lg bg-notice-bg px-3.5 py-3 ring-1 ring-notice-border ring-inset">
        <ShieldIcon className="size-4 shrink-0 text-primary" />
        <span className="text-xs leading-[15px]">
          Access controls whether the model may call each tool. Ask prompts you
          before every call.
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm leading-[17px] font-semibold">
          Exposed tools
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-8">
            Allow all
          </Button>
          <Button variant="ghost" size="sm" className="h-8">
            Deny all
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
        <div className="flex h-9 shrink-0 items-center gap-4 border-b border-border px-2.5">
          <span className="w-[280px] shrink-0 px-2.5 text-sm text-muted-foreground">
            TOOL
          </span>
          <span className="min-w-0 flex-1 px-2.5 text-sm text-muted-foreground">
            DESCRIPTION
          </span>
          <span className="w-[120px] shrink-0 px-2.5 text-sm text-muted-foreground">
            ACCESS
          </span>
        </div>
        {serverTools.map((tool) => (
          <div
            key={tool.name}
            className="flex h-9 shrink-0 items-center gap-4 border-b border-border px-2.5 last:border-b-0"
          >
            <span className="w-[280px] shrink-0 truncate px-2.5 font-mono text-xs">
              {tool.name}
            </span>
            <span className="min-w-0 flex-1 truncate px-2.5 text-[13.5px] text-muted-foreground">
              {tool.description}
            </span>
            <span className="flex w-[120px] shrink-0 justify-end px-2.5">
              <AccessPill access={tool.access} />
            </span>
          </div>
        ))}
      </div>
      <div className="flex h-8 shrink-0 items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">1–8 of 24 tools</span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            disabled
            className={outline}
            aria-label="Previous page"
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className={outline}
            aria-label="Next page"
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>
    </div>
  )
}

function LogsPanel() {
  const [level, setLevel] = React.useState<"All" | LogLevel>("All")
  const visible =
    level === "All" ? logLines : logLines.filter((line) => line.level === level)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex h-8 gap-1 rounded-lg bg-muted p-1">
          {logLevelOptions.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={level === item}
              onClick={() => setLevel(item)}
              className={`h-6 rounded-md px-2.5 text-xs transition-colors ${
                level === item
                  ? "bg-accent font-semibold text-foreground"
                  : "font-medium text-muted-foreground hover:text-foreground"
              }`}
            >
              {item === "All" ? "All" : item[0] + item.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs leading-[15px] text-muted-foreground">
            Follow tail
          </span>
          <Switch defaultChecked aria-label="Follow tail" />
          <Button variant="ghost" size="sm" className="h-8">
            Clear
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto rounded-lg border border-input bg-surface-raised p-3 font-mono">
        {visible.map((line, index) => (
          <div key={index} className="flex gap-3 text-[11px] leading-[15px]">
            <span className="w-16 shrink-0 text-muted-foreground">
              {line.time}
            </span>
            <span className={`w-[46px] shrink-0 ${logLevelColor[line.level]}`}>
              {line.level}
            </span>
            <span className="min-w-0 flex-1 truncate text-secondary-foreground">
              {line.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

type DetailTab = "configuration" | "tools" | "logs"

const footerHint: Record<DetailTab, string> = {
  configuration: "Changing transport re-runs the handshake on save.",
  tools: "Access is checked before every tool call.",
  logs: "Buffering the last 500 entries.",
}

const footerAction: Record<DetailTab, string> = {
  configuration: "Test connection",
  tools: "Reset to default",
  logs: "Export log",
}

const detailTabs: { value: DetailTab; label: string }[] = [
  { value: "configuration", label: "Configuration" },
  { value: "tools", label: "Tools" },
  { value: "logs", label: "Logs" },
]

function ServerDetailBody({ server }: { server: DetailServer }) {
  const [tab, setTab] = React.useState<DetailTab>("configuration")
  const [variables, setVariables] = React.useState(environment)

  const tabClass = (value: DetailTab) =>
    `relative flex h-11 items-center px-3.5 text-sm transition-colors ${
      tab === value
        ? "font-semibold text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary"
        : "text-muted-foreground hover:text-foreground"
    }`

  const addVariable = () =>
    setVariables((current) => [...current, { key: "NAME", value: "value" }])

  return (
    <>
      <div className="flex h-[84px] shrink-0 items-center gap-3.5 px-6 pt-[22px] pb-[18px]">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-surface-image-tile ring-1 ring-border ring-inset">
          <server.icon className="size-5 text-secondary-foreground" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <DialogTitle className="text-[17px] leading-[21px] font-semibold">
            {server.name}
          </DialogTitle>
          <DialogDescription className="truncate text-[13px] leading-4">
            {`${server.tools} tools · ${server.resources} resources  ·  ${server.transport}  ·  connected ${server.connected}`}
          </DialogDescription>
        </div>
        <DialogClose
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto shrink-0"
              aria-label="Close"
            />
          }
        >
          <XIcon className="text-muted-foreground" />
        </DialogClose>
      </div>
      <div className="flex h-11 shrink-0 items-end gap-1 border-b border-border px-6">
        {detailTabs.map((item) => (
          <button
            key={item.value}
            type="button"
            className={tabClass(item.value)}
            onClick={() => setTab(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
        {tab === "configuration" ? (
          <ConfigurationPanel
            server={server}
            variables={variables}
            onAddVariable={addVariable}
          />
        ) : null}
        {tab === "tools" ? <ToolsPanel /> : null}
        {tab === "logs" ? <LogsPanel /> : null}
      </div>
      <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-t border-border px-6">
        <span className="text-xs text-muted-foreground">
          {footerHint[tab]}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" className={outline}>
            {footerAction[tab]}
          </Button>
          <Button className="w-[150px]">Save changes</Button>
        </div>
      </div>
    </>
  )
}

/** Detail dialog for one MCP server; opens on double-click from either view. */
export function McpServerDialog({
  server,
  onOpenChange,
}: {
  server: DetailServer | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={server !== null} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[725px] w-[920px] flex-col gap-0 rounded-lg bg-dialog p-0 shadow-[0_24px_56px_#0F172A3D] ring-glass-border backdrop-blur-xl sm:max-w-[920px]"
      >
        {server ? <ServerDetailBody key={server.name} server={server} /> : null}
      </DialogContent>
    </Dialog>
  )
}
