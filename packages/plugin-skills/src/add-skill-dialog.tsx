import {
  BracesIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DatabaseIcon,
  FileTextIcon,
  GlobeIcon,
  LanguagesIcon,
  ScrollTextIcon,
  SearchIcon,
  UploadIcon,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { useI18n } from "@workspace/extensions/react"

export type AddSkillTab = "skill.sh" | "local"

const outline = "border-border bg-transparent dark:border-input dark:bg-transparent"

const segments: { value: AddSkillTab; labelKey: string }[] = [
  { value: "skill.sh", labelKey: "skills.add.segment.registry" },
  { value: "local", labelKey: "skills.add.segment.local" },
]

/* Sort option labels double as the Select value, which SelectValue renders verbatim. */
const sortOptions = ["Most installs", "Recently updated", "Trending"]

type RegistrySkill = {
  name: string
  author: string
  description: string
  installs: string
  tint: string
  icon: LucideIcon
  installed?: boolean
}

const registrySkills: RegistrySkill[] = [
  {
    name: "web-scraper",
    author: "dataforge",
    description: "Scrape and summarize public web pages",
    installs: "48.2k installs",
    tint: "#93C5FD66",
    icon: GlobeIcon,
  },
  {
    name: "sql-optimizer",
    author: "queryguild",
    description: "Rewrite slow SQL and explain the plan",
    installs: "31.7k installs",
    tint: "#A7F3D066",
    icon: DatabaseIcon,
    installed: true,
  },
  {
    name: "figma-handoff",
    author: "uikraft",
    description: "Turn Figma frames into component specs",
    installs: "22.4k installs",
    tint: "#FBCFE866",
    icon: FileTextIcon,
  },
  {
    name: "log-triage",
    author: "srecollective",
    description: "Cluster noisy logs into incident timelines",
    installs: "18.9k installs",
    tint: "#FCD34D66",
    icon: ScrollTextIcon,
  },
  {
    name: "api-mock",
    author: "mockyard",
    description: "Generate mock servers from OpenAPI specs",
    installs: "15.3k installs",
    tint: "#C4B5FD66",
    icon: BracesIcon,
  },
  {
    name: "i18n-sync",
    author: "localelab",
    description: "Keep locale files aligned across branches",
    installs: "9.8k installs",
    tint: "#A5B4FC66",
    icon: LanguagesIcon,
  },
]

function SegmentRow({
  tab,
  onTabChange,
}: {
  tab: AddSkillTab
  onTabChange: (tab: AddSkillTab) => void
}) {
  const { t } = useI18n()

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
            {t(segment.labelKey)}
          </button>
        ))}
      </div>
    </div>
  )
}

function RegistryResults() {
  const { t } = useI18n()

  return (
    <>
      <div className="px-6 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-primary" />
            <Input
              className="h-10 pl-9"
              placeholder={t("skills.add.searchPlaceholder")}
              aria-label={t("skills.add.searchPlaceholder")}
            />
          </div>
          <Select defaultValue={sortOptions[0]}>
            <SelectTrigger
              className={`w-[138px] data-[size=default]:h-9 ${outline}`}
              aria-label={t("skills.add.sort")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="h-px shrink-0 bg-border" />
      <div className="flex items-center justify-between px-6 pt-3 pb-2">
        <span className="text-xs leading-[15px] text-muted-foreground">
          {t("skills.add.popular")}
        </span>
        <span className="text-xs leading-[15px] text-muted-foreground">
          {t("skills.add.verified")}
        </span>
      </div>
      <ul>
        {registrySkills.map((skill) => (
          <li
            key={skill.name}
            className="flex h-[68px] items-center gap-3.5 px-6"
          >
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: skill.tint }}
            >
              <skill.icon className="size-[18px] text-secondary-foreground" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{skill.name}</span>
                <span className="text-xs text-muted-foreground">
                  by @{skill.author}
                </span>
              </div>
              <span className="truncate text-xs text-muted-foreground">
                {skill.description}
              </span>
            </div>
            <span className="w-[104px] shrink-0 text-right text-xs text-muted-foreground">
              {skill.installs}
            </span>
            {skill.installed ? (
              <Badge variant="ghost">
                <CheckIcon className="text-chart-2" />
                {t("skills.add.installed")}
              </Badge>
            ) : (
              <Button className="w-24">{t("skills.action.install")}</Button>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

function LocalImport() {
  const { t } = useI18n()

  return (
    <div className="px-6 pb-6">
      <div className="flex h-[228px] flex-col items-center justify-center gap-3 rounded-lg bg-dropzone p-7 ring-2 ring-primary">
        <span className="flex size-14 items-center justify-center rounded-full bg-surface-raised">
          <UploadIcon className="size-[26px] text-primary" />
        </span>
        <span className="text-[15px] font-semibold">
          {t("skills.add.dropTitle")}
        </span>
        <span className="w-[420px] text-center text-xs text-muted-foreground">
          {t("skills.add.dropHint")}
        </span>
        <Button variant="outline" className={`px-4 ${outline}`}>
          <UploadIcon />
          {t("skills.add.browseFiles")}
        </Button>
      </div>
    </div>
  )
}

function CompactPager({ pageText }: { pageText: string }) {
  const { t } = useI18n()

  return (
    <div className="flex h-8 items-center gap-4">
      <span className="text-xs text-muted-foreground">{pageText}</span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          disabled
          className={outline}
          aria-label={t("skills.add.previousPage")}
        >
          <ChevronLeftIcon />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className={outline}
          aria-label={t("skills.add.nextPage")}
        >
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  )
}

/** Add-skill dialog: the skill.sh registry and local folders are two tabs of one flow. */
export function AddSkillDialog({
  open,
  tab,
  onTabChange,
  onOpenChange,
}: {
  open: boolean
  tab: AddSkillTab
  onTabChange: (tab: AddSkillTab) => void
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useI18n()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 rounded-lg bg-dialog p-0 shadow-[0_24px_56px_#0F172A3D] ring-glass-border backdrop-blur-xl sm:max-w-[640px]"
      >
        <div className="flex items-start gap-4 px-6 pt-[22px] pb-4">
          <div className="flex flex-col gap-[5px]">
            <DialogTitle className="text-base leading-[19px] font-semibold">
              {t("skills.add.title")}
            </DialogTitle>
            <DialogDescription className="text-sm leading-[17px]">
              {t("skills.add.description")}
            </DialogDescription>
          </div>
          <DialogClose
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="ml-auto shrink-0"
                aria-label={t("skills.action.close")}
              />
            }
          >
            <XIcon className="text-muted-foreground" />
          </DialogClose>
        </div>
        <SegmentRow tab={tab} onTabChange={onTabChange} />
        {tab === "skill.sh" ? <RegistryResults /> : <LocalImport />}
        <div className="flex h-16 items-center justify-between gap-3 border-t border-border px-6">
          {tab === "skill.sh" ? (
            <>
              <span className="text-xs text-muted-foreground">
                {t("skills.add.registryRange")}
              </span>
              <div className="flex items-center gap-2">
                <CompactPager pageText={t("skills.add.page")} />
                <DialogClose
                  render={<Button variant="outline" className={outline} />}
                >
                  {t("skills.action.close")}
                </DialogClose>
              </div>
            </>
          ) : (
            <>
              <span className="text-xs text-muted-foreground">
                {t("skills.add.copiedHint")}
              </span>
              <div className="flex items-center gap-2">
                <DialogClose render={<Button variant="ghost" />}>
                  {t("skills.action.cancel")}
                </DialogClose>
                <Button>{t("skills.action.import")}</Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
