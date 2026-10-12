import {
  CheckIcon,
  FolderIcon,
  GitForkIcon,
  PlugIcon,
  RefreshCwIcon,
  ServerIcon,
  SparklesIcon,
  UnlinkIcon,
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Switch } from "@workspace/ui/components/switch"

const cardSurface =
  "[--card-spacing:1.25rem] gap-4 rounded-lg ring-glass-border shadow-glass backdrop-blur-glass"

/* Fields and buttons on this page carry the input border, not the softer divider token. */
const fieldOutline = "border-input bg-transparent dark:bg-transparent"

const repository = "a.lee/context-hub"
const branch = "main"
const repositoryPath = "context/"
const commitMessage = "chore(context): sync skills, MCP servers, plugins"

const syncOptions = [
  {
    title: "Sync on every change",
    description: "Push a commit as soon as a skill, server, or plugin changes.",
    enabled: true,
  },
  {
    title: "Open a pull request instead of pushing",
    description: "Review changes on GitHub before they land on the branch.",
    enabled: true,
  },
  {
    title: "Include disabled items",
    description: "Also link disabled skills and plugins into this workspace.",
    enabled: false,
  },
]

const syncedItems: { label: string; count: string; icon: LucideIcon }[] = [
  { label: "Skills", count: "42 files", icon: SparklesIcon },
  { label: "MCP servers", count: "8 files", icon: ServerIcon },
  { label: "Plugins", count: "17 files", icon: PlugIcon },
]

type SyncResult = "Pushed" | "Conflict"

const syncDot: Record<SyncResult, string> = {
  Pushed: "bg-chart-2",
  Conflict: "bg-chart-3",
}

const recentSyncs: { commit: string; meta: string; result: SyncResult }[] = [
  { commit: "8f21ac4", meta: "09:42  ·  +7 files", result: "Pushed" },
  { commit: "c40b9e1", meta: "08:15  ·  +2 files", result: "Pushed" },
  { commit: "1d77e08", meta: "Yesterday  ·  +11 files", result: "Pushed" },
  { commit: "9ac31f2", meta: "Yesterday  ·  —", result: "Conflict" },
]

/** Badges on this page pair a coloured dot with a label instead of filling the whole pill. */
function DotBadge({
  dot,
  children,
  height = "h-5",
}: {
  dot: string
  children: ReactNode
  height?: string
}) {
  return (
    <Badge variant="secondary" className={`gap-1.5 ${height}`}>
      <span className={`size-1.5 rounded-full ${dot}`} />
      {children}
    </Badge>
  )
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs leading-[15px] text-muted-foreground">
      {children}
    </span>
  )
}

function RepositoryCard() {
  return (
    <Card className={cardSurface}>
      <CardHeader className="gap-1">
        <CardTitle className="text-base leading-tight font-semibold">
          GitHub repository
        </CardTitle>
        <CardDescription className="text-sm leading-[17px]">
          Everything you change here is committed to this repository.
        </CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-4 px-5">
        <label className="flex flex-col gap-1.5">
          <FieldLabel>Repository</FieldLabel>
          <div className="relative">
            <GitForkIcon className="pointer-events-none absolute top-1/2 left-3 size-[15px] -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-[38px] pl-8.5 font-mono text-[13.5px]"
              defaultValue={repository}
              aria-label="Repository"
            />
          </div>
        </label>
        {/* The select is 2px shorter than the input, so the row aligns their boxes, not their labels. */}
        <div className="flex items-end gap-4">
          <label className="flex w-[280px] shrink-0 flex-col gap-1.5">
            <FieldLabel>Branch</FieldLabel>
            <Select defaultValue={branch}>
              <SelectTrigger
                className={`w-full data-[size=default]:h-9 ${fieldOutline}`}
                aria-label="Branch"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["main", "release", "next"].map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <FieldLabel>Path in repository</FieldLabel>
            <div className="relative">
              <FolderIcon className="pointer-events-none absolute top-1/2 left-3 size-[15px] -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-[38px] pl-8.5 font-mono text-[13.5px]"
                defaultValue={repositoryPath}
                aria-label="Path in repository"
              />
            </div>
          </label>
        </div>
        <div className="flex h-9 items-center gap-2.5">
          <Button variant="outline" className={`gap-2 px-4 ${fieldOutline}`}>
            <PlugIcon className="text-muted-foreground" />
            Test connection
          </Button>
          <Button className="gap-2 border-input px-4">
            <CheckIcon />
            Save
          </Button>
        </div>
      </div>
    </Card>
  )
}

function SyncOptionsCard() {
  return (
    <Card className={cardSurface}>
      <CardHeader className="gap-1">
        <CardTitle className="text-base leading-tight font-semibold">
          Sync options
        </CardTitle>
        <CardDescription className="text-sm leading-[17px]">
          Choose when and how changes reach the remote.
        </CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-4 px-5">
        {syncOptions.map((option) => (
          <div
            key={option.title}
            className="flex h-[55px] items-center gap-4 border-b border-border"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className="text-sm leading-[17px]">{option.title}</span>
              <span className="text-[12.5px] leading-[15px] text-muted-foreground">
                {option.description}
              </span>
            </div>
            <Switch defaultChecked={option.enabled} aria-label={option.title} />
          </div>
        ))}
        <label className="flex flex-col gap-1.5">
          <FieldLabel>Commit message</FieldLabel>
          <Input
            className="h-[38px] pl-3 text-[13.5px]"
            defaultValue={commitMessage}
            aria-label="Commit message"
          />
        </label>
      </div>
    </Card>
  )
}

