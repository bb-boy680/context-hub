import {
  BellIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloudIcon,
  DatabaseIcon,
  DownloadIcon,
  FileTextIcon,
  FolderOpenIcon,
  GitBranchIcon,
  LayersIcon,
  LinkIcon,
  MicIcon,
  PackagePlusIcon,
  SearchIcon,
  ShieldCheckIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react"

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

export type InstallPluginSegment = "marketplace" | "git" | "path"

const outline = "border-border bg-transparent dark:border-input dark:bg-transparent"

const segments: { value: InstallPluginSegment; label: string }[] = [
  { value: "marketplace", label: "Browse marketplace" },
  { value: "git", label: "From Git URL" },
  { value: "path", label: "From path" },
]

type RegistryPlugin = {
  name: string
  author: string
  description: string
  version: string
  tint: string
  icon: LucideIcon
  installed?: boolean
}

const registryPlugins: RegistryPlugin[] = [
  {
    name: "mobile-kit",
    author: "official marketplace",
    description: "9 skills · React Native and Expo",
    version: "v1.6.2",
    tint: "#FBBF2455",
    icon: BellIcon,
  },
  {
    name: "a11y-pack",
    author: "official marketplace",
    description: "6 skills · Accessibility audits",
    version: "v2.0.4",
    tint: "#60A5FA55",
    icon: FileTextIcon,
  },
  {
    name: "db-migrations",
    author: "acme-internal",
    description: "8 skills · Schema migration planning",
    version: "v1.3.1",
    tint: "#34D39955",
    icon: DatabaseIcon,
  },
  {
    name: "i18n-toolkit",
    author: "official marketplace",
    description: "7 skills · Locale management",
    version: "v0.9.7",
    tint: "#F8717155",
    icon: LayersIcon,
    installed: true,
  },
  {
    name: "perf-lab",
    author: "official marketplace",
    description: "11 skills · Profiling and budgets",
    version: "v2.3.0",
    tint: "#38BDF855",
    icon: CloudIcon,
  },
  {
    name: "api-designer",
    author: "acme-internal",
    description: "5 skills · OpenAPI authoring",
    version: "v1.0.9",
    tint: "#F472B655",
    icon: MicIcon,
  },
]

function SegmentRow({
  segment,
  onSegmentChange,
}: {
  segment: InstallPluginSegment
  onSegmentChange: (segment: InstallPluginSegment) => void
}) {
  return (
    <div className="px-6 pb-4">
      <div className="flex h-9 gap-1 rounded-lg bg-muted p-1">
        {segments.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={segment === item.value}
            onClick={() => onSegmentChange(item.value)}
            className={`h-7 flex-1 rounded-md text-[13px] transition-colors ${
              segment === item.value
                ? "bg-accent font-semibold text-foreground"
                : "font-medium text-muted-foreground hover:text-foreground"
            }`}
          >
            {item.label}
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

function Notice({
  icon: Icon,
  children,
}: {
  icon: LucideIcon
  children: React.ReactNode
}) {
  return (
    <div className="flex h-[39px] shrink-0 items-center gap-2.5 rounded-lg bg-notice-bg px-3.5 ring-1 ring-notice-border ring-inset">
      <Icon className="size-[15px] shrink-0 text-primary" />
      <span className="text-[12.5px] leading-[15px]">{children}</span>
    </div>
  )
}

function Field({
  label,
  hint,
  icon: Icon,
  value,
  placeholder,
}: {
  label: string
  hint?: string
  icon?: LucideIcon
  value?: string
  placeholder?: string
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs leading-[15px] text-muted-foreground">
        {label}
      </span>
      <div className="relative">
        {Icon ? (
          <Icon className="pointer-events-none absolute top-1/2 left-3 size-[15px] -translate-y-1/2 text-muted-foreground" />
        ) : null}
        <Input
          className={`h-[38px] font-mono text-xs ${Icon ? "pl-8.5" : ""}`}
          defaultValue={value}
          placeholder={placeholder}
          aria-label={label}
        />
      </div>
      {hint ? (
        <span className="text-[11.5px] leading-[14px] text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </label>
  )
}

function MarketplaceResults() {
  return (
    <>
      <div className="px-6 pb-3.5">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-primary" />
          <Input
            className="h-10 border-primary pl-9"
            placeholder="Search marketplaces and plugins"
            aria-label="Search marketplaces and plugins"
          />
        </div>
      </div>
      <div className="h-px shrink-0 bg-border" />
      <div className="flex items-center justify-between px-6 pt-3 pb-2">
        <span className="text-xs leading-[15px] text-muted-foreground">
          Plugin marketplaces
        </span>
        <span className="text-xs leading-[15px] text-muted-foreground">
          48 plugins across 3 marketplaces
        </span>
      </div>
      <ul>
        {registryPlugins.map((plugin) => (
          <li key={plugin.name} className="flex h-[68px] items-center gap-3.5 px-6">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: plugin.tint }}
            >
              <plugin.icon className="size-[18px] text-secondary-foreground" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <div className="flex items-baseline gap-2">
                <span className="text-[13px] font-semibold">
                  {plugin.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {plugin.author}
                </span>
              </div>
              <span className="truncate text-xs text-muted-foreground">
                {plugin.description}
              </span>
            </div>
            <span className="w-16 shrink-0 text-[11.5px] text-muted-foreground">
              {plugin.version}
            </span>
            {plugin.installed ? (
              <Badge variant="outline" className="w-24 justify-center">
                <CheckIcon className="text-chart-2" />
                Installed
              </Badge>
            ) : (
              <Button className="w-24 gap-1.5">
                <DownloadIcon />
                Install
              </Button>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

function GitInstall() {
  return (
    <div className="flex flex-col gap-[18px] px-6 py-6">
      <Field
        label="Git URL"
        icon={GitBranchIcon}
        value="https://github.com/acme/engineering-kit.git"
        hint="Any Git host works: GitHub, GitLab, or a self-hosted remote."
      />
      <label className="flex w-[200px] flex-col gap-1.5">
        <span className="text-xs leading-[15px] text-muted-foreground">Ref</span>
        <div className="flex h-9 items-center justify-between gap-2 rounded-lg border border-input px-3">
          <span className="text-sm">main</span>
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        </div>
      </label>
      <Field
        label="Subdirectory"
        icon={FolderOpenIcon}
        value=".claude-plugin"
        hint="Leave empty when .claude-plugin/plugin.json is at the repository root."
      />
      <Field
        label="Install as"
        value="engineering-kit"
        hint="Must be unique in this workspace."
      />
      <Notice icon={ShieldCheckIcon}>
        Plugins from a Git URL are installed disabled until you review their
        permissions.
      </Notice>
    </div>
  )
}

function PathInstall() {
  return (
    <div className="flex flex-col gap-[18px] px-6 py-6">
      <div className="flex h-[228px] flex-col items-center justify-center gap-3 rounded-lg bg-dropzone p-7 ring-2 ring-primary">
        <span className="flex size-14 items-center justify-center rounded-full bg-surface-raised ring-1 ring-glass-border ring-inset">
          <PackagePlusIcon className="size-[26px] text-primary" />
        </span>
        <span className="text-[15px] font-semibold">
          Drag and drop your plugin folder here
        </span>
        <span className="w-[420px] text-center text-xs leading-[15px] text-muted-foreground">
          The folder must contain a .claude-plugin/plugin.json. Marketplace
          checkouts work too.
        </span>
        <Button variant="outline" className={`gap-2 px-4 ${outline}`}>
          <FolderOpenIcon className="text-muted-foreground" />
          Browse files
        </Button>
      </div>
      <div className="flex h-[15px] items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or point at a path</span>
        <span className="h-px flex-1" />
      </div>
      <Field
        label="Local path"
        icon={FolderOpenIcon}
        value="~/projects/engineering-kit"
      />
      <Notice icon={LinkIcon}>
        A local plugin stays linked to its folder, so edits on disk apply
        immediately.
      </Notice>
    </div>
  )
}

/** Install dialog: the marketplace, a Git URL and a local folder are three segments of one flow. */
export function InstallPluginDialog({
  open,
  segment,
  onSegmentChange,
  onOpenChange,
}: {
  open: boolean
  segment: InstallPluginSegment
  onSegmentChange: (segment: InstallPluginSegment) => void
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
              Install plugin
            </DialogTitle>
            <DialogDescription className="text-sm leading-[17px]">
              Install a skill bundle from a marketplace, a Git URL, or a local
              path.
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
        <SegmentRow segment={segment} onSegmentChange={onSegmentChange} />
        {segment === "marketplace" ? <MarketplaceResults /> : null}
        {segment === "git" ? <GitInstall /> : null}
        {segment === "path" ? <PathInstall /> : null}
        <div className="flex h-16 items-center justify-between gap-3 border-t border-border px-6">
          {segment === "marketplace" ? (
            <>
              <span className="text-xs text-muted-foreground">
                1–6 of 48 plugins
              </span>
              <div className="flex items-center gap-2">
                <CompactPager pageText="Page 1 of 8" />
                <DialogClose render={<Button variant="ghost" />}>
                  Cancel
                </DialogClose>
              </div>
            </>
          ) : null}
          {segment === "git" ? (
            <>
              <span className="text-xs text-muted-foreground">
                The repository must contain a .claude-plugin/plugin.json.
              </span>
              <div className="flex items-center gap-2">
                <DialogClose render={<Button variant="ghost" />}>
                  Cancel
                </DialogClose>
                <Button className="w-[150px] gap-1.5">
                  <DownloadIcon />
                  Fetch &amp; install
                </Button>
              </div>
            </>
          ) : null}
          {segment === "path" ? (
            <>
              <span className="text-xs text-muted-foreground">
                The folder is linked, not copied.
              </span>
              <div className="flex items-center gap-2">
                <DialogClose render={<Button variant="ghost" />}>
                  Cancel
                </DialogClose>
                <Button className="w-[129px] gap-1.5">
                  <LinkIcon />
                  Link plugin
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
