import {
  LayoutGridIcon,
  LibraryIcon,
  ListIcon,
  PlusIcon,
  RefreshCwIcon,
  type LucideIcon,
} from "lucide-react"
import * as React from "react"

import {
  InstallPluginDialog,
  type InstallPluginSegment,
} from "@/components/install-plugin-dialog"
import {
  PluginDetailDialog,
  type PluginDetail,
} from "@/components/plugin-detail-dialog"
import {
  marketplaceChip,
  marketplaceLabel,
  plugins,
  type Plugin,
  type PluginMarketplace,
} from "@/lib/plugins"
import { TablePagination } from "@workspace/extensions/components"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

const cardSurface =
  "[--card-spacing:1.25rem] rounded-lg ring-glass-border shadow-glass backdrop-blur-glass"

const outline =
  "border-border bg-transparent dark:border-input dark:bg-transparent"

const tabs = [
  { value: "all", label: "All 15" },
  { value: "enabled", label: "Enabled 11" },
  { value: "disabled", label: "Disabled 4" },
]

/* Column widths include the 16px gutter the design leaves between columns. */
const columns = [
  { label: "", width: 16 },
  { label: "PLUGIN", width: 362 },
  { label: "DESCRIPTION", width: 222 },
  { label: "SKILLS", width: 150 },
  { label: "SOURCE", width: 170 },
  { label: "ENABLED", width: 96 },
]

const viewToggleSurface = "flex h-9 gap-1 rounded-lg bg-muted p-1"

function MarketplaceChip({
  marketplace,
  size = "md",
}: {
  marketplace: PluginMarketplace
  size?: "sm" | "md"
}) {
  const box =
    size === "sm"
      ? "h-[18px] px-1.5 text-[11px] leading-[13px]"
      : "h-[22px] px-2 text-[11.5px] leading-[14px]"

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full font-medium ${box} ${marketplaceChip[marketplace]}`}
    >
      {marketplaceLabel[marketplace]}
    </span>
  )
}

function PhotoCover({ src }: { src: string }) {
  return <img src={src} alt="" className="size-full object-cover" />
}

/** Plugins without an uploaded cover render their README instead, fading line by line. */
function ReadmeCover({ plugin }: { plugin: Plugin }) {
  const lines = [
    { text: `# ${plugin.name}`, className: "text-secondary-foreground" },
    { text: plugin.description, className: "text-secondary-foreground/85" },
    { text: "for coding agents.", className: "text-secondary-foreground/68" },
    { text: "", className: "text-secondary-foreground/42" },
    { text: "## Install", className: "text-secondary-foreground/20" },
  ]

  return (
    <div className="flex h-full flex-col gap-0.5 bg-surface-raised px-3 py-[7px] font-mono text-[10px] leading-[16px]">
      {lines.map((line, index) => (
        <span key={index} className={`truncate ${line.className}`}>
          {line.text || "\u00a0"}
        </span>
      ))}
    </div>
  )
}

function PluginThumb({ plugin }: { plugin: Plugin }) {
  if (plugin.cover) {
    return (
      <img
        src={plugin.cover}
        alt=""
        className="size-9 shrink-0 rounded-md object-cover"
      />
    )
  }

  return (
    <span className="flex size-9 shrink-0 flex-col justify-center gap-[3px] rounded-md bg-surface-raised px-2">
      <span className="h-[2.5px] w-5 rounded-full bg-secondary-foreground/78" />
      <span className="h-[2.5px] w-3.5 rounded-full bg-secondary-foreground/56" />
      <span className="h-[2.5px] w-2 rounded-full bg-secondary-foreground/28" />
    </span>
  )
}

function toDetail(plugin: Plugin): PluginDetail {
  return {
    name: plugin.name,
    version: plugin.version,
    description: plugin.description,
    marketplace: plugin.marketplace,
    categories: plugin.categories,
    skills: plugin.skills,
    commands: plugin.commands,
    agents: plugin.agents,
    hooks: plugin.hooks,
    size: plugin.size,
    cover: plugin.cover,
  }
}