function SyncedItemsCard() {
  return (
    <Card className={cardSurface}>
      <CardHeader className="gap-1">
        <CardTitle className="text-base leading-tight font-semibold">
          What gets synced
        </CardTitle>
      </CardHeader>
      <div className="flex flex-col gap-4 px-5">
        {syncedItems.map((item) => (
          <div
            key={item.label}
            className="flex h-[30px] items-center gap-2.5 border-b border-border"
          >
            <item.icon className="size-[15px] shrink-0 text-muted-foreground" />
            <span className="truncate text-[13.5px] leading-4">
              {item.label}
            </span>
            <span className="ml-auto shrink-0 text-xs leading-4 text-muted-foreground">
              {item.count}
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}

const connectionMeta: { key: string; value: ReactNode }[] = [
  {
    key: "Pending changes",
    value: (
      <>
        <span className="text-xs leading-4">3 files</span>
        <Badge variant="outline" className="h-[18px] gap-1.5">
          <span className="size-1.5 rounded-full bg-chart-3" />
          Unsynced
        </Badge>
      </>
    ),
  },
  {
    key: "Repository",
    value: <span className="font-mono text-xs leading-4">{repository}</span>,
  },
  { key: "Branch", value: <span className="font-mono text-xs leading-4">{branch}</span> },
  {
    key: "Visibility",
    value: <span className="text-xs leading-4">Private</span>,
  },
  {
    key: "Last sync",
    value: <span className="text-xs leading-4">4 minutes ago</span>,
  },
  {
    key: "Latest commit",
    value: <span className="font-mono text-xs leading-4">8f21ac4</span>,
  },
]

function ConnectionStatusCard() {
  return (
    <Card className={cardSurface}>
      <CardHeader className="gap-1">
        <CardTitle className="text-base leading-tight font-semibold">
          Connection status
        </CardTitle>
      </CardHeader>
      <div className="flex flex-col px-5">
        {connectionMeta.map((meta) => (
          <div
            key={meta.key}
            className="flex h-[34px] items-center gap-4 border-b border-border"
          >
            <span className="text-[13.5px] leading-4 text-muted-foreground">
              {meta.key}
            </span>
            <span className="ml-auto flex shrink-0 items-center gap-2">
              {meta.value}
            </span>
          </div>
        ))}
        <div className="pt-4">
          <Button className="gap-2 border-input px-4">
            <RefreshCwIcon />
            Sync now
          </Button>
        </div>
      </div>
    </Card>
  )
}

function RecentSyncsCard() {
  return (
    <Card className={cardSurface}>
      <CardHeader className="gap-1">
        <CardTitle className="text-base leading-tight font-semibold">
          Recent syncs
        </CardTitle>
      </CardHeader>
      <div className="flex flex-col gap-4 px-5">
        {recentSyncs.map((sync) => (
          <div
            key={sync.commit}
            className="flex h-[50px] items-center gap-4 border-b border-border"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-mono text-xs leading-4">{sync.commit}</span>
              <span className="text-[11.5px] leading-[14px] text-muted-foreground">
                {sync.meta}
              </span>
            </div>
            <DotBadge dot={syncDot[sync.result]}>{sync.result}</DotBadge>
          </div>
        ))}
      </div>
    </Card>
  )
}

function DisconnectCard() {
  return (
    <Card className={cardSurface}>
      <CardHeader className="gap-1">
        <CardTitle className="text-base leading-tight font-semibold">
          Disconnect
        </CardTitle>
        <CardDescription className="text-sm leading-[17px]">
          Stops syncing. Files already in the repository are kept.
        </CardDescription>
      </CardHeader>
      <div className="px-5">
        <Button
          variant="outline"
          className="h-9 gap-2 border-destructive bg-transparent px-3.5 text-destructive hover:bg-destructive/10 hover:text-destructive dark:border-destructive dark:bg-transparent"
        >
          <UnlinkIcon />
          Disconnect
        </Button>
      </div>
    </Card>
  )
}

export function RepositoryPage() {
  return (
    <>
      <div className="flex items-center justify-between gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Repository</h1>
          <p className="text-sm text-muted-foreground">
            Connect this workspace to a GitHub repository and sync your context.
          </p>
        </div>
        <DotBadge dot="bg-chart-2">Connected</DotBadge>
      </div>
      <div className="flex items-start gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <RepositoryCard />
          <SyncOptionsCard />
          <SyncedItemsCard />
        </div>
        <div className="flex w-[380px] shrink-0 flex-col gap-5">
          <ConnectionStatusCard />
          <RecentSyncsCard />
          <DisconnectCard />
        </div>
      </div>
    </>
  )
}
