import {
  DownloadIcon,
  LayoutGridIcon,
  ListIcon,
  UploadIcon,
  type LucideIcon,
} from "lucide-react"
import * as React from "react"

import { AddSkillDialog, type AddSkillTab } from "@/components/add-skill-dialog"
import { SkillDetailDialog } from "@/components/skill-detail-dialog"
import { TablePagination } from "@/components/table-pagination"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
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
  "[--card-spacing:1.5rem] rounded-lg ring-glass-border shadow-glass backdrop-blur-glass"

type SkillTag =
  | "Documents"
  | "Engineering"
  | "Docs"
  | "Data"
  | "Design"
  | "Integrations"
  | "Quality"
  | "Reliability"
  | "Marketing"

const tagChip: Record<SkillTag, string> = {
  Documents: "bg-chip-documents",
  Engineering: "bg-chip-engineering",
  Docs: "bg-chip-docs",
  Data: "bg-chip-data",
  Design: "bg-chip-design",
  Integrations: "bg-chip-integrations",
  Quality: "bg-chip-quality",
  Reliability: "bg-chip-reliability",
  Marketing: "bg-chip-marketing",
}

const tagLabel: Record<SkillTag, string> = {
  Documents: "text-tag-documents",
  Engineering: "text-tag-engineering",
  Docs: "text-tag-docs",
  Data: "text-tag-data",
  Design: "text-tag-design",
  Integrations: "text-tag-integrations",
  Quality: "text-tag-quality",
  Reliability: "text-tag-reliability",
  Marketing: "text-tag-marketing",
}

type SkillSource = "Built-in" | "Workspace" | "skill.sh"

type Skill = {
  name: string
  /* The design gives the grid card a shortened summary and the list row the full description. */
  summary: string
  description: string
  tags: SkillTag[]
  source: SkillSource
  tokens: string
  triggers: number
  updated: string
  enabled: boolean
  cover?: string
}

