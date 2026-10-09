import {
  CheckIcon,
  CompassIcon,
  ChevronDownIcon,
  DownloadIcon,
  FileTextIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  LayoutGridIcon,
  LibraryIcon,
  ListIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  SearchXIcon,
  TriangleAlertIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react"
import * as React from "react"

import { AddSkillDialog, type AddSkillTab } from "./add-skill-dialog.tsx"
import { AutoplayVideo } from "./autoplay-video.tsx"
import { SearchSkillsDialog } from "./search-dialog.tsx"
import { holdsOf, inLibrary, skillKey, tokenLabel, useSkillDocument, useSkillLibrary } from "./library.ts"
import { cardMedia, knownAspect, rememberAspect } from "./media.ts"
import { ProvenanceLine } from "./provenance-line.tsx"
import { SkillDetailDialog } from "./skill-detail-dialog.tsx"
import { tagTone } from "./tags.ts"
import type { SkillStore } from "./store.ts"
import type { Skill, SkillPlace } from "./types.ts"

import { useContributions, useI18n } from "@workspace/extensions/react"
import type { ExtensionIcon } from "@workspace/extensions"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Kbd } from "@workspace/ui/components/kbd"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
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
  "[--card-spacing:1.5rem] rounded-xl ring-1 ring-border"

/* The tab row carries one dimension: where a skill is, not where it came from.
   The shell owns the first two; every place a workspace keeps skills in — the
   directory the skills CLI shares, and each agent integration's own — is a tab
   contributed by the extension that knows it, icon and all. */
const SHELL_TABS: { value: SkillTab; labelKey: string; icon: ExtensionIcon }[] = [
  { value: "all", labelKey: "skills.tab.all", icon: LayoutGridIcon },
  { value: "library", labelKey: "skills.tab.library", icon: LibraryIcon },
]

/** Which rows a tab shows. */
type SkillTab = "all" | "library" | SkillPlace

/** Which rows one tab holds, before the category filter. */
function rowsForTab(rows: Skill[], value: SkillTab): Skill[] {
  if (value === "all") return rows
  if (value === "library") return rows.filter(inLibrary)
  return rows.filter((row) => holdsOf(row).some((hold) => hold.id === value))
}

/**
 * The three fields the query box reads. The store narrows the catalog with the
 * same three, but a place's own rows never travel through it, so the page reads
 * them here as well.
 */
function matchesQuery(row: Skill, text: string) {
  return (
    row.name.toLowerCase().includes(text) ||
    row.description.toLowerCase().includes(text) ||
    row.tags.some((item) => item.toLowerCase().includes(text))
  )
}

/* Column widths as shares of the table, not fixed pixels. The table is
   `table-fixed` inside a panel whose width follows the window, so fixed widths
   pushed the action column off the right edge — the one column the list exists
   for. The shares keep the design's proportions at any width. */
const columns = [
  { labelKey: "", width: "2.9%" },
  { labelKey: "skills.column.skill", width: "43.1%" },
  { labelKey: "skills.column.tags", width: "19.3%" },
  { labelKey: "skills.column.location", width: "16.1%" },
  { labelKey: "skills.column.updated", width: "10.1%" },
  { labelKey: "skills.column.action", width: "8.5%" },
]

