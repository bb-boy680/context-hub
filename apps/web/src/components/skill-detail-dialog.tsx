import {
  ChevronDownIcon,
  CopyIcon,
  FileIcon,
  FileTextIcon,
  FolderIcon,
  ImagePlusIcon,
  PlusIcon,
  SparklesIcon,
  XIcon,
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

type DetailSkill = {
  name: string
  summary: string
  description: string
  tags: string[]
  source: string
  tokens: string
  triggers: number
  cover?: string
}

const tagChipClass: Record<string, string> = {
  Documents: "bg-chip-documents text-tag-documents",
  Engineering: "bg-chip-engineering text-tag-engineering",
  Docs: "bg-chip-docs text-tag-docs",
  Data: "bg-chip-data text-tag-data",
  Design: "bg-chip-design text-tag-design",
  Integrations: "bg-chip-integrations text-tag-integrations",
  Quality: "bg-chip-quality text-tag-quality",
  Reliability: "bg-chip-reliability text-tag-reliability",
  Marketing: "bg-chip-marketing text-tag-marketing",
}

const suggestions: Record<string, string> = {
  Documents: "Tables, OCR, CSV",
  Engineering: "Review, Refactor, Types",
  Docs: "Audit, Budgets, Structure",
  Data: "Schemas, Migrations, Rollback",
  Design: "Contrast, Focus, Tokens",
  Integrations: "Sync, Webhooks, Mapping",
  Quality: "Lint, Coverage, Regression",
  Reliability: "Incidents, Timelines, Alerts",
  Marketing: "Tone, Voice, Personas",
}

const fileTree = [
  { name: "skill", kind: "folder", depth: 0 },
  { name: "SKILL.md", kind: "file", depth: 1, selected: true },
  { name: "README.md", kind: "file", depth: 1 },
  { name: "scripts", kind: "folder", depth: 1 },
  { name: "templates", kind: "folder", depth: 1 },
  { name: "assets", kind: "folder", depth: 1 },
] as const

function titleCase(value: string) {
  return value
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

type CodeLine = { text: string; className: string }

const muted = "text-muted-foreground"
const body = "text-secondary-foreground"

/** SKILL.md as the design renders it: frontmatter, a heading, steps, then guardrails. */
function skillFile(skill: DetailSkill): CodeLine[] {
  const heading = `# ${titleCase(skill.name)}`
  const lower = skill.summary.charAt(0).toLowerCase() + skill.summary.slice(1)

  return [
    { text: "---", className: muted },
    { text: `name: ${skill.name}`, className: muted },
    { text: `description: ${skill.summary}`, className: muted },
    { text: `category: ${skill.tags[0]}`, className: muted },
    { text: "---", className: muted },
    { text: "", className: muted },
    { text: heading, className: "text-tag-docs" },
    { text: "", className: muted },
    { text: `Apply this skill to ${lower}.`, className: body },
    { text: "", className: muted },
    { text: "## Steps", className: "text-primary" },
    { text: "1. Read the request and the target files", className: body },
    { text: "2. Apply the rules this skill defines", className: body },
    { text: "3. Report what changed and why", className: body },
    { text: "", className: muted },
    { text: "## Guardrails", className: "text-primary" },
    { text: "- Never invent facts that are not in the source", className: body },
  ]
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-sm leading-[17px] font-semibold">{children}</span>
}

function CoverImages({ skill }: { skill: DetailSkill }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <SectionLabel>Cover images</SectionLabel>
        <span className="text-xs leading-[15px] text-muted-foreground">
          The first image is used as the card cover. Upload up to 6.
        </span>
      </div>
      <div className="flex gap-3">
        <div className="relative size-[84px] w-[150px] shrink-0 overflow-hidden rounded-md ring-1 ring-glass-border ring-inset">
          {skill.cover ? (
            <img src={skill.cover} alt="" className="size-full object-cover" />
          ) : (
            <PreviewMarkdown skill={skill} />
          )}
          <span className="absolute top-1.5 left-1.5 rounded bg-[#0f172acc] px-1.5 py-[3px] text-[10.5px] leading-[13px] font-semibold text-white">
            Cover
          </span>
        </div>
        <button
          type="button"
          aria-label="Add cover image"
          className="flex h-[84px] w-[150px] shrink-0 items-center justify-center rounded-md border-2 border-input text-muted-foreground transition-colors hover:text-foreground"
        >
          <ImagePlusIcon className="size-5" />
        </button>
      </div>
    </div>
  )
}

function PreviewMarkdown({ skill }: { skill: DetailSkill }) {
  return (
    <div className="flex size-full flex-col justify-center gap-0.5 bg-surface-raised px-3 font-mono text-[9px] leading-[12px] text-secondary-foreground/70">
      <span>---</span>
      <span>{`name: ${skill.name}`}</span>
      <span className="truncate">{`description: ${skill.summary}`}</span>
    </div>
  )
}

function CategorySection({ skill }: { skill: DetailSkill }) {
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>Category</SectionLabel>
      <div className="flex items-center gap-2">
        {skill.tags.map((tag) => (
          <span
            key={tag}
            className={`flex h-[30px] shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium ${tagChipClass[tag]}`}
          >
            {tag}
            <XIcon className="size-[13px]" />
          </span>
        ))}
        <div className="flex h-[34px] w-[260px] shrink-0 items-center gap-2 rounded-md border border-input px-3 text-[13px] text-muted-foreground">
          <PlusIcon className="size-3.5" />
          Add a tag
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-xs leading-[18px] text-muted-foreground">
        <SparklesIcon className="size-[13px]" />
        {`Suggestions: ${suggestions[skill.tags[0]]}`}
      </div>
    </div>
  )
}