const cover = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=520&h=184&q=70`

const skills: Skill[] = [
  {
    name: "pdf-extract",
    summary: "Extract tables from PDFs",
    description: "Extract tables from PDFs and scans",
    tags: ["Documents"],
    source: "Workspace",
    tokens: "1.2k",
    triggers: 4,
    updated: "2 hours ago",
    enabled: true,
    cover: cover("photo-1761671614144-e8c003fff544"),
  },
  {
    name: "code-review",
    summary: "Review checklists with severity",
    description: "Repo review checklist with severity rubric",
    tags: ["Engineering", "Quality"],
    source: "Built-in",
    tokens: "2.4k",
    triggers: 9,
    updated: "yesterday",
    enabled: true,
    cover: cover("photo-1580584126903-c17d41830450"),
  },
  {
    name: "doc-audit",
    summary: "Audit the docs tree",
    description: "Audit the docs tree for structure and budgets",
    tags: ["Docs"],
    source: "skill.sh",
    tokens: "0.9k",
    triggers: 3,
    updated: "2 days ago",
    enabled: true,
  },
  {
    name: "api-design",
    summary: "Design REST and JSON contracts",
    description: "Design REST and JSON contracts from models",
    tags: ["Engineering"],
    source: "Built-in",
    tokens: "1.8k",
    triggers: 6,
    updated: "2 days ago",
    enabled: true,
    cover: cover("photo-1618388810903-840bb0d15ea5"),
  },
  {
    name: "test-reliability",
    summary: "Diagnose flaky tests",
    description: "Diagnose flaky tests and resource leaks",
    tags: ["Engineering"],
    source: "Workspace",
    tokens: "1.4k",
    triggers: 5,
    updated: "3 days ago",
    enabled: true,
    cover: cover("photo-1599727277643-b0c9cfb7705d"),
  },
  {
    name: "release-notes",
    summary: "Draft notes from merged PRs",
    description: "Draft release notes from merged PR labels",
    tags: ["Docs"],
    source: "skill.sh",
    tokens: "0.6k",
    triggers: 2,
    updated: "3 days ago",
    enabled: true,
    cover: cover("photo-1516849841032-87cbac4d88f7"),
  },
  {
    name: "legacy-jira-sync",
    summary: "Two-way sync with Jira",
    description: "Two-way sync with legacy Jira projects",
    tags: ["Integrations"],
    source: "Workspace",
    tokens: "1.1k",
    triggers: 4,
    updated: "5 days ago",
    enabled: false,
    cover: cover("photo-1549164330-86c63b6d4195"),
  },
  {
    name: "data-migration",
    summary: "Plan schema migrations",
    description: "Plan schema migrations with rollback steps",
    tags: ["Data"],
    source: "Built-in",
    tokens: "1.6k",
    triggers: 4,
    updated: "6 days ago",
    enabled: false,
  },
  {
    name: "onboarding-guide",
    summary: "Generate onboarding paths",
    description: "Generate a contributor onboarding path",
    tags: ["Docs"],
    source: "Workspace",
    tokens: "0.7k",
    triggers: 3,
    updated: "8 days ago",
    enabled: true,
    cover: cover("photo-1580894908361-967195033215"),
  },
  {
    name: "perf-profiling",
    summary: "Profile hot paths",
    description: "Profile hot paths and propose measured fixes",
    tags: ["Engineering"],
    source: "skill.sh",
    tokens: "2.1k",
    triggers: 7,
    updated: "9 days ago",
    enabled: true,
  },
  {
    name: "brand-voice",
    summary: "Apply brand tone rules",
    description: "Apply brand tone rules to product copy",
    tags: ["Marketing"],
    source: "Workspace",
    tokens: "0.5k",
    triggers: 2,
    updated: "12 days ago",
    enabled: false,
    cover: cover("photo-1611269154421-4e27233ac5c7"),
  },
  {
    name: "incident-postmortem",
    summary: "Structure incident timelines",
    description: "Structure incident timelines and follow-ups",
    tags: ["Reliability"],
    source: "Built-in",
    tokens: "1.3k",
    triggers: 4,
    updated: "14 days ago",
    enabled: true,
    cover: cover("flagged/photo-1551954810-43cd6aef5b1f"),
  },
  {
    name: "schema-explorer",
    summary: "Map tables into summaries",
    description: "Map database tables into context summaries",
    tags: ["Data"],
    source: "skill.sh",
    tokens: "1.0k",
    triggers: 3,
    updated: "18 days ago",
    enabled: true,
    cover: cover("photo-1544383835-bda2bc66a55d"),
  },
  {
    name: "accessibility-audit",
    summary: "Check against WCAG",
    description: "Check interfaces against WCAG criteria",
    tags: ["Design"],
    source: "Workspace",
    tokens: "1.5k",
    triggers: 5,
    updated: "21 days ago",
    enabled: false,
    cover: cover("photo-1523289333742-be1143f6b766"),
  },
]

const filterTags: SkillTag[] = [
  "Documents",
  "Engineering",
  "Docs",
  "Data",
  "Design",
  "Integrations",
  "Quality",
  "Reliability",
  "Marketing",
]

const tabs = [
  { value: "all", label: "All 42" },
  { value: "built-in", label: "Built-in 24" },
  { value: "workspace", label: "Workspace 12" },
  { value: "skill.sh", label: "skill.sh 6" },
]

/* Column widths include the 16px gutter the design leaves between columns. */
const columns = [
  { label: "", width: 32 },
  { label: "SKILL", width: 340 },
  { label: "TAGS", width: 166 },
  { label: "SOURCE", width: 146 },
  { label: "TOKENS", width: 96 },
  { label: "TRIGGERS", width: 96 },
  { label: "UPDATED", width: 136 },
  { label: "ENABLED", width: 76 },
]

const viewToggleSurface = "flex h-9 gap-1 rounded-lg bg-muted p-1"

function titleCase(name: string) {
  return name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

function TagChip({ tag, size = "sm" }: { tag: SkillTag; size?: "sm" | "md" }) {
  const box =
    size === "sm"
      ? "h-[18px] px-1.5 text-[11px] leading-[13px]"
      : "h-5 px-[7px] text-xs leading-[14px]"

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full font-medium ${box} ${tagChip[tag]} ${tagLabel[tag]}`}
    >
      {tag}
    </span>
  )
}

