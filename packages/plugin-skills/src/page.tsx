import {
  DownloadIcon,
  LayoutGridIcon,
  LibraryIcon,
  ListIcon,
  PowerIcon,
  Trash2Icon,
  UploadIcon,
  type LucideIcon,
} from "lucide-react"
import * as React from "react"

import { AddSkillDialog, type AddSkillTab } from "./add-skill-dialog.tsx"
import { AutoplayVideo } from "./autoplay-video.tsx"
import { skillKey, useSkillLibrary } from "./library.ts"
import { cardMedia, knownAspect, rememberAspect } from "./media.ts"
import { ProvenanceLine } from "./provenance-line.tsx"
import { SkillDetailDialog } from "./skill-detail-dialog.tsx"
import { seedTags, tagTone } from "./tags.ts"
import type { Skill, SkillSource } from "./types.ts"

import { Spinner } from "@workspace/ui/components/spinner"

import { useI18n } from "@workspace/extensions/react"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { TablePagination } from "@workspace/ui/components/table-pagination"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

const cardSurface =
  "[--card-spacing:1.5rem] rounded-lg ring-glass-border shadow-glass backdrop-blur-glass"

type SkillTag = (typeof seedTags)[number]

/* Card covers keep their own ratio, so the masonry derives its rhythm from real sizes. 390 = 4:3, 292 = 16:9, 347 = 3:2, 520 = 1:1, 693 = 3:4. */
const cover = (id: string, height: number) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=520&h=${height}&q=70`

/* 16:9 for the lightbox stage, which is larger than the card cover. */
const shot = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1080&h=608&q=80`

/* Sample clip so the video paths (cover preview, lightbox playback) are exercised. */
const demoVideo =
  "https://media.prompt-motion.com/stephanlivera-opus-5-5-on-max/video.86605038.mp4"