function BasicsSection({ skill }: { skill: DetailSkill }) {
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>Basics</SectionLabel>
      <div className="flex gap-4">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-xs leading-[15px] font-medium text-muted-foreground">
            Name
          </span>
          <input
            defaultValue={skill.name}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-[13.5px] outline-none focus-visible:border-ring"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-xs leading-[15px] font-medium text-muted-foreground">
            Trigger phrases
          </span>
          <input
            defaultValue={`${skill.triggers} phrases`}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-[13.5px] outline-none focus-visible:border-ring"
          />
        </label>
      </div>
    </div>
  )
}

function ConfigurationPanel({ skill }: { skill: DetailSkill }) {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <CoverImages skill={skill} />
      <CategorySection skill={skill} />
      <BasicsSection skill={skill} />
      <div className="h-4" />
    </div>
  )
}

function FilesPanel({ skill }: { skill: DetailSkill }) {
  const lines = skillFile(skill)

  return (
    <div className="flex flex-1 gap-5 p-6">
      <div className="flex w-[220px] shrink-0 flex-col gap-0.5">
        {fileTree.map((node) => (
          <span
            key={node.name}
            className={`flex h-7 items-center gap-[7px] rounded-md text-[13px] ${
              node.depth === 0 ? "pl-2" : "pl-[22px]"
            } ${
              "selected" in node && node.selected
                ? "bg-muted font-medium text-foreground"
                : "text-secondary-foreground"
            }`}
          >
            {node.kind === "folder" ? (
              <ChevronDownIcon className="size-[13px] shrink-0 text-muted-foreground" />
            ) : null}
            {node.kind === "folder" ? (
              <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <FileTextIcon
                className={`size-3.5 shrink-0 ${
                  "selected" in node && node.selected
                    ? "text-foreground"
                    : "text-muted-foreground"
                }`}
              />
            )}
            <span className="truncate">{node.name}</span>
          </span>
        ))}
      </div>
      <div className="flex flex-1 flex-col overflow-hidden rounded-md border border-input bg-[#ffffffb3] dark:bg-white/5">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3.5">
          <FileIcon className="size-3.5 text-muted-foreground" />
          <span className="text-[13px] font-medium">SKILL.md</span>
          <CopyIcon className="ml-auto size-3.5 text-muted-foreground" />
        </div>
        <div className="flex-1 overflow-auto pt-2.5 pb-[34px] font-mono">
          {lines.map((line, index) => (
            <div key={index} className="flex h-5 items-center px-3.5">
              <span className="w-[34px] shrink-0 text-[11.5px] text-muted-foreground">
                {index + 1}
              </span>
              <span className={`pl-3 text-xs whitespace-pre ${line.className}`}>
                {line.text}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Dialog body for one skill; remounting per skill resets the open tab. */
function SkillDetailBody({ skill }: { skill: DetailSkill }) {
  const [tab, setTab] = React.useState<"configuration" | "files">(
    "configuration"
  )

  const tabClass = (value: typeof tab) =>
    `relative flex h-11 items-center px-3.5 text-sm transition-colors ${
      tab === value
        ? "font-semibold text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary"
        : "text-muted-foreground hover:text-foreground"
    }`

  return (
    <>
      <div className="flex h-[84px] shrink-0 items-center gap-3.5 px-6 pt-[22px] pb-[18px]">
        <span
          className={`flex size-11 shrink-0 items-center justify-center rounded-[10px] ${tagChipClass[skill.tags[0]]}`}
        >
          <SparklesIcon className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <DialogTitle className="text-[17px] leading-[21px] font-semibold">
            {skill.name}
          </DialogTitle>
          <DialogDescription className="truncate text-[13px] leading-4">
            {`${skill.description}  ·  ${skill.source}  ·  ${skill.tokens} tokens`}
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
      <div className="flex h-11 shrink-0 items-end gap-1 border-b border-input px-6">
        <button
          type="button"
          className={tabClass("configuration")}
          onClick={() => setTab("configuration")}
        >
          Configuration
        </button>
        <button
          type="button"
          className={tabClass("files")}
          onClick={() => setTab("files")}
        >
          Files
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {tab === "configuration" ? (
          <ConfigurationPanel skill={skill} />
        ) : (
          <FilesPanel skill={skill} />
        )}
      </div>
      {tab === "configuration" ? (
        <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-t border-border px-6">
          <span className="text-xs text-muted-foreground">
            Changes apply to every agent run in this workspace.
          </span>
          <div className="flex items-center gap-2">
            <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
            <Button className="w-[150px]">Save changes</Button>
          </div>
        </div>
      ) : null}
    </>
  )
}

/** Detail dialog for one skill; opens on double-click from either view. */
export function SkillDetailDialog({
  skill,
  onOpenChange,
}: {
  skill: DetailSkill | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={skill !== null} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[620px] w-[920px] flex-col gap-0 rounded-lg bg-dialog p-0 shadow-[0_24px_56px_#0F172A3D] ring-glass-border backdrop-blur-xl sm:max-w-[920px]"
      >
        {skill ? <SkillDetailBody key={skill.name} skill={skill} /> : null}
      </DialogContent>
    </Dialog>
  )
}