const viewToggleSurface = "flex h-11 gap-1 rounded-full bg-secondary p-1"

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
      : "h-[22px] px-[9px] text-[12px] leading-[15px] font-medium"

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full font-medium ${box} ${tagTone().chip} ${tagTone().label}`}
    >
      {tag}
    </span>
  )
}

/* A quiet chip over a cover: a hairline pill on the canvas colour, so a label
   never competes with the picture underneath it. */
const pillSurface =
  "inline-flex h-5 shrink-0 items-center rounded-full bg-card/95 px-[9px] text-[12px] leading-none font-semibold text-foreground ring-1 ring-border"

function TagPill({ tag }: { tag: string }) {
  return <span className={pillSurface}>{tag}</span>
}

/**
 * What the page can do with one row. A row the library holds offers a menu of
 * the places a workspace keeps skills in, so installing one names its target
 * instead of assuming it; a row a place wrote on its own gets the one action
 * that applies to it, which is sending it into the library. Nothing here
 * deletes a skill the project owns.
 */
function SkillActionButton({
  skill,
  blocked,
  onInstall,
  onAdopt,
  onRemove,
}: {
  skill: Skill
  /** Why no folder can be installed into, ready to show; `null` when one can. */
  blocked: string | null
  onInstall: (dir: string) => void
  onAdopt: () => void
  onRemove: (dir: string) => void
}) {
  const { t } = useI18n()
  /* The places are contributions, so this row offers them itself rather than
     having every list thread them down to it. */
  const contributed = useContributions("skillLocation")
  const places = React.useMemo(
    () => [...contributed].sort((left, right) => left.order - right.order),
    [contributed]
  )
  const holds = holdsOf(skill)
  /* One size for every row action: the design's 32px pill. */
  const shell =
    "h-8 gap-1.5 rounded-full px-3 text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
  /* Installing is the row's own action, so it reads as a soft fill; undoing it
     is what the menu and the detail panel offer, and those read as outlines. */
  const fill = `${shell} bg-secondary text-foreground hover:bg-accent`
  const outline = `${shell} border-border bg-transparent text-secondary-foreground hover:bg-muted hover:text-foreground dark:border-input dark:bg-transparent`

  if (skill.stale) {
    return (
      <Button
        type="button"
        variant="outline"
        aria-label={`${t("skills.action.cleanup")} ${skill.name}`}
        onClick={(event) => {
          event.stopPropagation()
          onRemove(holds[0]?.dir ?? "")
        }}
        className={outline}
      >
        <Trash2Icon className="size-3.5" />
        {t("skills.action.cleanup")}
      </Button>
    )
  }

  /* A skill a place wrote: the library can take it over the same way. */
  if (!inLibrary(skill)) {
    if (skill.inLibrary === true) return null
    return (
      <Button
        type="button"
        variant="outline"
        aria-label={`${t("skills.action.adopt")} ${skill.name}`}
        onClick={(event) => {
          event.stopPropagation()
          onAdopt()
        }}
        className={fill}
      >
        <PlusIcon className="size-3.5" />
        {t("skills.action.adopt")}
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            disabled={blocked !== null || places.length === 0}
            title={blocked ?? undefined}
            /* The word does not change with the row's state: installing into a
               second place is still installing, and the menu says which places
               are taken. */
            aria-label={`${t("skills.action.install")} ${skill.name}`}
            className={fill}
            onClick={(event) => event.stopPropagation()}
          >
            <DownloadIcon className="size-3.5" />
            {t("skills.action.install")}
            <ChevronDownIcon className="size-3" />
          </Button>
        }
      />
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-[240px]"
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("skills.action.installInto")}</DropdownMenuLabel>
          {places.map((place) => {
            const checked = holds.some((hold) => hold.id === place.id)
            const Icon = place.icon
            return (
              <DropdownMenuItem
                key={place.id}
                /* Installing into one place should not dismiss the menu: a card
                   can go to several, and the row that was just taken shows its
                   check in place. */
                closeOnClick={false}
                /* A place holding its own skill of this name cannot take a second. */
                disabled={!checked && skill.takenAt?.includes(place.id) === true}
                onClick={() => (checked ? onRemove(place.dir) : onInstall(place.dir))}
                className="items-start gap-2.5 py-2"
              >
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary ring-1 ring-border ring-inset">
                  <Icon className="size-3.5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[13.5px] leading-[18px] font-semibold">
                    {t(place.labelKey)}
                  </span>
                  <span className="truncate font-mono text-[12px] leading-[16px] text-muted-foreground">
                    {place.dir}
                  </span>
                </span>
                {checked ? <CheckIcon className="mt-1 size-4 shrink-0" /> : null}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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

/** The opening of a skill's file tree, as many rows as the cover has room for. */
const COVER_TREE_ROWS = 4

/**
 * A card with no media shows what the skill ships: `SKILL.md`, the folders
 * beside it, and how much there is. The card body already carries the name and
 * the description, so this is the one thing left that the card cannot say.
 */
function FileTreeCover({ skill, store }: { skill: Skill; store: SkillStore | null }) {
  const { t } = useI18n()
  const { body, files } = useSkillDocument(skill, store)
  const rows = files.slice(0, COVER_TREE_ROWS)
  const count = t("skills.cover.files").replace("{count}", String(files.length))
  const tokens =
    body === null ? "" : t("skills.cover.tokens").replace("{tokens}", tokenLabel(body))

  return (
    <div
      className={`flex size-full flex-col bg-surface-raised px-[18px] pb-2.5 ${
        /* Room for the tag pills, which sit over this corner; nothing to clear without them. */
        skill.tags.length > 0 ? "pt-10" : "pt-3.5"
      }`}
    >
      {files.length === 0 ? (
        /* Nothing read yet, or nothing to read: the icon says which element is
           empty and the count how much of it there is. A heading and the
           description would only repeat the card body. */
        <span className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 text-muted-foreground">
          <FileTextIcon className="size-[22px]" aria-hidden />
          {body === null ? null : (
            <span className="font-mono text-[12px] leading-[18px]">
              {t("skills.cover.tokens").replace("{tokens}", tokenLabel(body))}
            </span>
          )}
        </span>
      ) : (
        <span className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden font-mono text-[12px] leading-[18px]">
          {rows.map((file) => (
            <span
              key={file.path}
              className={
                file.directory
                  ? "truncate text-secondary-foreground"
                  : "truncate text-muted-foreground"
              }
              style={{ paddingLeft: `${file.depth * 2}ch` }}
            >
              {`${file.path.slice(file.path.lastIndexOf("/") + 1)}${file.directory ? "/" : ""}`}
            </span>
          ))}
        </span>
      )}
      {files.length === 0 ? null : (
        <span className="shrink-0 border-t border-border pt-1.5 font-mono text-[12px] leading-[18px] text-muted-foreground">
          {tokens === "" ? count : `${count} · ${tokens}`}
        </span>
      )}
    </div>
  )
}

/** Ratio a card falls back to before its asset reports one. */
const FALLBACK_RATIO = 16 / 9

/**
 * The marker a row carries when the last check found its source ahead of the
 * files here. Nothing is rendered until a check recorded an answer.
 */
function UpdateBadge({ skill }: { skill: Skill }) {
  const { t } = useI18n()
  const latest = skill.checked?.latest
  if (latest === undefined || skill.upstream === undefined || latest === skill.upstream.hash) {
    return null
  }
  return (
    <span className="shrink-0 text-[11px] leading-[14px] font-semibold text-amber-600 dark:text-amber-400">
      {t("skills.update.badge")}
    </span>
  )
}

function SkillCard({
  skill,
  store,
  blocked,
  onInstall,
  onAdopt,
  onRemove,
  onOpen,
}: {
  skill: Skill
  /** The library behind the catalog, for a cover that reads the document. */
  store: SkillStore | null
  /** Why no folder can be installed into, ready to show; `null` when one can. */
  blocked: string | null
  onInstall: (dir: string) => void
  onAdopt: () => void
  onRemove: (dir: string) => void
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
      role="button"
      tabIndex={0}
      aria-label={skill.name}
      onClick={onOpen}
      onKeyDown={(event) => {
        /* The card holds its own action button, so it cannot be a real button;
           the two keys a button answers to are handled here instead. */
        if (event.key !== "Enter" && event.key !== " ") return
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        onOpen()
      }}
      className="mb-5 cursor-pointer overflow-hidden rounded-xl bg-card ring-1 ring-border transition-shadow break-inside-avoid outline-none hover:shadow-soft focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div
        className="relative w-full overflow-hidden bg-surface-raised"
        style={{ aspectRatio: ratio ?? FALLBACK_RATIO }}
      >
        {media === undefined ? (
          <FileTreeCover skill={skill} store={store} />
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
            <span className={`${pillSurface} text-muted-foreground`}>+{extraTags}</span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2.5 px-[18px] pt-4 pb-[18px]">
        <div className="flex h-[19px] items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-mono text-[14px] leading-[19px] font-semibold">
              {skill.name}
            </span>
            <UpdateBadge skill={skill} />
          </span>
          {/* A skill the hub does not hold has no recorded age; nothing goes here. */}
          {skill.updated === "" ? null : (
            <span className="shrink-0 text-[12px] leading-[15px] text-muted-soft">
              {skill.updated}
            </span>
          )}
        </div>
        <p className="line-clamp-2 text-[13px] leading-[18px] text-copy">
          {skill.description}
        </p>
        <div className="flex items-center justify-between gap-2">
          <ProvenanceLine skill={skill} />
          <SkillActionButton
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

/**
 * The content area when there is nothing to show. Each case answers a different
 * question — no skills at all, none in this place, none matching the filters —
 * so each gets its own words and its own one way forward. The toolbar and the
 * filters stay where they are; only the content area changes.
 */
function EmptyState({
  icon: Icon,
  title,
  hint,
  note,
  action,
  secondary,
}: {
  icon: LucideIcon
  title: string
  hint: string
  /** A path or an errno, printed as data rather than as a sentence. */
  note?: string | null
  /** The one way forward from this state; omitted by a state that has none. */
  action?: React.ReactNode
  secondary?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-secondary">
        <Icon className="size-5 text-muted-foreground" aria-hidden />
      </span>
      <span className="text-[15px] leading-[20px] font-semibold">{title}</span>
      <span className="max-w-[420px] text-[13px] leading-[18px] text-muted-foreground">
        {hint}
      </span>
      {note === undefined || note === null || note === "" ? null : (
        <span className="max-w-[520px] truncate font-mono text-[12px] text-muted-foreground">
          {note}
        </span>
      )}
      {action === undefined && secondary === undefined ? null : (
        <div className="mt-1 flex items-center gap-2">
          {action}
          {secondary}
        </div>
      )}
    </div>
  )
}

/**
 * What the grid looks like while the library is being read. Cards, not a
 * spinner: a spinner is about as tall as its own line, so the content area
 * jumps from nothing to full height the moment the answer lands.
 */
function GridSkeleton() {
  const covers = [292, 342, 276, 342, 292, 276, 292, 342]

  return (
    <div className="@container">
      <div className="columns-1 gap-x-6 @min-[556px]:columns-2 @min-[846px]:columns-3 @min-[1136px]:columns-4">
        {covers.map((height, index) => (
          <div
            key={index}
            className="mb-5 break-inside-avoid overflow-hidden rounded-xl bg-card ring-1 ring-border"
          >
            <div className="w-full animate-pulse bg-muted" style={{ height }} />
            <div className="flex flex-col gap-2 px-[18px] py-3.5">
              <span className="h-4 w-1/2 animate-pulse rounded-full bg-muted" />
              <span className="h-3 w-5/6 animate-pulse rounded-full bg-muted" />
              <span className="h-3 w-2/3 animate-pulse rounded-full bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SkillGrid({
  skills,
  store,
  blocked,
  onInstall,
  onAdopt,
  onRemove,
  onOpen,
}: {
  skills: Skill[]
  /** The library behind the catalog, for covers that read the document. */
  store: SkillStore | null
  /** Why no folder can be installed into, ready to show; `null` when one can. */
  blocked: string | null
  onInstall: (skill: Skill, dir: string) => void
  onAdopt: (skill: Skill) => void
  onRemove: (skill: Skill, dir: string) => void
  onOpen: (skill: Skill) => void
}) {
  /*
   * Masonry with a responsive column count, capped at five so a wide window
   * does not keep adding columns. A column needs a 266px card plus the 24px
   * gutter, so each step is 290n - 24; container queries, so the sidebar
   * width does not shift them.
   */
  return (
    <div className="@container">
      <div className="columns-1 gap-x-6 @min-[556px]:columns-2 @min-[846px]:columns-3 @min-[1136px]:columns-4 @min-[1426px]:columns-5">
        {skills.map((skill) => (
          <SkillCard
            key={skillKey(skill)}
            skill={skill}
            store={store}
            blocked={blocked}
            onInstall={(dir) => onInstall(skill, dir)}
            onAdopt={() => onAdopt(skill)}
            onRemove={(dir) => onRemove(skill, dir)}
            onOpen={() => onOpen(skill)}
          />
        ))}
      </div>
    </div>
  )
}

/** The mark a row shows when it has no picture: the document itself. */
function SkillThumb({ skill }: { skill: Skill }) {
  const media = cardMedia(skill)

  if (media?.kind === "video") {
    return (
      <AutoplayVideo
        src={media.src}
        className="size-9 shrink-0 rounded-[12px] object-cover"
      />
    )
  }

  if (media !== undefined) {
    return (
      <img
        src={media.src}
        alt=""
        className="size-9 shrink-0 rounded-[12px] object-cover"
      />
    )
  }

  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-surface-raised">
      <FileTextIcon className="size-4 text-foreground" aria-hidden />
    </span>
  )
}

/**
 * The query's own characters, marked in the accent. Only the table marks them:
 * its rows all look alike, so without the mark there is no way to see which
 * words matched. A card is big enough to read on its own, and marking twelve
 * of them at once turns the grid into a pattern.
 */
function Highlighted({ text, needle }: { text: string; needle: string }) {
  const at = needle === "" ? -1 : text.toLowerCase().indexOf(needle.toLowerCase())
  if (at < 0) return <>{text}</>

  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-transparent font-semibold text-primary">
        {text.slice(at, at + needle.length)}
      </mark>
      {text.slice(at + needle.length)}
    </>
  )
}

/* The batch strip heads the table whether or not a row is ticked: the action
   has to be visible to be discoverable, and a bar that comes and goes shifts
   the rows under the pointer that just ticked one. */
function BulkBar({
  count,
  blocked,
  onInstall,
  onClear,
}: {
  count: number
  /** Why no folder can be installed into, ready to show; `null` when one can. */
  blocked: string | null
  onInstall: (dir: string) => void
  onClear: () => void
}) {
  const { t } = useI18n()
  const contributed = useContributions("skillLocation")
  const places = React.useMemo(
    () => [...contributed].sort((left, right) => left.order - right.order),
    [contributed]
  )

  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface-raised px-5">
      <span className="flex h-7 items-center rounded-full bg-foreground px-3 text-[12.5px] font-semibold text-background">
        {t("skills.batch.selected").replace("{count}", String(count))}
      </span>
      <Button
        type="button"
        variant="outline"
        disabled={count === 0}
        onClick={onClear}
        className="ml-auto h-[34px] rounded-full border-border bg-transparent px-4 text-[13px] font-semibold dark:border-input dark:bg-transparent"
      >
        {t("skills.batch.clear")}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              disabled={count === 0 || blocked !== null || places.length === 0}
              title={blocked ?? undefined}
              className="h-[34px] gap-1.5 rounded-full px-4 text-[13px] font-semibold"
            >
              {t("skills.action.installInto")}
              <ChevronDownIcon className="size-3.5" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" sideOffset={6} className="w-[240px]">
          <DropdownMenuGroup>
            {places.map((place) => {
              const Icon = place.icon
              return (
                <DropdownMenuItem
                  key={place.id}
                  onClick={() => onInstall(place.dir)}
                  className="items-start gap-2.5 py-2"
                >
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary ring-1 ring-border ring-inset">
                    <Icon className="size-3.5" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[13.5px] leading-[18px] font-semibold">
                      {t(place.labelKey)}
                    </span>
                    <span className="truncate font-mono text-[12px] leading-[16px] text-muted-foreground">
                      {place.dir}
                    </span>
                  </span>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function SkillTable({
  skills,
  needle,
  checked,
  onCheck,
  blocked,
  onInstall,
  onAdopt,
  onRemove,
  onOpen,
}: {
  skills: Skill[]
  /** What the filter box holds, marked in the fields it matched. */
  needle: string
  /** Keys of the rows ticked for a batch action. */
  checked: readonly string[]
  onCheck: (keys: string[]) => void
  /** Why no folder can be installed into, ready to show; `null` when one can. */
  blocked: string | null
  onInstall: (skill: Skill, dir: string) => void
  onAdopt: (skill: Skill) => void
  onRemove: (skill: Skill, dir: string) => void
  onOpen: (skill: Skill) => void
}) {
  const { t } = useI18n()

  const keys = skills.map(skillKey)
  const allChecked = keys.length > 0 && keys.every((key) => checked.includes(key))
  const someChecked = checked.length > 0 && !allChecked

  const toggle = (skill: Skill, next: boolean) => {
    const key = skillKey(skill)
    onCheck(next ? [...checked, key] : checked.filter((item) => item !== key))
  }

  return (
    <Card className={`${cardSurface} gap-0 overflow-hidden py-0`}>
      <BulkBar
        count={checked.length}
        blocked={blocked}
        onInstall={(dir) => {
          for (const skill of skills) {
            if (checked.includes(skillKey(skill))) onInstall(skill, dir)
          }
          onCheck([])
        }}
        onClear={() => onCheck([])}
      />
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="h-11 border-b border-border hover:bg-transparent">
            {columns.map((column, index) => (
              <TableHead
                key={column.labelKey || index}
                style={{ width: column.width }}
                className={
                  index === 0
                    ? "p-0 pl-5"
                    : index === columns.length - 1
                      ? "p-0 pr-5 pl-3.5 text-[12px] font-semibold text-muted-soft"
                      : "p-0 pl-3.5 text-[12px] font-semibold text-muted-soft"
                }
              >
                {/* The head takes the whole page's rows at once; a page that is
                    only partly ticked shows the dash rather than a check. */}
                {index === 0 ? (
                  <Checkbox
                    checked={allChecked}
                    indeterminate={someChecked}
                    onCheckedChange={(next) => onCheck(next === true ? keys : [])}
                    aria-label={t("skills.table.selectAll")}
                    className="size-[18px] rounded-[4px]"
                  />
                ) : (
                  t(column.labelKey)
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {skills.map((skill) => (
            <TableRow
              key={skillKey(skill)}
              tabIndex={0}
              onClick={() => onOpen(skill)}
              /* A row is not a button, so it answers the two keys a button
                 would rather than pretending to be one. */
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return
                if (event.target !== event.currentTarget) return
                event.preventDefault()
                onOpen(skill)
              }}
              className="h-[66px] cursor-pointer border-b border-border outline-none last:border-b-0 hover:bg-accent/40 focus-visible:bg-accent/40"
            >
              <TableCell onClick={(event) => event.stopPropagation()} className="p-0 pl-5">
                <Checkbox
                  checked={checked.includes(skillKey(skill))}
                  onCheckedChange={(next) => toggle(skill, next === true)}
                  aria-label={`${t("skills.table.select")} ${skill.name}`}
                  className="size-[18px] rounded-[4px]"
                />
              </TableCell>
              <TableCell className="p-0 pl-3.5">
                <div className="flex items-center gap-3">
                  <SkillThumb skill={skill} />
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[14px] leading-[18px] font-semibold">
                        <Highlighted text={skill.name} needle={needle} />
                      </span>
                      <UpdateBadge skill={skill} />
                    </span>
                    <span className="truncate text-[12px] leading-[17px] text-muted-foreground">
                      <Highlighted text={skill.description} needle={needle} />
                    </span>
                  </div>
                </div>
              </TableCell>
              <TableCell className="p-0 pl-3.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {skill.tags.map((tag) => (
                    <TagChip key={tag} tag={tag} size="md" />
                  ))}
                </div>
              </TableCell>
              <TableCell className="p-0 pl-3.5">
                <ProvenanceLine skill={skill} />
              </TableCell>
              <TableCell className="p-0 pl-3.5 text-[13px] text-muted-foreground">
                {skill.updated}
              </TableCell>
              <TableCell className="p-0 pr-5 pl-3.5">
                <SkillActionButton
                  skill={skill}
                  blocked={blocked}
                  onInstall={(dir) => onInstall(skill, dir)}
                  onAdopt={() => onAdopt(skill)}
                  onRemove={(dir) => onRemove(skill, dir)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}

/** The page's own heading; the design sets its one display size to weight 400. */
function PageHeading() {
  const { t } = useI18n()

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-display font-normal text-foreground">{t("skills.title")}</h1>
      <p className="text-[length:var(--text-body)] text-muted-foreground">
        {t("skills.description")}
      </p>
    </div>
  )
}

/** A value that follows its input once typing stops, not on every keystroke. */
function useSettled(value: string, delay = 180) {
  const [settled, setSettled] = React.useState(value)

  React.useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])

  return settled
}

const chipPill =
  "flex h-8 shrink-0 items-center justify-center rounded-full px-3.5 text-[length:var(--text-caption)] transition-colors"

/**
 * The query box and the category chips, which narrow the same list and so
 * share one row. Typing is the page's filter; the toolbar's Explore button is
 * the other, remote, verb.
 */
function FilterRow({
  query,
  onQueryChange,
  tag,
  onTagChange,
  options,
}: {
  /** What the box holds right now, before the query settles. */
  query: string
  onQueryChange: (query: string) => void
  /** Selected category filter, or "All tags". */
  tag: string
  onTagChange: (tag: string) => void
  /** The categories on offer, from the library or the bundle. */
  options: readonly string[]
}) {
  const { t } = useI18n()
  const [expanded, setExpanded] = React.useState(false)
  const field = React.useRef<HTMLInputElement>(null)
  const visible = expanded ? options : options.slice(0, 4)

  /* The shortcut the box prints, so the key it names does focus it. */
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return
      const active = document.activeElement
      if (
        active instanceof HTMLElement &&
        (active.isContentEditable || active.tagName === "INPUT" || active.tagName === "TEXTAREA")
      ) {
        return
      }
      event.preventDefault()
      field.current?.focus()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex h-11 w-[300px] shrink-0 items-center gap-2 rounded-md border border-border px-3.5 focus-within:border-primary">
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
        <input
          ref={field}
          value={query}
          aria-label={t("skills.filter.placeholder")}
          placeholder={t("skills.filter.placeholder")}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || query === "") return
            event.preventDefault()
            onQueryChange("")
          }}
          className="min-w-0 flex-1 bg-transparent text-[length:var(--text-body)] outline-none placeholder:text-muted-foreground/70"
        />
        {query === "" ? (
          <Kbd className="shrink-0 border-0 bg-transparent text-muted-foreground">/</Kbd>
        ) : (
          <button
            type="button"
            aria-label={t("skills.filter.clear")}
            onClick={() => onQueryChange("")}
            className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={tag === "All tags"}
          onClick={() => onTagChange("All tags")}
          className={`${chipPill} ${
            tag === "All tags"
              ? "bg-foreground font-semibold text-background"
              : "bg-secondary text-foreground hover:bg-accent"
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
            className={`${chipPill} ${
              tag === item
                ? "bg-foreground font-semibold text-background"
                : "bg-secondary text-foreground hover:bg-accent"
            }`}
          >
            {item}
          </button>
        ))}
        {expanded || options.length <= visible.length ? null : (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className={`${chipPill} bg-secondary text-muted-foreground hover:bg-accent`}
          >
            +{options.length - visible.length}
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
      className={`flex h-9 w-11 items-center justify-center rounded-full transition-colors ${
        active
          ? "bg-foreground text-background dark:bg-accent dark:text-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="size-4" />
    </button>
  )
}

export function SkillsPage() {
  const { t } = useI18n()
  /* A tab a person chose, remembered with the agent that was in use when they
     chose it: switching agents in the sidebar means "work on this one", so the
     page opens on that agent's place until the next manual switch. */
  const [picked, setPicked] = React.useState<{ tab: SkillTab; agent: string | null } | null>(
    null
  )
  const [view, setView] = React.useState<"grid" | "list">("grid")
  const [addTab, setAddTab] = React.useState<AddSkillTab | null>(null)
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [tag, setTag] = React.useState("All tags")
  /* Typing narrows the same list the category chips do; it is not a new view. */
  const [query, setQuery] = React.useState("")
  const needle = useSettled(query)
  /* Ticked rows, by key. Narrowing the list drops them: a batch action names
     what the person can still see. */
  const [checked, setChecked] = React.useState<readonly string[]>([])
  const [page, setPage] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(12)
  /* Why the last action did not go through. A success says nothing: the row it
     changed already shows the result. */
  const [refusal, setRefusal] = React.useState<string | null>(null)
  /* A batch check clones every recorded source; the toolbar says it is busy. */
  const [checking, setChecking] = React.useState(false)
  /* The open lightbox is a row key, because the same id can be two rows. */
  const [detailKey, setDetailKey] = React.useState<string | null>(null)

  /* The places a workspace keeps skills in arrive as contributions, so one
     agent integration adds its own tab and install target without this page
     knowing it by name. */
  const locationContributions = useContributions("skillLocation")
  const places = React.useMemo(
    () => [...locationContributions].sort((left, right) => left.order - right.order),
    [locationContributions]
  )
  const placeSpecs = React.useMemo(
    () => places.map((place) => ({ id: place.id, labelKey: place.labelKey, dir: place.dir })),
    [places]
  )

  const library = useSkillLibrary(placeSpecs, needle)
  /* The chosen agent is an integration, and what it names is a place; only a
     place this build knows is something to open on. */
  const target = useContributions("target").find((entry) => entry.id === library.agent)
  const agentPlace =
    target?.skillLocation !== undefined &&
    places.some((place) => place.id === target.skillLocation)
      ? target.skillLocation
      : null
  /* A registry plugin answers the search; with none the dialog says so. */
  const registries = useContributions("skillRegistry")
  const registry = registries[0] ?? null
  const tabs = React.useMemo(
    () => [
      ...SHELL_TABS,
      ...places.map((place) => ({
        value: place.id,
        labelKey: place.labelKey,
        icon: place.icon,
      })),
    ],
    [places]
  )

  /* The page filters and pages what the hook hands it: rows come from the
     library and the places both, and only the library has a server page. */
  const rows = library.rows

  const offered = React.useMemo(() => {
    if (needle === "") return rows
    const text = needle.toLowerCase()
    return rows.filter((row) => matchesQuery(row, text))
  }, [rows, needle])

  /* An agent's place is the page's landing screen while it holds something;
     opening on one that holds nothing shows an empty screen and hides every
     skill behind a tab, which is what a fresh load must not do. The query and
     the category do not move the landing screen, so typing cannot land the
     page on a different tab mid-word. */
  const landing: SkillTab =
    agentPlace !== null && rowsForTab(rows, agentPlace).length > 0 ? agentPlace : "all"
  const tab: SkillTab =
    picked !== null && picked.agent === library.agent ? picked.tab : landing
  const setTab = (value: SkillTab) => setPicked({ tab: value, agent: library.agent })

  const currentPlace = library.places.find((place) => place.id === tab) ?? null
  /* With no folder to install into, the action says why it is unavailable. */
  const blocked =
    library.workspaceId === null
      ? t("skills.workspace.none")
      : tab !== "all" && tab !== "library" && currentPlace?.view === null
        ? t("skills.workspace.noPath")
        : null

  const onTag = React.useMemo(
    () => (tag === "All tags" ? offered : offered.filter((row) => row.tags.includes(tag))),
    [offered, tag]
  )

  /* Counts describe what the query and the category left behind, so a tab that
     holds nothing says so before it is opened. */
  const counts = React.useMemo(
    () =>
      Object.fromEntries(
        tabs.map((item) => [item.value, rowsForTab(onTag, item.value).length])
      ),
    [tabs, onTag]
  )

  const matching = React.useMemo(() => rowsForTab(onTag, tab), [onTag, tab])

  /* A filter, an agent switch, or a shorter list can leave the page past the
     end; the page shown is clamped rather than an empty stretch of rows. */
  const pageCount = Math.max(1, Math.ceil(matching.length / pageSize))
  const shownPage = Math.min(page, pageCount - 1)

  const skills = React.useMemo(
    () => matching.slice(shownPage * pageSize, (shownPage + 1) * pageSize),
    [matching, shownPage, pageSize]
  )

  const detail = matching.find((skill) => skillKey(skill) === detailKey) ?? null

  /** Apply a change, then re-read the page so the list shows what was stored. */
  const applyTo = async (persist: () => Promise<unknown>) => {
    await persist()
    await library.reload()
  }

  /** Why an action did not go through, ready to show. */
  const reasonOf = (failure: unknown) => (failure instanceof Error ? failure.message : String(failure))

  const install = async (skill: Skill, dir?: string) => {
    try {
      await library.install(skill.id, dir)
      setRefusal(null)
    } catch (failure) {
      setRefusal(reasonOf(failure))
    }
  }

  /** Ask every recorded source; the badges that change are the report. A
      source that could not be read is named, since nothing else would say so. */
  const checkAll = async () => {
    setChecking(true)
    try {
      const summary = await library.checkAll()
      setRefusal(
        summary.failed.length === 0
          ? null
          : summary.failed
              .map((entry) => `${entry.name}: ${entry.reason}`)
              .join(" · ")
      )
    } catch (failure) {
      setRefusal(reasonOf(failure))
    } finally {
      setChecking(false)
    }
  }

  /** Take back the link that put a skill in a place as well as the library. */
  const uninstall = async (skill: Skill, dir?: string) => {
    try {
      if (skill.linkAt === "library") {
        /* The library linked the skill in; removing its entry takes the link. */
        await (library.store?.remove(skill.id) ?? Promise.resolve())
        await library.reload()
      } else {
        await library.remove(skill.id, dir)
      }
      setRefusal(null)
    } catch (failure) {
      setRefusal(reasonOf(failure))
    }
  }

  /** Link a skill a place wrote into the library. */
  const adopt = async (skill: Skill, dir?: string) => {
    try {
      await library.adopt(skill.id, dir)
      setRefusal(null)
    } catch (failure) {
      setRefusal(reasonOf(failure))
    }
  }

  const setTags = (skill: Skill, tags: string[]) =>
    void applyTo(() => library.store?.update(skill.id, { tags }) ?? Promise.resolve())

  /** Delete the skill, then close the lightbox it was open in. */
  const removeSkill = async (skill: Skill) => {
    await (library.store?.remove(skill.id) ?? Promise.resolve())
    await library.reload()
    setDetailKey(null)
  }

  /** Delete a skill from the place that holds it, then close the lightbox. */
  const removeWorkspaceSkill = async (skill: Skill, dir: string) => {
    await library.deleteWorkspaceSkill(skill.id, dir)
    setDetailKey(null)
  }
  const openDetail = (skill: Skill) => setDetailKey(skillKey(skill))

  const pagination = (
    <TablePagination
      pageText={`${shownPage + 1} / ${pageCount}`}
      label={t("pager.rowsPerPage")}
      pageSize={pageSize}
      canPrev={shownPage > 0}
      canNext={shownPage + 1 < pageCount}
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
    <div className="flex flex-1 flex-col gap-8">
      <PageHeading />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(tabs.find((item) => item.value === value)?.value ?? "all")
          setPage(0)
          setChecked([])
        }}
        className="flex-1 gap-8"
      >
        <div className="flex items-center justify-between gap-6">
          <TabsList className="h-11! gap-1 rounded-full bg-secondary p-1">
            {tabs.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className="h-9 flex-none gap-1.5 rounded-full px-4 text-[length:var(--text-body)] text-muted-foreground data-active:bg-foreground data-active:text-background data-active:hover:text-background dark:data-active:bg-accent dark:data-active:text-foreground"
              >
                <item.icon className="size-3.5 shrink-0" aria-hidden />
                {t(item.labelKey)}
                <span
                  className={`text-[13px] ${
                    library.error !== null
                      ? "opacity-45"
                      : (counts[item.value] ?? 0) === 0
                        ? "opacity-45"
                        : ""
                  }`}
                >
                  {library.error === null ? (counts[item.value] ?? 0) : "—"}
                </span>
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
              disabled={checking}
              className="h-9 gap-2 rounded-full border-border bg-transparent px-4"
              onClick={() => void checkAll()}
            >
              <RefreshCwIcon className={checking ? "animate-spin" : undefined} />
              {checking ? t("skills.update.checkingAll") : t("skills.update.checkAll")}
            </Button>
            <Button
              variant="outline"
              className="h-9 gap-2 rounded-full border-border bg-transparent px-4 dark:border-input dark:bg-transparent"
              onClick={() => setAddTab("local")}
            >
              <UploadIcon />
              {t("skills.action.import")}
            </Button>
            <Button className="h-9 gap-2 rounded-full px-4" onClick={() => setSearchOpen(true)}>
              <CompassIcon />
              {t("skills.action.explore")}
            </Button>
          </div>
        </div>
        <FilterRow
          query={query}
          onQueryChange={(next) => {
            setQuery(next)
            setChecked([])
          }}
          tag={tag}
          onTagChange={(next) => {
            setTag(next)
            setChecked([])
          }}
          options={library.tags}
        />
        {refusal === null ? null : (
          <span className="text-xs leading-[15px] text-destructive">{refusal}</span>
        )}
        <TabsContent value={tab} className="flex flex-col gap-6">
          {library.store === null ? (
            /* No library at all is a different answer from an empty one: the
               rows would have to be invented, and an invented catalog is worse
               than saying where the real one lives. */
            <EmptyState
              icon={TriangleAlertIcon}
              title={t("skills.empty.noLibrary")}
              hint={t("skills.empty.noLibraryHint")}
            />
          ) : library.loading ? (
            <GridSkeleton />
          ) : library.error !== null ? (
            /* A read that failed says what failed and leaves the last answer
               standing: an error is not a reason to lose the list. */
            <EmptyState
              icon={TriangleAlertIcon}
              title={t("skills.failed.title")}
              hint={t("skills.failed.hint")}
              note={library.error}
              action={
                <Button className="h-10 rounded-full px-4" onClick={() => void library.reload()}>
                  {t("skills.retry")}
                </Button>
              }
            />
          ) : skills.length === 0 ? (
            needle !== "" ? (
              /* The filters, not the library: saying "no skills yet" here would
                 be a lie about a library that may hold plenty. */
              <EmptyState
                icon={SearchXIcon}
                title={t("skills.empty.filter")}
                hint={t("skills.empty.filterHint").replace("{query}", needle)}
                action={
                  <Button
                    className="h-10 rounded-full px-4"
                    onClick={() => {
                      setQuery("")
                      setTag("All tags")
                    }}
                  >
                    {t("skills.filter.reset")}
                  </Button>
                }
                secondary={
                  <Button
                    variant="outline"
                    className="h-10 rounded-full border-border bg-transparent px-4 dark:border-input dark:bg-transparent"
                    onClick={() => setSearchOpen(true)}
                  >
                    <CompassIcon />
                    {t("skills.action.exploreRemote")}
                  </Button>
                }
              />
            ) : currentPlace !== null ? (
              <EmptyState
                icon={FolderOpenIcon}
                title={
                  library.workspaceId === null
                    ? t("skills.workspace.none")
                    : currentPlace.view === null
                      ? t("skills.workspace.noPath")
                      : t("skills.workspace.empty")
                }
                hint={t("skills.workspace.emptyHint")}
                note={currentPlace.view?.display ?? null}
                action={
                  <Button className="h-10 rounded-full px-4" onClick={() => setTab("all")}>
                    {t("skills.tab.all")}
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={FolderPlusIcon}
                title={t("skills.empty.library")}
                hint={t("skills.empty.libraryHint")}
                note={library.root}
                action={
                  <Button
                    className="h-10 rounded-full px-4"
                    onClick={() => setAddTab("local")}
                  >
                    <FolderPlusIcon />
                    {t("skills.action.importFolder")}
                  </Button>
                }
                secondary={
                  <Button
                    variant="outline"
                    className="h-10 rounded-full border-border bg-transparent px-4 dark:border-input dark:bg-transparent"
                    onClick={() => setSearchOpen(true)}
                  >
                    <CompassIcon />
                    {t("skills.action.exploreRemote")}
                  </Button>
                }
              />
            )
          ) : view === "grid" ? (
            <SkillGrid
              skills={skills}
              store={library.store}
              blocked={blocked}
              onInstall={install}
              onAdopt={adopt}
              onRemove={uninstall}
              onOpen={openDetail}
            />
          ) : (
            <SkillTable
              skills={skills}
              needle={needle}
              checked={checked}
              onCheck={setChecked}
              blocked={blocked}
              onInstall={install}
              onAdopt={adopt}
              onRemove={uninstall}
              onOpen={openDetail}
            />
          )}
          {/* The page's own footer, not a strip inside whichever view is open:
              it reads the whole filtered set, so switching views leaves it
              where it is. `mt-auto` holds it at the foot of the content while
              the list is short, and lets it follow the list once it is long. */}
          {skills.length === 0 ? null : (
            <div className="mt-auto flex h-9 shrink-0 items-center justify-between gap-4">
              <span className="text-[13px] text-muted-foreground">
                {t("skills.footer.count")
                  .replace("{shown}", String(skills.length))
                  .replace("{total}", String(matching.length))}
              </span>
              {pagination}
            </div>
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
      <SearchSkillsDialog
        open={searchOpen}
        store={library.store}
        registry={registry}
        onOpenChange={setSearchOpen}
        onInstalled={() => void library.reload()}
      />
      <SkillDetailDialog
        skill={detail}
        store={library.store}
        root={library.root}
        places={library.places}
        reason={
          blocked ??
          (detail !== null && (detail.takenAt?.length ?? 0) > 0
            ? t("skills.workspace.taken")
            : null)
        }
        onInstallPlace={(skill, dir) => void install(skill, dir)}
        onRemovePlace={(skill, dir) => void uninstall(skill, dir)}
        onAdopt={(skill) => void adopt(skill, holdsOf(skill)[0]?.dir)}
        onDelete={removeSkill}
        onDeleteWorkspace={removeWorkspaceSkill}
        onCheckUpdate={(skill) => library.checkUpdate(skill.id)}
        onUpdate={(skill) => library.update(skill.id)}
        onTagsChange={(tags) => {
          if (detail) setTags(detail, tags)
        }}
        onChanged={() => void library.reload()}
        onOpenChange={(open) => {
          if (!open) setDetailKey(null)
        }}
      />
    </div>
  )
}