/** Bundled rows the page renders when this form has no skill library. */
const sampleSkills: Omit<Skill, "id" | "location" | "installed" | "source">[] = [
  {
    name: "pdf-extract",
    summary: "Extract tables from PDFs",
    description: "Extract tables from PDFs and scans",
    tags: ["Documents"],
    tokens: "1.2k",
    triggers: 4,
    updated: "2 hours ago",
    cover: cover("photo-1761671614144-e8c003fff544", 390),
    gallery: [
      shot("photo-1761671614144-e8c003fff544"),
      shot("photo-1580584126903-c17d41830450"),
      shot("photo-1599727277643-b0c9cfb7705d"),
    ],
  },
  {
    name: "code-review",
    summary: "Review checklists with severity",
    description: "Repo review checklist with severity rubric",
    tags: ["Engineering", "Quality"],
    tokens: "2.4k",
    triggers: 9,
    updated: "yesterday",
    cover: cover("photo-1580584126903-c17d41830450", 292),
    gallery: [
      shot("photo-1580584126903-c17d41830450"),
      shot("photo-1516849841032-87cbac4d88f7"),
    ],
  },
  {
    name: "doc-audit",
    summary: "Audit the docs tree",
    description: "Audit the docs tree for structure and budgets",
    tags: ["Docs"],
    tokens: "0.9k",
    triggers: 3,
    updated: "2 days ago",
  },
  {
    name: "api-design",
    summary: "Design REST and JSON contracts",
    description: "Design REST and JSON contracts from models",
    tags: ["Engineering"],
    tokens: "1.8k",
    triggers: 6,
    updated: "2 days ago",
    cover: cover("photo-1618388810903-840bb0d15ea5", 390),
    gallery: [
      shot("photo-1618388810903-840bb0d15ea5"),
      shot("photo-1544383835-bda2bc66a55d"),
    ],
  },
  {
    name: "test-reliability",
    summary: "Diagnose flaky tests",
    description: "Diagnose flaky tests and resource leaks",
    tags: ["Engineering"],
    tokens: "1.4k",
    triggers: 5,
    updated: "3 days ago",
    cover: cover("photo-1599727277643-b0c9cfb7705d", 292),
  },
  {
    name: "release-notes",
    summary: "Draft notes from merged PRs",
    description: "Draft release notes from merged PR labels",
    tags: ["Docs"],
    tokens: "0.6k",
    triggers: 2,
    updated: "3 days ago",
    cover: cover("photo-1516849841032-87cbac4d88f7", 347),
  },
  {
    name: "legacy-jira-sync",
    summary: "Two-way sync with Jira",
    description: "Two-way sync with legacy Jira projects",
    tags: ["Integrations"],
    tokens: "1.1k",
    triggers: 4,
    updated: "5 days ago",
    cover: cover("photo-1549164330-86c63b6d4195", 390),
  },
  {
    name: "data-migration",
    summary: "Plan schema migrations",
    description: "Plan schema migrations with rollback steps",
    tags: ["Data"],
    tokens: "1.6k",
    triggers: 4,
    updated: "6 days ago",
  },
  {
    name: "onboarding-guide",
    summary: "Generate onboarding paths",
    description: "Generate a contributor onboarding path",
    tags: ["Docs"],
    tokens: "0.7k",
    triggers: 3,
    updated: "8 days ago",
    cover: cover("photo-1580894908361-967195033215", 693),
  },
  {
    name: "perf-profiling",
    summary: "Profile hot paths",
    description: "Profile hot paths and propose measured fixes",
    tags: ["Engineering"],
    tokens: "2.1k",
    triggers: 7,
    updated: "9 days ago",
    /* A video as the first asset: the card and the list row preview it muted. */
    gallery: [demoVideo],
  },
  {
    name: "brand-voice",
    summary: "Apply brand tone rules",
    description: "Apply brand tone rules to product copy",
    tags: ["Marketing"],
    tokens: "0.5k",
    triggers: 2,
    updated: "12 days ago",
    cover: cover("photo-1611269154421-4e27233ac5c7", 520),
  },
  {
    name: "incident-postmortem",
    summary: "Structure incident timelines",
    description: "Structure incident timelines and follow-ups",
    tags: ["Reliability"],
    tokens: "1.3k",
    triggers: 4,
    updated: "14 days ago",
    cover: cover("flagged/photo-1551954810-43cd6aef5b1f", 292),
  },
  {
    name: "schema-explorer",
    summary: "Map tables into summaries",
    description: "Map database tables into context summaries",
    tags: ["Data"],
    tokens: "1.0k",
    triggers: 3,
    updated: "18 days ago",
    cover: cover("photo-1544383835-bda2bc66a55d", 390),
  },
  {
    name: "accessibility-audit",
    summary: "Check against WCAG",
    description: "Check interfaces against WCAG criteria",
    tags: ["Design"],
    tokens: "1.5k",
    triggers: 5,
    updated: "21 days ago",
    cover: cover("photo-1523289333742-be1143f6b766", 347),
  },
]

const filterTags: SkillTag[] = [...seedTags]

/* The demo rows that did not simply arrive from this machine, so the grid shows
   the range the design authored instead of one repeated label. */
const SAMPLE_ORIGINS: Record<string, SkillSource> = {
  "code-review": "builtin",
  "api-design": "builtin",
  "data-migration": "builtin",
  "incident-postmortem": "builtin",
  "doc-audit": "registry",
  "release-notes": "registry",
  "perf-profiling": "registry",
  "schema-explorer": "registry",
}

/* A sample row is keyed by its name; samples stand in for library rows. */
const sampleRows: Skill[] = sampleSkills.map((skill) => ({
  ...skill,
  id: skill.name,
  source: SAMPLE_ORIGINS[skill.name] ?? "local",
  location: "library",
  installed: false,
}))

/* The tab row carries one dimension: where a skill is, not where it came from. */
const TABS: { value: SkillTab; labelKey: string }[] = [
  { value: "all", labelKey: "skills.tab.all" },
  { value: "workspace", labelKey: "skills.tab.workspace" },
]

