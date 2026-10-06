import {
  BracesIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  FileCodeIcon,
  FolderIcon,
  ImagePlusIcon,
  LayersIcon,
  PlugIcon,
  PlusIcon,
  SparklesIcon,
  TerminalIcon,
  XIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react"
import * as React from "react"

import {
  categoryChip,
  categoryTile,
  marketplaceLabel,
  pluginGallery,
  type PluginCategory,
  type PluginMarketplace,
} from "@/lib/plugins"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"

export type PluginDetail = {
  name: string
  version: string
  description: string
  marketplace: PluginMarketplace
  categories: PluginCategory[]
  skills: number
  commands: number
  agents: number
  hooks: number
  size: string
  cover?: string
}

const outline = "border-border bg-transparent dark:border-input dark:bg-transparent"

type SkillRow = { name: string; category: string; chip: string; description: string }

/* The bundle the design authors for engineering-kit; longer counts cycle this list. */
const skillPool: SkillRow[] = [
  {
    name: "test-driven-dev",
    category: "testing",
    chip: "bg-chip-quality text-tag-quality",
    description: "Write the failing test first, then the smallest change that passes.",
  },
  {
    name: "code-review",
    category: "review",
    chip: "bg-chip-engineering text-tag-engineering",
    description: "Review a diff for correctness, naming, and missing tests.",
  },
  {
    name: "refactor-safely",
    category: "refactoring",
    chip: "bg-chip-engineering text-tag-engineering",
    description: "Restructure code behind tests without changing behavior.",
  },
  {
    name: "write-adr",
    category: "docs",
    chip: "bg-chip-docs text-tag-docs",
    description: "Record a decision with its context and consequences.",
  },
  {
    name: "api-contract",
    category: "api",
    chip: "bg-chip-integrations text-tag-integrations",
    description: "Agree on request and response fields before implementing.",
  },
  {
    name: "error-handling",
    category: "reliability",
    chip: "bg-chip-reliability text-tag-reliability",
    description: "Classify failures and decide where each one is caught.",
  },
  {
    name: "logging-standards",
    category: "observability",
    chip: "bg-chip-data text-tag-data",
    description: "Log one structured event per state change.",
  },
  {
    name: "dependency-audit",
    category: "dependencies",
    chip: "bg-chip-design text-tag-design",
    description: "Check that a dependency deletes more code than it adds.",
  },
  {
    name: "migration-plan",
    category: "data",
    chip: "bg-chip-data text-tag-data",
    description: "Split a schema change into additive and reversible steps.",
  },
  {
    name: "performance-profile",
    category: "performance",
    chip: "bg-chip-design text-tag-design",
    description: "Measure before optimizing and keep the recorded baseline.",
  },
  {
    name: "release-checklist",
    category: "release",
    chip: "bg-chip-documents text-tag-documents",
    description: "Walk the pre-release steps for a service.",
  },
  {
    name: "onboarding-doc",
    category: "docs",
    chip: "bg-chip-docs text-tag-docs",
    description: "Write the setup steps a new contributor runs.",
  },
]

type CommandRow = { verb: string; args: string; description: string }

const commandPool: CommandRow[] = [
  {
    verb: "review",
    args: "[path]",
    description: "Review a diff for correctness, naming, and missing tests.",
  },
  {
    verb: "test",
    args: "[path]",
    description: "Write or extend the tests that cover a change.",
  },
  { verb: "explain", args: "<file>", description: "Explain what a file does and how it is used." },
  {
    verb: "refactor",
    args: "[target]",
    description: "Restructure code behind tests without changing behavior.",
  },
  { verb: "adr", args: "<title>", description: "Record a decision with its context and consequences." },
  {
    verb: "release",
    args: "[version]",
    description: "Cut a release: bump the version, changelog, and tag.",
  },
]

type HookRow = {
  event: string
  matcher: string
  chip: string
  handler: string
}

const hookPool: HookRow[] = [
  {
    event: "PreToolUse",
    matcher: "Bash",
    chip: "bg-chip-chart-4 text-chart-4",
    handler: "hooks/pre-tool-use.sh",
  },
  {
    event: "PostToolUse",
    matcher: "Edit|Write",
    chip: "bg-chip-data text-chart-2",
    handler: "hooks/post-tool-use.sh",
  },
  {
    event: "UserPromptSubmit",
    matcher: "*",
    chip: "bg-chip-ask text-chart-3",
    handler: "hooks/prompt-submit.sh",
  },
  {
    event: "SessionStart",
    matcher: "startup|resume",
    chip: "bg-chip-chart-4 text-chart-4",
    handler: "hooks/session-start.sh",
  },
  { event: "Stop", matcher: "*", chip: "bg-chip-data text-chart-2", handler: "hooks/on-stop.sh" },
]

function skillRows(plugin: PluginDetail): SkillRow[] {
  return Array.from(
    { length: plugin.skills },
    (_, index) => skillPool[index % skillPool.length]
  )
}

function commandRows(plugin: PluginDetail): CommandRow[] {
  return Array.from(
    { length: plugin.commands },
    (_, index) => commandPool[index % commandPool.length]
  )
}

function hookRows(plugin: PluginDetail): HookRow[] {
  return Array.from(
    { length: Math.min(plugin.hooks, hookPool.length) },
    (_, index) => hookPool[index % hookPool.length]
  )
}

function SectionLabel({
  label,
  hint,
}: {
  label: string
  hint?: string
}) {
  return (
    <div className="flex h-[17px] items-center gap-2.5">
      <span className="text-sm leading-[17px] font-semibold">{label}</span>
      {hint ? (
        <span className="text-xs leading-[15px] text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </div>
  )
}

function Notice({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="flex h-[39px] shrink-0 items-center gap-2.5 rounded-lg bg-notice-bg px-3.5 ring-1 ring-notice-border ring-inset">
      <Icon className="size-[15px] shrink-0 text-primary" />
      <span className="text-[12.5px] leading-[15px]">{children}</span>
    </div>
  )
}

function TableHeadRow({ cells }: { cells: { label: string; width: number }[] }) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-4 border-b border-border">
      {cells.map((cell) => (
        <span
          key={cell.label}
          style={{ width: cell.width }}
          className="shrink-0 text-sm text-muted-foreground"
        >
          {cell.label}
        </span>
      ))}
    </div>
  )
}

function CategoryShells({ plugin }: { plugin: PluginDetail }) {
  return (
    <div className="flex h-[34px] items-center gap-2">
      {plugin.categories.map((category) => (
        <span
          key={category}
          className={`inline-flex h-[30px] shrink-0 items-center gap-2 rounded-full px-2.5 text-[13px] font-medium ${categoryChip(category)}`}
        >
          {category}
          <XIcon className="size-[13px]" />
        </span>
      ))}
      <div className="flex h-[34px] w-[240px] items-center gap-2 rounded-lg border border-input px-3">
        <PlusIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="text-[13px] text-muted-foreground">Add a tag</span>
      </div>
    </div>
  )
}

function CoverImages({ plugin }: { plugin: PluginDetail }) {
  const gallery = pluginGallery(plugin)

  return (
    <div className="flex h-[76px] items-center gap-3">
      {gallery.map((src, index) => (
        <div
          key={src}
          className="relative h-[76px] w-[128px] shrink-0 overflow-hidden rounded-md ring-1 ring-glass-border ring-inset"
        >
          <img src={src} alt="" className="size-full object-cover" />
          {index === 0 ? (
            <span className="absolute top-1.5 left-1.5 rounded bg-[#0F172ACC] px-1.5 py-0.5 text-[10.5px] text-white">
              Cover
            </span>
          ) : (
            <span className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-md bg-[#FFFFFFE6] ring-1 ring-glass-border ring-inset">
              <XIcon className="size-[13px]" />
            </span>
          )}
        </div>
      ))}
      <div className="flex h-[76px] w-[128px] shrink-0 items-center justify-center rounded-md border border-input bg-[#F1F5F999]">
        <ImagePlusIcon className="size-5 text-muted-foreground" />
      </div>
    </div>
  )
}

function ConfigurationPanel({ plugin }: { plugin: PluginDetail }) {
  return (
    <>
      <div className="flex flex-col gap-3">
        <SectionLabel
          label="Cover images"
          hint="The first image is used as the card cover. Upload up to 6."
        />
        <CoverImages plugin={plugin} />
      </div>
      <div className="flex flex-col gap-3">
        <SectionLabel label="Category" />
        <CategoryShells plugin={plugin} />
        <div className="flex h-[18px] items-center gap-1.5">
          <SparklesIcon className="size-[13px] shrink-0 text-muted-foreground" />
          <span className="text-xs leading-[18px] text-muted-foreground">
            Suggestions: engineering, frontend, docs
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <SectionLabel label="Basics" />
        <div className="flex h-[57px] items-center gap-4">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-xs leading-[15px] text-muted-foreground">
              Name
            </span>
            <Input
              className="h-9 text-[13.5px]"
              defaultValue={plugin.name}
              aria-label="Plugin name"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-xs leading-[15px] text-muted-foreground">
              Version
            </span>
            <Input
              className="h-9 text-[13.5px]"
              defaultValue={plugin.version}
              aria-label="Plugin version"
            />
          </label>
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        <SectionLabel
          label="Bundled contents"
          hint="Declared in .claude-plugin/plugin.json."
        />
        <div className="flex h-5 items-center gap-1.5">
          {[
            `${plugin.skills} skills`,
            `${plugin.commands} commands`,
            `${plugin.agents} agents`,
            `${plugin.hooks} hooks`,
          ].map((item) => (
            <span
              key={item}
              className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-border px-2 text-[11.5px] leading-[14px]"
            >
              <span className="size-1.5 rounded-full bg-muted-foreground" />
              {item}
            </span>
          ))}
        </div>
      </div>
    </>
  )
}

function SkillsPanel({ plugin }: { plugin: PluginDetail }) {
  return (
    <>
      <Notice icon={LayersIcon}>
        {`Skills are scanned from the plugin's skills/ folder when the plugin is enabled.`}
      </Notice>
      <div className="flex flex-col">
        <TableHeadRow
          cells={[
            { label: "SKILL", width: 200 },
            { label: "CATEGORY", width: 120 },
            { label: "DESCRIPTION", width: 520 },
          ]}
        />
        {skillRows(plugin).map((skill, index) => (
          <div
            key={index}
            className="flex h-10 shrink-0 items-center gap-4 border-b border-border last:border-b-0"
          >
            <span className="w-[200px] shrink-0 truncate text-[12.5px]">
              {skill.name}
            </span>
            <span className="flex w-[120px] shrink-0">
              <span
                className={`inline-flex h-[22px] shrink-0 items-center rounded-full px-2 text-[11.5px] leading-[14px] font-medium ${skill.chip}`}
              >
                {skill.category}
              </span>
            </span>
            <span className="w-[520px] shrink-0 truncate text-[12.5px] text-muted-foreground">
              {skill.description}
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

function CommandsPanel({ plugin }: { plugin: PluginDetail }) {
  return (
    <>
      <Notice icon={TerminalIcon}>
        {
          "Commands are scanned from the plugin's commands/ folder; each file becomes a slash command."
        }
      </Notice>
      <div className="flex flex-col">
        <TableHeadRow
          cells={[
            { label: "COMMAND", width: 300 },
            { label: "ARGUMENTS", width: 120 },
            { label: "DESCRIPTION", width: 420 },
          ]}
        />
        {commandRows(plugin).map((command, index) => (
          <div
            key={index}
            className="flex h-10 shrink-0 items-center gap-4 border-b border-border last:border-b-0"
          >
            <span className="w-[300px] shrink-0 truncate text-[12.5px]">
              {`/${plugin.name}:${command.verb}`}
            </span>
            <span className="w-[120px] shrink-0 font-mono text-xs text-muted-foreground">
              {command.args}
            </span>
            <span className="w-[420px] shrink-0 truncate text-[12.5px] text-muted-foreground">
              {command.description}
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

function HooksPanel({ plugin }: { plugin: PluginDetail }) {
  return (
    <div className="flex flex-col gap-4">
      <Notice icon={ZapIcon}>
        Scanned from hooks/hooks.json. Hooks run inside the client session; a
        slow hook delays every matching event.
      </Notice>
      <span className="text-sm leading-[17px] font-semibold">Bundled hooks</span>
      <div className="flex flex-col">
        <TableHeadRow
          cells={[
            { label: "EVENT", width: 240 },
            { label: "MATCHER", width: 110 },
            { label: "HANDLER", width: 490 },
          ]}
        />
        {hookRows(plugin).map((hook) => (
          <div
            key={hook.event}
            className="flex h-10 shrink-0 items-center gap-4 border-b border-border last:border-b-0"
          >
            <span className="w-[240px] shrink-0 truncate text-[12.5px]">
              {hook.event}
            </span>
            <span className="flex w-[110px] shrink-0">
              <span
                className={`inline-flex h-[22px] shrink-0 items-center rounded-full px-2 font-mono text-[11.5px] leading-[14px] ${hook.chip}`}
              >
                {hook.matcher}
              </span>
            </span>
            <span className="w-[490px] shrink-0 truncate font-mono text-xs text-muted-foreground">
              {hook.handler}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

type TreeNode = { name: string; level: number; kind: "folder" | "file"; open?: boolean; selected?: boolean }

/** The design shows a truncated tree: the manifest, two commands, one hook script and two skills. */
function buildTree(plugin: PluginDetail): TreeNode[] {
  const commands = commandRows(plugin).slice(0, 2)
  const skills = skillRows(plugin).slice(0, 2)
  const nodes: TreeNode[] = [
    { name: plugin.name, level: 0, kind: "folder", open: true },
    { name: ".claude-plugin", level: 1, kind: "folder", open: true },
    { name: "plugin.json", level: 2, kind: "file" },
  ]

  if (commands.length > 0) {
    nodes.push({ name: "commands", level: 1, kind: "folder", open: true })
    for (const command of commands) {
      nodes.push({ name: `${command.verb}.md`, level: 2, kind: "file" })
    }
  }

  const hooks = hookRows(plugin)
  if (hooks.length > 0) {
    nodes.push({ name: "hooks", level: 1, kind: "folder", open: true })
    nodes.push({ name: "hooks.json", level: 2, kind: "file" })
    nodes.push({
      name: hooks[0].handler.replace("hooks/", ""),
      level: 2,
      kind: "file",
    })
  }

  if (skills.length > 0) {
    nodes.push({ name: "skills", level: 1, kind: "folder", open: true })
    skills.forEach((skill, index) => {
      nodes.push({
        name: skill.name,
        level: 2,
        kind: index === 0 ? "folder" : "file",
        open: index === 0,
        selected: index === 0,
      })
    })
  }

  return nodes
}

function FilesPanel({ plugin }: { plugin: PluginDetail }) {
  const tree = buildTree(plugin)
  const lines = [
    { text: "{", className: "text-muted-foreground" },
    { text: `  "name": "${plugin.name}",`, className: "text-secondary-foreground" },
    { text: `  "version": "${plugin.version}",`, className: "text-secondary-foreground" },
    {
      text: `  "description": "${plugin.description}",`,
      className: "text-primary",
    },
    { text: `  "author": { "name": "acme" },`, className: "text-secondary-foreground" },
    { text: `  "skills": ["./skills"],`, className: "text-secondary-foreground" },
    { text: `  "commands": ["./commands"],`, className: "text-primary" },
    { text: `  "agents": ["./agents"],`, className: "text-secondary-foreground" },
    { text: `  "hooks": "./hooks/hooks.json"`, className: "text-secondary-foreground" },
    { text: "}", className: "text-muted-foreground" },
  ]

  return (
    <div className="flex min-h-0 gap-5">
      <div className="flex w-[220px] shrink-0 flex-col gap-0.5">
        {tree.map((node) => (
          <div
            key={`${node.level}-${node.name}`}
            style={{ paddingLeft: 8 + node.level * 14 }}
            className={`flex h-7 shrink-0 items-center rounded-md ${
              node.selected ? "bg-muted" : ""
            }`}
          >
            {node.kind === "folder" ? (
              <span className="mr-[7px] flex w-[13px] shrink-0 justify-center">
                {node.open ? (
                  <ChevronDownIcon className="size-[13px] text-muted-foreground" />
                ) : (
                  <ChevronRightIcon className="size-[13px] text-muted-foreground" />
                )}
              </span>
            ) : (
              <span className="w-[14px] shrink-0" />
            )}
            <span className="mr-[7px] flex w-[14px] shrink-0 justify-center">
              {node.kind === "folder" ? (
                <FolderIcon
                  className={`size-[14px] ${node.selected ? "text-foreground" : "text-muted-foreground"}`}
                />
              ) : (
                <FileCodeIcon className="size-[14px] text-muted-foreground" />
              )}
            </span>
            <span
              className={`truncate text-[13px] ${node.selected ? "text-foreground" : "text-secondary-foreground"}`}
            >
              {node.name}
            </span>
          </div>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-input bg-[#FFFFFFB3]">
        <div className="flex h-10 shrink-0 items-center gap-2.5 border-b border-border px-3.5">
          <BracesIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-[12.5px]">
            .claude-plugin/plugin.json
          </span>
          <CopyIcon className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
        </div>
        <div className="flex flex-col py-2.5">
          {lines.map((line, index) => (
            <div key={index} className="flex h-[19px] items-center pl-3.5">
              <span className="w-7 shrink-0 text-right text-[11px] text-muted-foreground">
                {index + 1}
              </span>
              <span
                className={`ml-3 truncate font-mono text-[11.5px] ${line.className}`}
              >
                {line.text}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

type DetailTab = "configuration" | "skills" | "commands" | "hooks" | "files"

const readOnlyFooter: Record<DetailTab, string> = {
  configuration: "",
  skills:
    "Scanned from skills/; open a skill's SKILL.md in the Files tab to review it.",
  commands:
    "Scanned from commands/; open a command file in the Files tab to review it.",
  hooks:
    "Scanned from hooks/hooks.json; open it in the Files tab to review or change it.",
  files: "",
}

/** Tab, body height and dialog height for one plugin; the design sizes each tab separately. */
function tabLayout(plugin: PluginDetail) {
  const entries: { value: DetailTab; label: string; body: number }[] = [
    { value: "configuration", label: "Configuration", body: 443 },
  ]

  if (plugin.skills > 0) {
    entries.push({
      value: "skills",
      label: "Skills",
      body: 143 + plugin.skills * 40,
    })
  }
  if (plugin.commands > 0) {
    entries.push({
      value: "commands",
      label: "Commands",
      body: 143 + plugin.commands * 40,
    })
  }
  if (plugin.hooks > 0) {
    entries.push({
      value: "hooks",
      label: "Hooks",
      body: 172 + Math.min(plugin.hooks, hookPool.length) * 40,
    })
  }

  entries.push({ value: "files", label: "Files", body: 428 })
  return entries
}

function PluginDetailBody({ plugin }: { plugin: PluginDetail }) {
  const entries = tabLayout(plugin)
  const [tab, setTab] = React.useState<DetailTab>("configuration")
  const active = entries.find((entry) => entry.value === tab) ?? entries[0]

  const tabClass = (value: DetailTab) =>
    `relative flex h-11 items-center px-3.5 text-sm transition-colors ${
      tab === value
        ? "font-semibold text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary"
        : "text-muted-foreground hover:text-foreground"
    }`

  return (
    <>
      <div className="flex h-[84px] shrink-0 items-center gap-3.5 px-6 pt-[22px] pb-[18px]">
        <span
          className={`flex size-11 shrink-0 items-center justify-center rounded-[10px] ${categoryTile(plugin.categories[0])}`}
        >
          <PlugIcon className="size-5 text-secondary-foreground" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <DialogTitle className="text-base leading-[21px] font-semibold">
            {plugin.name}
          </DialogTitle>
          <DialogDescription className="truncate text-[13px] leading-4">
            {`v${plugin.version}  ·  ${marketplaceLabel[plugin.marketplace]} marketplace  ·  ${plugin.skills} skills  ·  ${plugin.size}`}
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
        {entries.map((entry) => (
          <button
            key={entry.value}
            type="button"
            className={tabClass(entry.value)}
            onClick={() => setTab(entry.value)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div
        style={{ height: active.body }}
        className="flex shrink-0 flex-col p-6"
      >
        <div className="flex min-h-0 flex-1 flex-col gap-5">
          {tab === "configuration" ? <ConfigurationPanel plugin={plugin} /> : null}
          {tab === "skills" ? <SkillsPanel plugin={plugin} /> : null}
          {tab === "commands" ? <CommandsPanel plugin={plugin} /> : null}
          {tab === "hooks" ? <HooksPanel plugin={plugin} /> : null}
          {tab === "files" ? <FilesPanel plugin={plugin} /> : null}
        </div>
      </div>
      <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-t border-border px-6">
        <span className="text-xs text-muted-foreground">
          {readOnlyFooter[tab] || "Changes are written to .claude-plugin/plugin.json on save."}
        </span>
        {tab === "skills" || tab === "commands" || tab === "hooks" ? (
          <DialogClose
            render={<Button variant="outline" className={outline} />}
          >
            Close
          </DialogClose>
        ) : (
          <div className="flex items-center gap-2">
            <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
            <Button className="w-[150px]">Save changes</Button>
          </div>
        )}
      </div>
    </>
  )
}

/** Detail dialog for one plugin; opens on double-click from either view. */
export function PluginDetailDialog({
  plugin,
  onOpenChange,
}: {
  plugin: PluginDetail | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={plugin !== null} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex w-[920px] flex-col gap-0 rounded-lg bg-dialog p-0 shadow-[0_24px_56px_#0F172A3D] ring-glass-border backdrop-blur-xl sm:max-w-[920px]"
      >
        {plugin ? <PluginDetailBody key={plugin.name} plugin={plugin} /> : null}
      </DialogContent>
    </Dialog>
  )
}