function PluginCard({
  plugin,
  onOpen,
}: {
  plugin: Plugin
  onOpen: () => void
}) {
  return (
    <div
      onDoubleClick={onOpen}
      className="flex h-[246px] cursor-pointer flex-col overflow-hidden rounded-lg bg-card shadow-glass ring-1 ring-glass-border backdrop-blur-glass"
    >
      <div
        className={`relative h-[92px] shrink-0 overflow-hidden ${plugin.cover ? "cover-fade" : ""}`}
      >
        {plugin.cover ? (
          <PhotoCover src={plugin.cover} />
        ) : (
          <ReadmeCover plugin={plugin} />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex h-5 items-center gap-2">
          <span className="truncate text-[13px] font-semibold">
            {plugin.name}
          </span>
          <Badge variant="outline" className="ml-auto">
            {`v${plugin.version}`}
          </Badge>
        </div>
        <div className="flex h-[18px] items-center gap-1.5">
          <MarketplaceChip marketplace={plugin.marketplace} size="sm" />
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {plugin.description}
        </p>
        <div className="flex flex-1" />
        <div className="flex h-5 items-center gap-2">
          <span className="truncate text-[11.5px] text-muted-foreground">
            {plugin.skills} skills · {plugin.commands} commands
          </span>
          <span
            className="ml-auto shrink-0"
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <Switch
              defaultChecked={plugin.enabled}
              aria-label={`Enable ${plugin.name}`}
            />
          </span>
        </div>
      </div>
    </div>
  )
}

function PluginGrid({ onOpen }: { onOpen: (plugin: Plugin) => void }) {
  /* Four per row at the design's 1136px content column; 24px gaps decide the count below that. */
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(266px,1fr))] gap-x-6 gap-y-5">
      {plugins.slice(0, 12).map((plugin) => (
        <PluginCard
          key={plugin.name}
          plugin={plugin}
          onOpen={() => onOpen(plugin)}
        />
      ))}
    </div>
  )
}

function PluginTable({ onOpen }: { onOpen: (plugin: Plugin) => void }) {
  return (
    <Card className={`${cardSurface} gap-4`}>
      <CardHeader className="gap-1">
        <CardTitle className="text-base leading-tight font-semibold">
          Installed plugins
        </CardTitle>
        <CardDescription className="text-sm leading-snug">
          15 plugins registered · 11 enabled
        </CardDescription>
      </CardHeader>
      <div className="px-5">
        <Table className="table-fixed [&_td]:p-0 [&_th]:px-0">
          <TableHeader>
            <TableRow className="h-10">
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
            {plugins.map((plugin) => (
              <TableRow
                key={plugin.name}
                onDoubleClick={() => onOpen(plugin)}
                className="h-[42px] cursor-pointer"
              >
                <TableCell onDoubleClick={(event) => event.stopPropagation()}>
                  <Checkbox aria-label={`Select ${plugin.name}`} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <PluginThumb plugin={plugin} />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm leading-[17px] font-medium">
                        {plugin.name}
                      </span>
                      <span className="truncate font-mono text-xs leading-[16px] text-muted-foreground">
                        {`v${plugin.version}`}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="truncate text-[12.5px] text-muted-foreground">
                  {plugin.description}
                </TableCell>
                <TableCell className="text-[12.5px] text-secondary-foreground">
                  {plugin.skills} skills
                </TableCell>
                <TableCell>
                  <MarketplaceChip marketplace={plugin.marketplace} />
                </TableCell>
                <TableCell onDoubleClick={(event) => event.stopPropagation()}>
                  <Switch
                    defaultChecked={plugin.enabled}
                    aria-label={`Enable ${plugin.name}`}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between px-5">
        <span className="text-sm text-muted-foreground">
          Showing 15 of 15 plugins
        </span>
        <Button variant="ghost" className="gap-2">
          <LibraryIcon className="text-muted-foreground" />
          Open registry
        </Button>
      </div>
    </Card>
  )
}

function PageTitleRow({ onInstall }: { onInstall: () => void }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Plugins</h1>
        <p className="text-sm text-muted-foreground">
          Claude Code plugins — skill bundles installed from marketplaces or
          local paths.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Select defaultValue="All sources">
          <SelectTrigger
            className={`w-[150px] data-[size=default]:h-9 ${outline}`}
            aria-label="Source"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["All sources", "official", "acme-internal", "local"].map(
              (option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
        <Button variant="outline" className={`h-9 gap-2 px-4 ${outline}`}>
          <RefreshCwIcon className="text-muted-foreground" />
          Check updates
        </Button>
        <Button className="h-9 gap-2 px-4" onClick={onInstall}>
          <PlusIcon />
          Install plugin
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

export function PluginsPage() {
  const [tab, setTab] = React.useState(tabs[0].value)
  const [view, setView] = React.useState<"grid" | "list">("list")
  const [installAt, setInstallAt] = React.useState<InstallPluginSegment | null>(
    null
  )
  const [detail, setDetail] = React.useState<Plugin | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)

  const openDetail = (plugin: Plugin) => {
    setDetail(plugin)
    setDetailOpen(true)
  }

  return (
    <>
      <PageTitleRow onInstall={() => setInstallAt("marketplace")} />
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
              <PluginGrid onOpen={openDetail} />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  1–12 of 15 plugins
                </span>
                <TablePagination pageText="Page 1 of 2" compact />
              </div>
            </>
          ) : (
            <PluginTable onOpen={openDetail} />
          )}
        </TabsContent>
      </Tabs>
      <PluginDetailDialog
        plugin={detailOpen && detail ? toDetail(detail) : null}
        onOpenChange={(open) => {
          if (!open) setDetailOpen(false)
        }}
      />
      <InstallPluginDialog
        open={installAt !== null}
        segment={installAt ?? "marketplace"}
        onSegmentChange={setInstallAt}
        onOpenChange={(open) => {
          if (!open) setInstallAt(null)
        }}
      />
    </>
  )
}