/** Which rows a tab shows. */
type SkillTab = "all" | "workspace"

/* Counts for the bundled demo rows, which have no store behind them. */
const SAMPLE_COUNTS = { all: 42, workspace: 12 }

/* Column widths include the 16px gutter the design leaves between columns. */
const columns = [
  { labelKey: "", width: 32 },
  { labelKey: "skills.column.skill", width: 340 },
  { labelKey: "skills.column.tags", width: 166 },
  { labelKey: "skills.column.location", width: 136 },
  { labelKey: "skills.column.tokens", width: 96 },
  { labelKey: "skills.column.triggers", width: 96 },
  { labelKey: "skills.column.updated", width: 120 },
  { labelKey: "skills.column.action", width: 102 },
]

const viewToggleSurface = "flex h-9 gap-1 rounded-lg bg-muted p-1"

function titleCase(name: string) {
  return name
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

function TagChip({
  tag,
  size = "sm",
}: {
  tag: string
  size?: "sm" | "md"
}) {
  const box =
    size === "sm"
      ? "h-[18px] px-1.5 text-[11px] leading-[13px]"
      : "h-5 px-[7px] text-xs leading-[14px]"

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full font-medium ${box} ${tagTone(tag).chip} ${tagTone(tag).label}`}
    >
      {tag}
    </span>
  )
}

function TagPill({ tag }: { tag: string }) {
  return (
    <span className="inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full bg-white/95 px-2.5 text-[11px] font-semibold shadow-[0_2px_6px_#0F172A1A] ring-1 ring-[#0F172A1F] dark:bg-[#0E1422E6] dark:text-[#F8FAFC] dark:shadow-[0_2px_6px_#00000059] dark:ring-[#FFFFFF24]">
      <span className={`size-1.5 shrink-0 rounded-full ${tagTone(tag).dot}`} />
      {tag}
    </span>
  )
}

/**
 * What the page can do with one row: put a library skill into the workspace,
 * take back one the workspace holds as the hub's link, copy a skill the
 * workspace wrote into the library, or clean up a link the library no longer
 * answers for. Nothing here deletes a skill the project owns.
 */
function WorkspaceButton({
  skill,
  blocked,
  onInstall,
  onAdopt,
  onRemove,
}: {
  skill: Skill
  /** Why no folder can be installed into, ready to show; `null` when one can. */
  blocked: string | null
  onInstall: () => void
  onAdopt: () => void
  onRemove: () => void
}) {
  const { t } = useI18n()
  const shell =
    "gap-[5px] px-2.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"

  if (skill.stale || skill.installed) {
    /* The label says which side gives its link back, because they differ. */
    const label = skill.stale
      ? t("skills.action.cleanup")
      : skill.linkAt === "library"
        ? t("skills.action.remove")
        : t("skills.action.uninstall")
    return (
      <Button
        type="button"
        size="xs"
        variant="outline"
        aria-label={`${label} ${skill.name}`}
        onClick={(event) => {
          event.stopPropagation()
          onRemove()
        }}
        className={`${shell} border-border bg-transparent text-secondary-foreground hover:bg-muted hover:text-foreground dark:border-input dark:bg-transparent`}
      >
        {skill.stale ? <Trash2Icon className="size-3.5" /> : <PowerIcon className="size-3.5" />}
        {label}
      </Button>
    )
  }

  /* A skill the project wrote: the library can take a copy of it. */
  if (skill.location === "workspace") {
    if (skill.inLibrary === true) return null
    return (
      <Button
        type="button"
        size="xs"
        variant="outline"
        aria-label={`${t("skills.action.adopt")} ${skill.name}`}
        onClick={(event) => {
          event.stopPropagation()
          onAdopt()
        }}
        className={`${shell} border-border bg-transparent text-secondary-foreground hover:bg-muted hover:text-foreground dark:border-input dark:bg-transparent`}
      >
        <LibraryIcon className="size-3.5" />
        {t("skills.action.adopt")}
      </Button>
    )
  }

  /* A skill the workspace wrote itself already holds the name. */
  const reason = blocked ?? (skill.taken === true ? t("skills.workspace.taken") : null)
  return (
    <Button
      type="button"
      size="xs"
      aria-label={`${t("skills.action.install")} ${skill.name}`}
      disabled={reason !== null}
      title={reason ?? undefined}
      onClick={(event) => {
        event.stopPropagation()
        onInstall()
      }}
      className={shell}
    >
      <DownloadIcon className="size-3.5" />
      {t("skills.action.install")}
    </Button>
  )
}

/** Cover image that reports its own aspect ratio, for a card sized to the asset. */
function PhotoCover({
  src,
  onRatio,
}: {
  src: string
  onRatio: (ratio: number) => void
}) {
  const ref = React.useRef<HTMLImageElement | null>(null)

  /* A cached image can finish before the load listener attaches. */
  React.useEffect(() => {
    const image = ref.current
    if (image?.complete && image.naturalWidth > 0) {
      onRatio(image.naturalWidth / image.naturalHeight)
    }
  }, [src, onRatio])

  return (
    <img
      ref={ref}
      src={src}
      alt=""
      onLoad={(event) => {
        const image = event.currentTarget
        onRatio(image.naturalWidth / image.naturalHeight)
      }}
      className="size-full object-cover"
    />
  )
}

function MarkdownCover({ skill }: { skill: Skill }) {
  const lines = [
    { text: "---", className: "text-muted-foreground/70" },
    { text: `name: ${skill.name}`, className: "text-secondary-foreground" },
    {
      text: `description: ${skill.summary}`,
      className: "text-secondary-foreground/85",
    },
    { text: "---", className: "text-muted-foreground/42" },
    {
      text: `# ${titleCase(skill.name)}`,
      className: "text-secondary-foreground/15",
    },
  ]

  return (
    <div className="flex h-full flex-col gap-0.5 bg-surface-raised px-3 pt-10 pb-2.5 font-mono text-[10px] leading-[14px]">
      {lines.map((line, index) => (
        <span key={index} className={`truncate ${line.className}`}>
          {line.text}
        </span>
      ))}
    </div>
  )
}

