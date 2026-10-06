import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PencilIcon,
  PlugIcon,
  PlusIcon,
  SearchIcon,
  ServerIcon,
  TerminalIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import * as React from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"

export type AddServerTab = "registry" | "manual"

const outline = "border-border bg-transparent dark:border-input dark:bg-transparent"

const segments: { value: AddServerTab; label: string }[] = [
  { value: "registry", label: "Browse registry" },
  { value: "manual", label: "Manual setup" },
]

const transports = ["stdio", "SSE", "HTTP"]

type RegistryServer = {
  name: string
  author: string
  description: string
  tools: string
  tint: string
  installed?: boolean
}

const registryServers: RegistryServer[] = [
  {
    name: "github-mcp",
    author: "github",
    description: "Pull requests, issues and code search",
    tools: "24 tools",
    tint: "#33415533",
  },
  {
    name: "filesystem-mcp",
    author: "modelcontextprotocol",
    description: "Scoped read and write access to folders",
    tools: "9 tools",
    tint: "#60A5FA33",
  },
  {
    name: "postgres-mcp",
    author: "database-labs",
    description: "Query and inspect PostgreSQL databases",
    tools: "12 tools",
    tint: "#34D39933",
    installed: true,
  },
  {
    name: "slack-mcp",
    author: "community",
    description: "Read channels and post messages",
    tools: "7 tools",
    tint: "#F472B633",
  },
  {
    name: "playwright-mcp",
    author: "microsoft",
    description: "Drive a real browser from the model",
    tools: "18 tools",
    tint: "#A78BFA33",
  },
  {
    name: "sentry-mcp",
    author: "sentry",
    description: "Issues, releases and stack traces",
    tools: "6 tools",
    tint: "#F59E0B33",
  },
]