function SourceBadge({ source }: { source: SkillSource }) {
  return <Badge variant="secondary">{source}</Badge>
}

function PhotoCover({ src }: { src: string }) {
  return <img src={src} alt="" className="size-full object-cover" />
}

function MarkdownCover({ skill }: { skill: Skill }) {
  const lines = [
    { text: "---", className: "text-muted-foreground/70" },
    { text: `name: ${skill.name}`, className: "text-secondary-foreground" },
    {
      text: `description: ${skill.summary}`,
      className: "text-secondary-foreground/85",
    },
    {
      text: `category: ${skill.tags[0]}`,
      className: "text-secondary-foreground/68",
    },
    { text: "---", className: "text-muted-foreground/42" },
    {
      text: `# ${titleCase(skill.name)}`,
      className: "text-secondary-foreground/15",
    },
  ]

  return (
    <div className="flex h-full flex-col gap-0.5 bg-surface-raised px-3 py-[7px] font-mono text-[10px] leading-[14px]">
      {lines.map((line) => (
        <span key={line.text} className={`truncate ${line.className}`}>
          {line.text}
        </span>
      ))}
    </div>
  )
}

function SkillCard({ skill, onOpen }: { skill: Skill; onOpen: () => void }) {
  return (
    <div
      onDoubleClick={onOpen}
      className="flex h-[246px] cursor-pointer flex-col overflow-hidden rounded-lg bg-card shadow-glass ring-1 ring-glass-border backdrop-blur-glass"
    >
      <div
        className={`relative h-[124px] shrink-0 overflow-hidden ${skill.cover ? "cover-fade" : ""}`}
      >
        {skill.cover ? (
          <PhotoCover src={skill.cover} />
        ) : (
          <MarkdownCover skill={skill} />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold">{skill.name}</span>
          <SourceBadge source={skill.source} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <TagChip tag={skill.tags[0]} />
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {skill.summary}
        </p>
        <div
          className="mt-auto flex items-center justify-between gap-2"
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <span className="truncate text-xs text-muted-foreground">
            {skill.tokens} · {skill.triggers} triggers
          </span>
          <Switch
            defaultChecked={skill.enabled}
            aria-label={`Enable ${skill.name}`}
          />
        </div>
      </div>
    </div>
  )
}

function SkillGrid({ onOpen }: { onOpen: (skill: Skill) => void }) {
  /* Five per row at most: past that the cards get too narrow to read. 96px = the four 24px gaps. */
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(max(266px,calc((100%-96px)/5)),1fr))] gap-x-6 gap-y-5">
      {skills.slice(0, 12).map((skill) => (
        <SkillCard
          key={skill.name}
          skill={skill}
          onOpen={() => onOpen(skill)}
        />
      ))}
    </div>
  )
}