/** Ratio a card falls back to before its asset reports one. */
const FALLBACK_RATIO = 16 / 9

function SkillCard({
  skill,
  blocked,
  onInstall,
  onAdopt,
  onRemove,
  onOpen,
}: {
  skill: Skill
  /** Why no folder can be installed into, ready to show; `null` when one can. */
  blocked: string | null
  onInstall: () => void
  onAdopt: () => void
  onRemove: () => void
  onOpen: () => void
}) {
  const shownTags = skill.tags.slice(0, 2)
  const extraTags = skill.tags.length - shownTags.length
  /* Stable identity keeps the ratio callback from re-running every render. */
  const media = React.useMemo(() => cardMedia(skill), [skill])
  /* The media box takes the asset's own ratio, so covers are never cropped. */
  const [ratio, setRatio] = React.useState<number | undefined>(() =>
    media === undefined ? undefined : knownAspect(media.src)
  )

  const measure = React.useCallback(
    (next: number) => {
      if (media === undefined) return
      rememberAspect(media.src, next)
      setRatio(next)
    },
    [media]
  )

  return (
    <div
      onClick={onOpen}
      className="mb-5 cursor-pointer overflow-hidden rounded-lg bg-card shadow-glass ring-1 ring-glass-border backdrop-blur-glass break-inside-avoid"
    >
      <div
        className="relative w-full overflow-hidden bg-surface-raised"
        style={{ aspectRatio: ratio ?? FALLBACK_RATIO }}
      >
        {media === undefined ? (
          <MarkdownCover skill={skill} />
        ) : media.kind === "video" ? (
          <AutoplayVideo
            src={media.src}
            onAspect={measure}
            className="size-full object-cover"
          />
        ) : (
          <PhotoCover src={media.src} onRatio={measure} />
        )}
        <div className="absolute top-3 left-3 flex items-center gap-1.5">
          {shownTags.map((tag) => (
            <TagPill key={tag} tag={tag} />
          ))}
          {extraTags > 0 && (
            <span className="inline-flex h-[22px] shrink-0 items-center rounded-full bg-white/95 px-2.5 text-[11px] font-semibold text-muted-foreground shadow-[0_2px_6px_#0F172A1A] ring-1 ring-[#0F172A1F] dark:bg-[#0E1422E6] dark:text-[#94A3B8] dark:shadow-[0_2px_6px_#00000059] dark:ring-[#FFFFFF24]">
              +{extraTags}
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1 px-3 py-2.5">
        <div className="flex h-[18px] items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold">{skill.name}</span>
          {/* A skill the hub does not hold has no recorded age; nothing goes here. */}
          {skill.updated === "" ? null : (
            <span className="shrink-0 text-[11px] leading-[14px] text-muted-foreground">
              {skill.updated}
            </span>
          )}
        </div>
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {skill.description}
        </p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <ProvenanceLine skill={skill} />
          <WorkspaceButton
            skill={skill}
            blocked={blocked}
            onInstall={onInstall}
            onAdopt={onAdopt}
            onRemove={onRemove}
          />
        </div>
      </div>
    </div>
  )
}

function SkillGrid({
  skills,
  blocked,
  onInstall,
  onAdopt,
  onRemove,
  onOpen,
}: {
  skills: Skill[]
  /** Why no folder can be installed into, ready to show; `null` when one can. */
  blocked: string | null
  onInstall: (skill: Skill) => void
  onAdopt: (skill: Skill) => void
  onRemove: (skill: Skill) => void
  onOpen: (skill: Skill) => void
}) {
  /*
   * Masonry: column-width lets the browser pick how many 266px columns fit
   * (four at the design's 1136), and each card keeps its own height.
   */
  return (
    <div className="columns-[266px] gap-x-6">
      {skills.map((skill) => (
        <SkillCard
          key={skillKey(skill)}
          skill={skill}
          blocked={blocked}
          onInstall={() => onInstall(skill)}
          onAdopt={() => onAdopt(skill)}
          onRemove={() => onRemove(skill)}
          onOpen={() => onOpen(skill)}
        />
      ))}
    </div>
  )
}

function SkillThumb({ skill }: { skill: Skill }) {
  const media = cardMedia(skill)

  if (media?.kind === "video") {
    return (
      <AutoplayVideo
        src={media.src}
        className="size-9 shrink-0 rounded-md object-cover"
      />
    )
  }

  if (media !== undefined) {
    return (
      <img
        src={media.src}
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

function SkillTable({
  skills,
  rangeText,
  pagination,
  blocked,
  onInstall,
  onAdopt,
  onRemove,
  onOpen,
}: {
  skills: Skill[]
  /** Footer summary above the pager, e.g. "1–12 / 42". */
  rangeText: string
  pagination: React.ReactNode
  /** Why no folder can be installed into, ready to show; `null` when one can. */
  blocked: string | null
  onInstall: (skill: Skill) => void
  onAdopt: (skill: Skill) => void
  onRemove: (skill: Skill) => void
  onOpen: (skill: Skill) => void
}) {
  const { t } = useI18n()

  return (
    <Card className={`${cardSurface} gap-4`}>
      <CardHeader className="gap-1">
        <CardTitle className="text-base leading-tight font-semibold">
          {t("skills.installed.title")}
        </CardTitle>
        <CardDescription className="text-sm leading-snug">
          {t("skills.installed.description")}
        </CardDescription>
      </CardHeader>
      <div className="px-6">
        <Table className="table-fixed [&_td]:p-0 [&_th]:px-0">
          <TableHeader>
            <TableRow className="h-10">
              {columns.map((column, index) => (
                <TableHead
                  key={column.labelKey || index}
                  style={{ width: column.width }}
                  className="text-muted-foreground"
                >
                  {column.labelKey === "" ? "" : t(column.labelKey)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {skills.map((skill) => (
              <TableRow
                key={skillKey(skill)}
                onClick={() => onOpen(skill)}
                className="h-11 cursor-pointer"
              >
                <TableCell onClick={(event) => event.stopPropagation()}>
                  <Checkbox
                    aria-label={`${t("skills.table.select")} ${skill.name}`}
                  />
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
                  <ProvenanceLine skill={skill} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {skill.tokens ?? "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {skill.triggers ?? "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {skill.updated}
                </TableCell>
                <TableCell>
                  <WorkspaceButton
                    skill={skill}
                    blocked={blocked}
                    onInstall={() => onInstall(skill)}
                    onAdopt={() => onAdopt(skill)}
                    onRemove={() => onRemove(skill)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between px-6">
        <span className="text-xs text-muted-foreground">{rangeText}</span>
        {pagination}
      </div>
    </Card>
  )
}

function PageTitleRow({
  tag,
  onTagChange,
  options,
}: {
  /** Selected category filter, or "All tags". */
  tag: string
  onTagChange: (tag: string) => void
  /** The categories on offer, from the library or the bundle. */
  options: readonly string[]
}) {
  const { t } = useI18n()
  const [expanded, setExpanded] = React.useState(false)
  const visible = expanded ? options : options.slice(0, 4)

  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("skills.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("skills.description")}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        <button
          type="button"
          aria-pressed={tag === "All tags"}
          onClick={() => onTagChange("All tags")}
          className={`flex h-[26px] shrink-0 items-center justify-center rounded-full px-2.5 text-[12.5px] transition-colors ${
            tag === "All tags"
              ? "bg-primary font-semibold text-primary-foreground"
              : "bg-surface-raised text-muted-foreground"
          }`}
        >
          {t("skills.allTags")}
        </button>
        {visible.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={tag === item}
            onClick={() => onTagChange(item)}
            className={`flex h-[26px] shrink-0 items-center justify-center rounded-full px-2.5 text-[12.5px] transition-colors ${
              tag === item
                ? `bg-primary font-semibold text-primary-foreground`
                : `bg-surface-raised font-medium ${tagTone(item).label}`
            }`}
          >
            {item}
          </button>
        ))}
        {expanded ? null : options.length > visible.length ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="flex h-[26px] shrink-0 items-center justify-center rounded-full bg-surface-raised px-2.5 text-[12.5px] font-medium text-muted-foreground transition-colors"
          >
            +{options.length - visible.length}
          </button>
        ) : null}
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
  const { t } = useI18n()
  const [tab, setTab] = React.useState<SkillTab>("all")
  const [view, setView] = React.useState<"grid" | "list">("grid")
  const [addTab, setAddTab] = React.useState<AddSkillTab | null>(null)
  const [tag, setTag] = React.useState("All tags")
  const [page, setPage] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(12)
  /* One line above the list: how an install landed, or why it did not. */
  const [notice, setNotice] = React.useState<{ tone: "info" | "error"; text: string } | null>(null)
  /* The open lightbox is a row key, because the same id can be two rows. */
  const [detailKey, setDetailKey] = React.useState<string | null>(null)
  /* Bundled rows have no library behind them; edits stay in this map. */
  const [samplePatch, setSamplePatch] = React.useState<
    Record<string, Partial<Skill>>
  >({})

  const library = useSkillLibrary()
  const usingStore = library.store !== null
  const counts = usingStore ? library.counts : SAMPLE_COUNTS
  /* With no folder to install into, the action says why it is unavailable. */
  const blocked =
    library.workspaceId === null
      ? t("skills.workspace.none")
      : library.workspaceRoot === null
        ? t("skills.workspace.noPath")
        : null

  /* The page filters and pages what the hook hands it: rows come from the
     library and the workspace both, and only one of the two has a server page. */
  const matching = React.useMemo(() => {
    const rows = usingStore
      ? library.rows
      : sampleRows.map((skill) => ({ ...skill, ...samplePatch[skill.id] }))
    const onTab = tab === "workspace" ? rows.filter((row) => row.location !== "library") : rows
    return tag === "All tags" ? onTab : onTab.filter((row) => row.tags.includes(tag))
  }, [usingStore, library.rows, tab, tag, samplePatch])

  const skills = React.useMemo(
    () => matching.slice(page * pageSize, (page + 1) * pageSize),
    [matching, page, pageSize]
  )

  const detail = matching.find((skill) => skillKey(skill) === detailKey) ?? null

  /** Apply a change, then re-read the page so the list shows what was stored. */
  const applyTo = async (skill: Skill, patch: Partial<Skill>, persist: () => Promise<unknown>) => {
    if (usingStore) {
      await persist()
      await library.reload()
      return
    }
    setSamplePatch((current) => ({ ...current, [skill.id]: { ...current[skill.id], ...patch } }))
  }

  /** Why an action did not go through, ready to show. */
  const reasonOf = (failure: unknown) => (failure instanceof Error ? failure.message : String(failure))

  const install = async (skill: Skill) => {
    try {
      const landed = await library.install(skill.id)
      setNotice(
        landed === "copy"
          ? { tone: "info", text: t("skills.notice.copied") }
          : null
      )
    } catch (failure) {
      setNotice({ tone: "error", text: reasonOf(failure) })
    }
  }

  /** Take back the link that put a skill in both places. */
  const uninstall = async (skill: Skill) => {
    try {
      if (skill.linkAt === "library") {
        /* The library linked the skill in; removing its entry takes the link. */
        await (library.store?.remove(skill.id) ?? Promise.resolve())
        await library.reload()
      } else {
        await library.remove(skill.id)
      }
      setNotice(null)
    } catch (failure) {
      setNotice({ tone: "error", text: reasonOf(failure) })
    }
  }

  /** Link a skill the workspace wrote into the library. */
  const adopt = async (skill: Skill) => {
    try {
      const landed = await library.adopt(skill.id)
      setNotice({
        tone: "info",
        text: t(landed === "copy" ? "skills.notice.adoptedCopy" : "skills.notice.adopted").replace(
          "{name}",
          skill.name
        ),
      })
    } catch (failure) {
      setNotice({ tone: "error", text: reasonOf(failure) })
    }
  }

  const setTags = (skill: Skill, tags: string[]) =>
    void applyTo(skill, { tags }, () =>
      library.store?.update(skill.id, { tags }) ?? Promise.resolve()
    )

  /** Delete the skill, then close the lightbox it was open in. */
  const removeSkill = async (skill: Skill) => {
    await (library.store?.remove(skill.id) ?? Promise.resolve())
    await library.reload()
    setDetailKey(null)
  }

  /** Delete a skill from the workspace folder, then close the lightbox. */
  const removeWorkspaceSkill = async (skill: Skill) => {
    await library.deleteWorkspaceSkill(skill.id)
    setDetailKey(null)
  }

  const openDetail = (skill: Skill) => setDetailKey(skillKey(skill))

  const total = matching.length
  const from = total === 0 ? 0 : page * pageSize + 1
  const to = Math.min(total, (page + 1) * pageSize)
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const rangeText = `${from}–${to} / ${total}`

  const pagination = (
    <TablePagination
      pageText={`${page + 1} / ${pageCount}`}
      label={t("pager.rowsPerPage")}
      pageSize={pageSize}
      canPrev={page > 0}
      canNext={page + 1 < pageCount}
      onPageSizeChange={(size) => {
        setPageSize(size)
        setPage(0)
      }}
      onFirst={() => setPage(0)}
      onPrev={() => setPage((current) => Math.max(0, current - 1))}
      onNext={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
      onLast={() => setPage(pageCount - 1)}
    />
  )

  return (
    <>
      <PageTitleRow
        tag={tag}
        onTagChange={setTag}
        options={usingStore ? library.tags : filterTags}
      />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(TABS.find((item) => item.value === value)?.value ?? "all")
          setPage(0)
        }}
        className="gap-6"
      >
        <div className="flex items-start justify-between gap-6">
          <TabsList className="h-9 gap-1 rounded-lg p-1">
            {TABS.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className="h-7 flex-none rounded-md px-3 text-[13px] text-muted-foreground data-active:bg-accent data-active:text-foreground dark:data-active:bg-accent dark:data-active:text-foreground"
              >
                {t(item.labelKey)}
                {` ${counts[item.value]}`}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="flex shrink-0 items-center gap-2">
            <div className={viewToggleSurface}>
              <ViewButton
                icon={LayoutGridIcon}
                label={t("skills.view.grid")}
                active={view === "grid"}
                onClick={() => setView("grid")}
              />
              <ViewButton
                icon={ListIcon}
                label={t("skills.view.list")}
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
              {t("skills.action.import")}
            </Button>
          </div>
        </div>
        {notice === null ? null : (
          <span
            className={`text-xs leading-[15px] ${
              notice.tone === "error" ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {notice.text}
          </span>
        )}
        <TabsContent value={tab} className="flex flex-col gap-6">
          {library.loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              {t("skills.loading")}
            </div>
          ) : library.error !== null ? (
            <div className="flex flex-col items-start gap-2 text-sm">
              <span className="text-destructive">{library.error}</span>
              <Button variant="outline" size="sm" onClick={() => void library.reload()}>
                {t("skills.retry")}
              </Button>
            </div>
          ) : skills.length === 0 ? (
            <div className="flex flex-col items-start gap-2 py-12 text-sm text-muted-foreground">
              <span>
                {tab === "workspace"
                  ? library.workspaceId === null
                    ? t("skills.workspace.none")
                    : library.workspaceRoot === null
                      ? t("skills.workspace.noPath")
                      : t("skills.workspace.empty")
                  : t("skills.empty")}
              </span>
              <span className="text-xs">
                {tab === "workspace" ? (library.workspaceRoot ?? "") : library.root}
              </span>
            </div>
          ) : view === "grid" ? (
            <>
              <SkillGrid
                skills={skills}
                blocked={blocked}
                onInstall={install}
                onAdopt={adopt}
                onRemove={uninstall}
                onOpen={openDetail}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{rangeText}</span>
                {pagination}
              </div>
            </>
          ) : (
            <SkillTable
              skills={skills}
              rangeText={rangeText}
              pagination={pagination}
              blocked={blocked}
              onInstall={install}
              onAdopt={adopt}
              onRemove={uninstall}
              onOpen={openDetail}
            />
          )}
        </TabsContent>
      </Tabs>
      <AddSkillDialog
        open={addTab !== null}
        tab={addTab ?? "local"}
        store={library.store}
        onTabChange={setAddTab}
        onImported={() => void library.reload()}
        onOpenChange={(open) => {
          if (!open) setAddTab(null)
        }}
      />
      <SkillDetailDialog
        skill={detail}
        store={library.store}
        root={library.root}
        workspacePath={library.workspaceRoot}
        reason={blocked ?? (detail?.taken === true ? t("skills.workspace.taken") : null)}
        onToggle={() => {
          if (detail === null) return
          if (detail.installed || detail.stale) void uninstall(detail)
          else void install(detail)
        }}
        onAdopt={(skill) => void adopt(skill)}
        onDelete={removeSkill}
        onDeleteWorkspace={removeWorkspaceSkill}
        onTagsChange={(tags) => {
          if (detail) setTags(detail, tags)
        }}
        onChanged={() => void library.reload()}
        onOpenChange={(open) => {
          if (!open) setDetailKey(null)
        }}
      />
    </>
  )
}