function SegmentRow({
  tab,
  onTabChange,
}: {
  tab: AddServerTab
  onTabChange: (tab: AddServerTab) => void
}) {
  return (
    <div className="px-6 pb-4">
      <div className="flex h-9 gap-1 rounded-lg bg-muted p-1">
        {segments.map((segment) => (
          <button
            key={segment.value}
            type="button"
            role="tab"
            aria-selected={tab === segment.value}
            onClick={() => onTabChange(segment.value)}
            className={`h-7 flex-1 rounded-md text-[13px] transition-colors ${
              tab === segment.value
                ? "bg-accent font-semibold text-foreground"
                : "font-medium text-muted-foreground hover:text-foreground"
            }`}
          >
            {segment.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function CompactPager({ pageText }: { pageText: string }) {
  return (
    <div className="flex h-8 items-center gap-4">
      <span className="text-xs text-muted-foreground">{pageText}</span>
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
  )
}

function RegistryResults() {
  return (
    <>
      <div className="px-6 pb-3.5">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-primary" />
          <Input
            className="h-10 border-primary pl-9"
            placeholder="Search the MCP registry"
            aria-label="Search the MCP registry"
          />
        </div>
      </div>
      <div className="h-px shrink-0 bg-border" />
      <div className="flex items-center justify-between px-6 pt-3 pb-2">
        <span className="text-xs leading-[15px] text-muted-foreground">
          Official &amp; verified servers
        </span>
        <span className="text-xs leading-[15px] text-muted-foreground">
          stdio, SSE or HTTP
        </span>
      </div>
      <ul>
        {registryServers.map((server) => (
          <li key={server.name} className="flex h-[68px] items-center gap-3.5 px-6">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: server.tint }}
            >
              <ServerIcon className="size-[18px] text-secondary-foreground" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-semibold">{server.name}</span>
                <span className="text-xs text-muted-foreground">
                  by @{server.author}
                </span>
              </div>
              <span className="truncate text-xs text-muted-foreground">
                {server.description}
              </span>
            </div>
            <span className="w-[84px] shrink-0 text-xs text-muted-foreground">
              {server.tools}
            </span>
            {server.installed ? (
              <Badge variant="outline" className="w-[84px] justify-center">
                <CheckIcon className="text-chart-2" />
                Installed
              </Badge>
            ) : (
              <Button className="w-[84px] gap-1.5">
                <PlusIcon />
                Add
              </Button>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

function ManualSetup() {
  const [name, setName] = React.useState("docs-mcp")
  const [transport, setTransport] = React.useState("stdio")
  const [command, setCommand] = React.useState(
    "npx -y @modelcontextprotocol/server-docs"
  )
  const [args, setArgs] = React.useState("--root ./docs --watch")

  return (
    <div className="flex flex-col gap-5 px-6 py-6">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs leading-[15px] text-muted-foreground">Name</span>
        <Input
          className="h-[38px] text-[13.5px]"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs leading-[15px] text-muted-foreground">
          Transport
        </span>
        <div className="flex h-9 gap-1 rounded-lg bg-muted p-1">
          {transports.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={transport === item}
              onClick={() => setTransport(item)}
              className={`h-7 flex-1 rounded-md text-[13px] transition-colors ${
                transport === item
                  ? "bg-accent font-semibold text-foreground"
                  : "font-medium text-muted-foreground hover:text-foreground"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs leading-[15px] text-muted-foreground">
          Command
        </span>
        <Input
          className="h-[38px] font-mono text-xs"
          value={command}
          onChange={(event) => setCommand(event.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs leading-[15px] text-muted-foreground">
          Arguments
        </span>
        <div className="relative">
          <TerminalIcon className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-[38px] pl-8 font-mono text-xs"
            value={args}
            onChange={(event) => setArgs(event.target.value)}
          />
        </div>
      </label>
      <div className="flex flex-col gap-2.5">
        <div className="flex h-8 items-center gap-2">
          <span className="text-xs leading-[15px] text-muted-foreground">
            Environment (optional)
          </span>
          <Button variant="ghost" className="ml-auto h-8 gap-1.5 px-2.5">
            <PlusIcon />
            Add variable
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <Input
            className="h-9 w-[240px] shrink-0 font-mono text-xs"
            placeholder="NAME"
            aria-label="Variable name"
          />
          <Input
            className="h-9 min-w-0 flex-1 font-mono text-xs"
            placeholder="value"
            aria-label="Variable value"
          />
          <Button
            variant="outline"
            size="icon"
            className={outline}
            aria-label="Remove variable"
          >
            <Trash2Icon />
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Add-server dialog: the public registry and a hand-written config are two tabs of one flow. */
export function AddMcpServerDialog({
  open,
  tab,
  onTabChange,
  onOpenChange,
}: {
  open: boolean
  tab: AddServerTab
  onTabChange: (tab: AddServerTab) => void
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 rounded-lg bg-dialog p-0 shadow-[0_24px_56px_#0F172A3D] ring-glass-border backdrop-blur-xl sm:max-w-[640px]"
      >
        <div className="flex items-start gap-4 px-6 pt-[22px] pb-[18px]">
          <div className="flex flex-col gap-[5px]">
            <DialogTitle className="text-base leading-[19px] font-semibold">
              Add MCP server
            </DialogTitle>
            <DialogDescription className="text-sm leading-[17px]">
              Install a known server or point the harness at your own.
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
        <SegmentRow tab={tab} onTabChange={onTabChange} />
        {tab === "registry" ? <RegistryResults /> : <ManualSetup />}
        <div className="flex h-16 items-center justify-between gap-3 border-t border-border px-6">
          {tab === "registry" ? (
            <>
              <span className="text-xs text-muted-foreground">
                1–6 of 214 servers
              </span>
              <div className="flex items-center gap-2">
                <CompactPager pageText="Page 1 of 36" />
                <DialogClose render={<Button variant="ghost" />}>
                  Cancel
                </DialogClose>
                <Button
                  variant="outline"
                  className={`gap-1.5 ${outline}`}
                  onClick={() => onTabChange("manual")}
                >
                  <PencilIcon />
                  Add manually
                </Button>
              </div>
            </>
          ) : (
            <>
              <span className="text-xs text-muted-foreground">
                Added disabled so you can review the config.
              </span>
              <div className="flex items-center gap-2">
                <DialogClose render={<Button variant="ghost" />}>
                  Cancel
                </DialogClose>
                <Button variant="outline" className={`gap-1.5 ${outline}`}>
                  <PlugIcon />
                  Test
                </Button>
                <Button className="w-[148px] gap-1.5">
                  <PlusIcon />
                  Add server
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