function SkillThumb({ skill }: { skill: Skill }) {
  if (skill.cover) {
    return (
      <img
        src={skill.cover}
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

function SkillTable({ onOpen }: { onOpen: (skill: Skill) => void }) {
  return (
    <Card className={`${cardSurface} gap-4`}>
      <CardHeader className="gap-1">
        <CardTitle className="text-base leading-tight font-semibold">
          Installed skills
        </CardTitle>
        <CardDescription className="text-sm leading-snug">
          Install skills from skill.sh, or manage the ones already in this
          workspace.
        </CardDescription>
      </CardHeader>
      <div className="px-6">
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
            {skills.map((skill) => (
              <TableRow
                key={skill.name}
                onDoubleClick={() => onOpen(skill)}
                className="h-11 cursor-pointer"
              >
                <TableCell onDoubleClick={(event) => event.stopPropagation()}>
                  <Checkbox aria-label={`Select ${skill.name}`} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <SkillThumb skill={skill} />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm leading-[17px] font-medium">
                        {skill.name}
                      </span>
                      <span className="truncate text-xs leading-[15px] text-muted-foreground">
                        {skill.description}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {skill.tags.map((tag) => (
                      <TagChip key={tag} tag={tag} size="md" />
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <SourceBadge source={skill.source} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {skill.tokens}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {skill.triggers} phrases
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {skill.updated}
                </TableCell>
                <TableCell onDoubleClick={(event) => event.stopPropagation()}>
                  <Switch
                    defaultChecked={skill.enabled}
                    aria-label={`Enable ${skill.name}`}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between px-6">
        <span className="text-xs text-muted-foreground">1–14 of 42 skills</span>
        <TablePagination pageText="Page 1 of 4" />
      </div>
    </Card>
  )
}

function PageTitleRow() {
  const [tag, setTag] = React.useState("All tags")
  const [expanded, setExpanded] = React.useState(false)
  const visible = expanded ? filterTags : filterTags.slice(0, 4)

  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Skills</h1>
        <p className="text-sm text-muted-foreground">
          Install skills from skill.sh or manage the ones in this workspace.
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        <button
          type="button"
          aria-pressed={tag === "All tags"}
          onClick={() => setTag("All tags")}
          className={`flex h-[26px] shrink-0 items-center justify-center rounded-full px-2.5 text-[12.5px] transition-colors ${
            tag === "All tags"
              ? "bg-primary font-semibold text-primary-foreground"
              : "bg-surface-raised text-muted-foreground"
          }`}
        >
          All tags
        </button>
        {visible.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={tag === item}
            onClick={() => setTag(item)}
            className={`flex h-[26px] shrink-0 items-center justify-center rounded-full px-2.5 text-[12.5px] transition-colors ${
              tag === item
                ? `bg-primary font-semibold text-primary-foreground`
                : `bg-surface-raised font-medium ${tagLabel[item]}`
            }`}
          >
            {item}
          </button>
        ))}
        {expanded ? null : (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="flex h-[26px] shrink-0 items-center justify-center rounded-full bg-surface-raised px-2.5 text-[12.5px] font-medium text-muted-foreground transition-colors"
          >
            +{filterTags.length - visible.length}
          </button>
        )}
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

export function SkillsPage() {
  const [tab, setTab] = React.useState(tabs[0].value)
  const [view, setView] = React.useState<"grid" | "list">("grid")
  const [addTab, setAddTab] = React.useState<AddSkillTab | null>(null)
  const [detail, setDetail] = React.useState<Skill | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)

  const openDetail = (skill: Skill) => {
    setDetail(skill)
    setDetailOpen(true)
  }

  return (
    <>
      <PageTitleRow />
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
          <div className="flex shrink-0 items-center gap-2">
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
            <Button
              variant="outline"
              className="h-9 gap-2 border-border bg-transparent px-4 dark:border-input dark:bg-transparent"
              onClick={() => setAddTab("local")}
            >
              <UploadIcon />
              Import
            </Button>
            <Button
              className="h-9 gap-2 px-4"
              onClick={() => setAddTab("skill.sh")}
            >
              <DownloadIcon />
              Browse skill.sh
            </Button>
          </div>
        </div>
        <TabsContent value={tab} className="flex flex-col gap-6">
          {view === "grid" ? (
            <>
              <SkillGrid onOpen={openDetail} />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  1–12 of 42 skills
                </span>
                <TablePagination pageText="Page 1 of 4" />
              </div>
            </>
          ) : (
            <SkillTable onOpen={openDetail} />
          )}
        </TabsContent>
      </Tabs>
      <AddSkillDialog
        open={addTab !== null}
        tab={addTab ?? "skill.sh"}
        onTabChange={setAddTab}
        onOpenChange={(open) => {
          if (!open) setAddTab(null)
        }}
      />
      <SkillDetailDialog
        skill={detailOpen ? detail : null}
        onOpenChange={(open) => {
          if (!open) setDetailOpen(false)
        }}
      />
    </>
  )
}
