import {
  ChevronDownIcon,
  CircleArrowUpIcon,
  CompassIcon,
  ContainerIcon,
  DownloadIcon,
  FileTextIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  GlobeIcon,
  InboxIcon,
  LayoutGridIcon,
  LibraryIcon,
  ListIcon,
  PackagePlusIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchXIcon,
  TriangleAlertIcon,
  Trash2Icon,
  UploadIcon,
  type LucideIcon,
} from "lucide-react"
import * as React from "react"

import { AddSkillDialog, type AddSkillTab } from "./add-skill-dialog.tsx"
import { holdsOf, inLibrary, modified, nameTakenAt, outdated, placePath, placedIn, selectedSkillPlace, skillHeldAt, skillKey, skillPlaceKey, unstored, useReadablePlaces, useSelectablePlaces, useSkillDisplayPlaces, useSkillLibrary } from "./library.ts"
import { ProvenanceLine } from "./provenance-line.tsx"
import { SkillDetailDialog } from "./skill-detail-dialog.tsx"
import type { SkillPlace } from "./provider.ts"
import { tagTone } from "./tags.ts"
import type { SkillPlaceRef } from "./store.ts"
import type { Skill } from "./types.ts"

import { useI18n, useSearchPage, useSettings } from "@context-hub/extensions/react"
import type { AssetScope, ExtensionIcon } from "@context-hub/extensions"
import {
  AutoplayVideo,
  knownAspect,
  mediaKind,
  rememberAspect,
  ActionTab,
  FilterBar,
  Highlighted,
  Ledger,
  PageBody,
  PlaceMenu,
  ResourceMasonry,
  TagEditor,
  TablePagination,
  type LedgerColumn,
  type PlaceWords,
} from "@context-hub/extensions/components"
import { Button } from "@context-hub/shadcn-ui/components/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@context-hub/shadcn-ui/components/dropdown-menu"
import { toast } from "@context-hub/shadcn-ui/components/toast"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@context-hub/shadcn-ui/components/tabs"

/** The two scopes, in the order a list of places reads them. */
const SCOPES: readonly AssetScope[] = ["workspace", "global"]

/* The remaining location choices share one menu beside these tabs. */
const SHELL_TABS: { value: SkillTab; labelKey: string; icon: ExtensionIcon }[] = [
  { value: "all", labelKey: "skills.tab.all", icon: LayoutGridIcon },
  { value: "library", labelKey: "skills.tab.library", icon: LibraryIcon },
  { value: "unstored", labelKey: "skills.tab.unstored", icon: InboxIcon },
  { value: "updates", labelKey: "skills.tab.updates", icon: CircleArrowUpIcon },
]

/** Which rows a tab shows. */
type SkillTab = "all" | "library" | "unstored" | "updates" | "place"

/** Which rows one tab holds, before the category filter. A place narrows a
    scope to that one place; the shell's own tabs have no places to narrow. */
function rowsForTab(rows: Skill[], value: SkillTab, place: SkillPlace | null): Skill[] {
  if (value === "all") return rows
  if (value === "library") return rows.filter(inLibrary)
  if (value === "unstored") return rows.filter(unstored)
  if (value === "updates") return rows.filter(outdated)
  return place === null ? [] : rows.filter((row) => skillHeldAt(row, place))
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

/**
 * The words every place list on this page draws, resolved in the active locale.
 * The lists themselves know no keys: a module hands them the strings it owns.
 *
 * @param t — the active locale's lookup.
 * @returns the strings a place menu and a list of places draw.
 */
function placeWords(t: (key: string) => string): PlaceWords {
  return {
    search: t("skills.place.search"),
    searchClear: t("skills.place.searchClear"),
    searchEmpty: t("skills.place.searchEmpty"),
    count: (total) => t("skills.location.count").replace("{count}", String(total)),
  }
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
  /** Why a workspace place cannot be written, ready to show; `null` when one can. */
  blocked: string | null
  onInstall: (ref: SkillPlaceRef) => void
  onAdopt: (ref: SkillPlaceRef) => void
  onRemove: (ref: SkillPlaceRef) => void
}) {
  const { t } = useI18n()
  /* Targets exclude the shared read-only choice. */
  const places = useSkillDisplayPlaces(useSelectablePlaces())
  const holds = placedIn(skill)
  /* A machine-wide place needs no workspace, so only the workspace ones depend
     on there being a folder to write into. */
  const writable = places.filter((place) => place.scope !== "workspace" || blocked === null)
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
          const hold = holds[0]
          if (hold !== undefined) onRemove({ scope: hold.scope, dir: hold.dir })
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
    return (
      <Button
        type="button"
        variant="outline"
        aria-label={`${t("skills.action.adopt")} ${skill.name}`}
        onClick={(event) => {
          event.stopPropagation()
          const hold = holds[0]
          if (hold !== undefined) onAdopt({ scope: hold.scope, dir: hold.dir })
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
            disabled={writable.length === 0}
            title={writable.length === 0 ? (blocked ?? undefined) : undefined}
            /* The word does not change with the row's state: installing into a
               second place is still installing, and the menu ticks the places
               that already have it. */
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
      <PlaceMenu
        title={t("skills.action.installInto")}
        words={placeWords(t)}
        closeOnClick={false}
        groups={SCOPES.map((scope) => ({
          label: t(`skills.group.${scope}`),
          options: writable
            .filter((place) => place.scope === scope)
            .map((place) => ({
              id: place.id,
              icon: place.icon,
              label: t(place.labelKey),
              where: placePath(place),
              selected: holds.some((hold) => hold.id === place.id),
              blocked: place.scope === "workspace" ? blocked : null,
            })),
        })).filter((group) => group.options.length > 0)}
        onPick={(id) => {
          const place = writable.find((entry) => entry.id === id)
          if (place === undefined) return
          const ref = { scope: place.scope, dir: place.dir }
          if (holds.some((hold) => hold.id === place.id)) onRemove(ref)
          else onInstall(ref)
        }}
      />
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

/** Ratio a card falls back to before its asset reports one. */
const FALLBACK_RATIO = 16 / 9

/**
 * The asset a card shows: the first picture when it is a video, else the cover,
 * else the first picture. `undefined` means the card has no media.
 *
 * A video is not drawn still — a card hands it to a preview that plays it — so
 * which kind it is decides which of the two the card uses.
 */
function cardMedia(skill: Skill): { kind: "image" | "video"; src: string } | undefined {
  const first = skill.gallery?.[0]
  if (first !== undefined && mediaKind(first) === "video") {
    return { kind: "video", src: first }
  }
  const src = skill.cover ?? first
  return src === undefined ? undefined : { kind: mediaKind(src), src }
}

/**
 * The markers a row carries for what the last check found: the source is ahead
 * of the files here, the files were changed after the install, or both. Nothing
 * is rendered until a check recorded an answer.
 */
function CheckBadge({ skill }: { skill: Skill }) {
  const { t } = useI18n()
  const marks: string[] = []
  if (outdated(skill)) marks.push(t("skills.update.badge"))
  if (modified(skill)) marks.push(t("skills.update.editedBadge"))
  if (marks.length === 0) return null
  return (
    <span className="shrink-0 text-[11px] leading-[14px] font-semibold text-amber-600 dark:text-amber-400">
      {marks.join(" · ")}
    </span>
  )
}

function SkillCard({
  skill,
  blocked,
  tagSuggestions,
  onTagsChange,
  onInstall,
  onAdopt,
  onRemove,
  onOpen,
}: {
  skill: Skill
  /** Why no folder can be installed into, ready to show; `null` when one can. */
  blocked: string | null
  tagSuggestions: string[]
  onTagsChange: (tags: string[]) => Promise<void>
  onInstall: (ref: SkillPlaceRef) => void
  onAdopt: (ref: SkillPlaceRef) => void
  onRemove: (ref: SkillPlaceRef) => void
  onOpen: () => void
}) {
  const { t } = useI18n()
  const [savingTags, setSavingTags] = React.useState(false)
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
      className="w-full min-w-0 cursor-pointer overflow-hidden rounded-xl bg-card ring-1 ring-border transition-shadow outline-none hover:shadow-soft focus-visible:ring-2 focus-visible:ring-ring"
    >
      {media === undefined ? null : (
        <div
          className="relative w-full overflow-hidden bg-surface-raised"
          style={{ aspectRatio: ratio ?? FALLBACK_RATIO }}
        >
          {media.kind === "video" ? (
            <AutoplayVideo
              src={media.src}
              onAspect={measure}
              className="size-full object-cover"
            />
          ) : (
            <PhotoCover src={media.src} onRatio={measure} />
          )}
        </div>
      )}
      <div className="flex flex-col gap-2.5 px-[18px] pt-4 pb-[18px]">
        <div className="flex h-[19px] items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-mono text-[14px] leading-[19px] font-semibold">
              {skill.name}
            </span>
            <CheckBadge skill={skill} />
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
        {inLibrary(skill) ? (
          <div onClick={(event) => event.stopPropagation()}>
            <TagEditor
              disabled={savingTags}
              tags={skill.tags}
              suggestions={tagSuggestions}
              words={{
                add: t("skills.detail.category.add"),
                placeholder: t("skills.detail.category.placeholder"),
                remove: t("skills.detail.category.remove"),
              }}
              onChange={(tags) => {
                setSavingTags(true)
                void onTagsChange(tags).finally(() => setSavingTags(false))
              }}
            />
          </div>
        ) : null}
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
  const cards = Array.from({ length: 8 }, (_, index) => index)

  return (
    <ResourceMasonry>
      {cards.map((index) => (
        <div
          key={index}
          className="w-full min-w-0 overflow-hidden rounded-xl bg-card ring-1 ring-border"
        >
          <div className="flex flex-col gap-2 px-[18px] py-4">
            <span className="h-4 w-1/2 animate-pulse rounded-full bg-muted" />
            <span className="h-3 w-5/6 animate-pulse rounded-full bg-muted" />
            <span className="h-3 w-2/3 animate-pulse rounded-full bg-muted" />
            <span className="h-6 w-1/3 animate-pulse rounded-full bg-muted" />
            <span className="h-8 w-full animate-pulse rounded-full bg-muted" />
          </div>
        </div>
      ))}
    </ResourceMasonry>
  )
}

function SkillGrid({
  skills,
  blocked,
  tagSuggestions,
  onTagsChange,
  onInstall,
  onAdopt,
  onRemove,
  onOpen,
}: {
  skills: Skill[]
  /** Why no folder can be installed into, ready to show; `null` when one can. */
  blocked: string | null
  tagSuggestions: string[]
  onTagsChange: (skill: Skill, tags: string[]) => Promise<void>
  onInstall: (skill: Skill, ref: SkillPlaceRef) => void
  onAdopt: (skill: Skill, ref: SkillPlaceRef) => void
  onRemove: (skill: Skill, ref: SkillPlaceRef) => void
  onOpen: (skill: Skill) => void
}) {
  /*
   * Masonry with a responsive column count, capped at five so a wide window
   * does not keep adding columns. A column needs a 266px card plus the 24px
   * gutter, so each step is 290n - 24; the content area's width decides the
   * count, so the sidebar width does not shift them.
   */
  return (
    <ResourceMasonry>
      {skills.map((skill) => (
        <SkillCard
          key={skillKey(skill)}
          skill={skill}
          blocked={blocked}
          tagSuggestions={tagSuggestions}
          onTagsChange={(tags) => onTagsChange(skill, tags)}
          onInstall={(ref) => onInstall(skill, ref)}
          onAdopt={(ref) => onAdopt(skill, ref)}
          onRemove={(ref) => onRemove(skill, ref)}
          onOpen={() => onOpen(skill)}
        />
      ))}
    </ResourceMasonry>
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

/* The batch strip's own action: the places a skill can be installed into. The
   strip around it belongs to the ledger. */
function BatchInstall({
  count,
  blocked,
  onInstall,
}: {
  count: number
  /** Why a workspace place cannot be written, ready to show; `null` when one can. */
  blocked: string | null
  onInstall: (place: SkillPlace) => void
}) {
  const { t } = useI18n()
  const places = useSkillDisplayPlaces(useSelectablePlaces())
  /* A machine-wide place needs no workspace, so only the workspace ones depend
     on there being a folder to write into. */
  const writable = places.filter((place) => place.scope !== "workspace" || blocked === null)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            disabled={count === 0 || writable.length === 0}
            title={writable.length === 0 ? (blocked ?? undefined) : undefined}
            className="h-[34px] gap-1.5 rounded-full px-4 text-[13px] font-semibold"
          >
            {t("skills.action.installInto")}
            <ChevronDownIcon className="size-3.5" />
          </Button>
        }
      />
      <PlaceMenu
        title={t("skills.action.installInto")}
        words={placeWords(t)}
        groups={SCOPES.map((scope) => ({
          label: t(`skills.group.${scope}`),
          options: writable
            .filter((place) => place.scope === scope)
            .map((place) => ({
              id: place.id,
              icon: place.icon,
              label: t(place.labelKey),
              where: placePath(place),
              blocked: place.scope === "workspace" ? blocked : null,
            })),
        })).filter((group) => group.options.length > 0)}
        onPick={(id) => {
          const place = writable.find((entry) => entry.id === id)
          if (place !== undefined) onInstall(place)
        }}
      />
    </DropdownMenu>
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
  onInstall: (skill: Skill, ref: SkillPlaceRef) => void
  onAdopt: (skill: Skill, ref: SkillPlaceRef) => void
  onRemove: (skill: Skill, ref: SkillPlaceRef) => void
  onOpen: (skill: Skill) => void
}) {
  const { t } = useI18n()

  /* Column widths as shares of the table, not fixed pixels. The table is
     `table-fixed` inside a panel whose width follows the window, so fixed widths
     pushed the action column off the right edge — the one column the list exists
     for. The shares keep the design's proportions at any width. */
  const columns: LedgerColumn<Skill>[] = [
    { key: "select", width: "2.9%" },
    {
      key: "skill",
      label: t("skills.column.skill"),
      width: "43.1%",
      cell: (skill) => (
        <div className="flex items-center gap-3">
          <SkillThumb skill={skill} />
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-[14px] leading-[18px] font-semibold">
                <Highlighted text={skill.name} needle={needle} />
              </span>
              <CheckBadge skill={skill} />
            </span>
            <span className="truncate text-[12px] leading-[17px] text-muted-foreground">
              <Highlighted text={skill.description} needle={needle} />
            </span>
          </div>
        </div>
      ),
    },
    {
      key: "tags",
      label: t("skills.column.tags"),
      width: "19.3%",
      cell: (skill) => (
        <div className="flex flex-wrap items-center gap-1.5">
          {skill.tags.map((tag) => (
            <TagChip key={tag} tag={tag} size="md" />
          ))}
        </div>
      ),
    },
    {
      key: "location",
      label: t("skills.column.location"),
      width: "16.1%",
      cell: (skill) => <ProvenanceLine skill={skill} />,
    },
    {
      key: "updated",
      label: t("skills.column.updated"),
      width: "10.1%",
      cell: (skill) => (
        <span className="text-[13px] text-muted-foreground">{skill.updated}</span>
      ),
    },
    {
      key: "action",
      label: t("skills.column.action"),
      width: "8.5%",
      cell: (skill) => (
        <SkillActionButton
          skill={skill}
          blocked={blocked}
          onInstall={(ref) => onInstall(skill, ref)}
          onAdopt={(ref) => onAdopt(skill, ref)}
          onRemove={(ref) => onRemove(skill, ref)}
        />
      ),
    },
  ]

  return (
    <Ledger
      columns={columns}
      rows={skills}
      rowKey={skillKey}
      checked={checked}
      onCheck={onCheck}
      selectLabel={(skill) => `${t("skills.table.select")} ${skill.name}`}
      selectAllLabel={t("skills.table.selectAll")}
      batch={{
        label: t("skills.batch.selected").replace("{count}", String(checked.length)),
        clearLabel: t("skills.batch.clear"),
        onClear: () => onCheck([]),
        action: (
          <BatchInstall
            count={checked.length}
            blocked={blocked}
            onInstall={(place) => {
              for (const skill of skills) {
                if (!checked.includes(skillKey(skill))) continue
                /* A place already holding this skill is left alone: writing it
                   there again refuses instead of adding anything. */
                if (placedIn(skill).some((hold) => hold.id === place.id)) continue
                onInstall(skill, { scope: place.scope, dir: place.dir })
              }
              onCheck([])
            }}
          />
        ),
      }}
      onOpen={onOpen}
    />
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
  const [tab, setTab] = React.useState<SkillTab>("all")
  const [narrowed, setNarrowed] = React.useState<Pick<SkillPlace, "id" | "scope" | "dir"> | null>(null)
  const settings = useSettings()
  const search = useSearchPage()
  const [view, setView] = React.useState<"grid" | "list">(settings.layout)
  const [addTab, setAddTab] = React.useState<AddSkillTab | null>(null)
  const [tag, setTag] = React.useState("All tags")
  /* Typing narrows the same list the category chips do; it is not a new view.
     The query lives in the address so the global search can seed it. */
  const query = search.query
  const setQuery = search.setQuery
  const needle = useSettled(query)
  /* Ticked rows, by key. Narrowing the list drops them: a batch action names
     what the person can still see. */
  const [checked, setChecked] = React.useState<readonly string[]>([])
  const [page, setPage] = React.useState(0)
  const [pageSize, setPageSize] = React.useState(12)
  /* A batch check clones every recorded source; the toolbar says it is busy. */
  const [checking, setChecking] = React.useState(false)
  /* A batch a tab's menu started, which holds the menu's item disabled until the
     run it stands for has finished. */
  const [batch, setBatch] = React.useState<"adopt" | "update" | null>(null)
  /* The open lightbox is a row key, because the same id can be two rows. */
  const [detailKey, setDetailKey] = React.useState<string | null>(null)

  /* The places this build reads: every workspace one a registered provider
     names, and the machine-wide ones of the agents the sidebar chose. */
  const places = useReadablePlaces()
  const selectable = useSelectablePlaces()
  const displaySelectable = useSkillDisplayPlaces(selectable)

  const library = useSkillLibrary(places, needle)
  /* The page filters and pages what the hook hands it: rows come from the
     library and the places both, and only the library has a server page. */
  const rows = library.rows

  const offered = React.useMemo(() => {
    if (needle === "") return rows
    const text = needle.toLowerCase()
    return rows.filter((row) => matchesQuery(row, text))
  }, [rows, needle])

  /* With no folder to install into, the action says why it is unavailable. A
     machine-wide place needs no workspace, so only the workspace ones have
     nothing to write into without one. */
  const blocked =
    library.workspaceId === null && selectable.some((place) => place.scope === "workspace")
      ? t("skills.workspace.none")
      : null

  const onTag = React.useMemo(
    () => (tag === "All tags" ? offered : offered.filter((row) => row.tags.includes(tag))),
    [offered, tag]
  )

  /* A number belongs to the tabs that hold skills; a scope tab shows which
     places it spans instead, so its size is not printed twice. */
  const counts = React.useMemo(
    () => ({
      all: rowsForTab(onTag, "all", null).length,
      library: rowsForTab(onTag, "library", null).length,
      unstored: rowsForTab(onTag, "unstored", null).length,
      updates: rowsForTab(onTag, "updates", null).length,
    }),
    [onTag]
  )

  const chosen = selectedSkillPlace(selectable, narrowed)
  const selectableKey = JSON.stringify(selectable.map(skillPlaceKey))
  const [previousSelectableKey, setPreviousSelectableKey] = React.useState(selectableKey)
  if (previousSelectableKey !== selectableKey) {
    setPreviousSelectableKey(selectableKey)
    /* Re-enabling an agent must not revive a stale location filter. */
    if (tab === "place" && chosen === null) {
      setTab("all")
      setNarrowed(null)
      setPage(0)
      setChecked([])
    }
  }

  const screenTab: SkillTab =
    (tab === "unstored" && library.counts.unstored === 0) ||
    (tab === "updates" && library.counts.updates === 0) ||
    (tab === "place" && chosen === null)
      ? "all"
      : tab

  const matching = React.useMemo(
    () => rowsForTab(onTag, screenTab, chosen),
    [onTag, screenTab, chosen]
  )

  const placeEmpty = screenTab === "place" && chosen !== null
    ? { icon: chosen.scope === "workspace" ? FolderOpenIcon : GlobeIcon, note: placePath(chosen) }
    : null

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

  /**
   * Say what went wrong the way every other failure in this app is said: a
   * toast, which carries its own words and leaves when it is done, rather than
   * a line that would stay on the page like a state.
   */
  const refuse = (failure: unknown) =>
    toast.add({ type: "error", title: reasonOf(failure) })

  const install = async (skill: Skill, ref: SkillPlaceRef) => {
    try {
      await library.install(skill.name, ref)
    } catch (failure) {
      refuse(failure)
    }
  }

  /** Ask every recorded source; the badges that change are the report, and a
      copy somebody edited is named because an update would overwrite it. A
      source that could not be read is named too, since nothing else would. */
  const checkAll = async () => {
    setChecking(true)
    try {
      const summary = await library.checkAll()
      if (summary.modified > 0) {
        toast.add({
          type: "warning",
          title: t("skills.update.modifiedCount").replace("{count}", String(summary.modified)),
        })
      }
      if (summary.failed.length > 0) {
        toast.add({
          type: "error",
          title: summary.failed.map((entry) => `${entry.name}: ${entry.reason}`).join(" · "),
        })
      }
    } catch (failure) {
      refuse(failure)
    } finally {
      setChecking(false)
    }
  }

  /** Take back the link that put a skill in a place as well as the library. */
  const uninstall = async (skill: Skill, ref: SkillPlaceRef) => {
    try {
      if (skill.linkAt === "library") {
        /* The library linked the skill in; removing its entry takes the link. */
        await (library.store?.remove(skill.name) ?? Promise.resolve())
        await library.reload()
      } else if (nameTakenAt(skill, ref)) {
        /* The place keeps its own skill under this name; taking it back deletes
           that entry — a link goes as an entry, a directory with its files. */
        await library.deleteInPlace(skill.name, ref)
      } else {
        await library.remove(skill.name, ref)
      }
    } catch (failure) {
      refuse(failure)
    }
  }

  /** Link a skill a place wrote into the library. */
  const adopt = async (skill: Skill, ref: SkillPlaceRef) => {
    try {
      await library.adopt(skill.name, ref)
    } catch (failure) {
      refuse(failure)
    }
  }

  /** The rows the two batch screens act on, read from the whole catalog rather
      than from what a category chip happens to leave on screen. */
  const unstoredRows = React.useMemo(() => rows.filter(unstored), [rows])
  const outdatedRows = React.useMemo(() => rows.filter(outdated), [rows])

  /**
   * Take in every skill a place wrote, one at a time: each link is a write of
   * its own, and the first refusal names the skill it was about, so a run that
   * stops says which one stopped it.
   */
  const adoptAll = async () => {
    setBatch("adopt")
    try {
      for (const skill of unstoredRows) {
        const hold = holdsOf(skill)[0]
        if (hold === undefined) continue
        await library.adopt(skill.name, { scope: hold.scope, dir: hold.dir })
      }
    } catch (failure) {
      refuse(failure)
    } finally {
      setBatch(null)
    }
  }

  /** Install the source's current revision over every copy that fell behind. */
  const updateAll = async () => {
    setBatch("update")
    try {
      for (const skill of outdatedRows) await library.update(skill.name)
    } catch (failure) {
      refuse(failure)
    } finally {
      setBatch(null)
    }
  }

  const setTags = async (skill: Skill, tags: string[]) => {
    try {
      const store = library.store
      if (store === null) throw new Error("this form has no skill library")
      await applyTo(() => store.update(skill.name, { tags }))
    } catch (failure) {
      refuse(failure)
    }
  }

  /** Delete the skill, then close the lightbox it was open in. */
  const removeSkill = async (skill: Skill) => {
    await (library.store?.remove(skill.name) ?? Promise.resolve())
    await library.reload()
    setDetailKey(null)
  }

  /** Delete a skill from the place that holds it, then close the lightbox. */
  const removePlaceSkill = async (skill: Skill, ref: SkillPlaceRef) => {
    await library.deleteInPlace(skill.name, ref)
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

  /* The page's own footer, not a strip inside whichever view is open: it reads
     the whole filtered set, so switching views leaves it where it is. */
  const footer =
    skills.length === 0 ? null : (
      <div className="flex h-9 shrink-0 items-center justify-between gap-4">
        <span className="text-[13px] text-muted-foreground">
          {t("skills.footer.count")
            .replace("{shown}", String(skills.length))
            .replace("{total}", String(matching.length))}
        </span>
        {pagination}
      </div>
    )

  return (
    <div className="flex flex-1 flex-col gap-8">
      <PageHeading />
      <Tabs
        value={screenTab}
        onValueChange={(value) => {
          setTab(SHELL_TABS.find((item) => item.value === value)?.value ?? "all")
          setNarrowed(null)
          setPage(0)
          setChecked([])
        }}
        className="flex-1 gap-8"
      >
        {/* The tabs and the actions each want a whole line, so they wrap onto
            two rather than scroll sideways out of the page. */}
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-6">
          <TabsList className="h-11! min-w-0 max-w-full gap-1 overflow-x-auto rounded-full bg-secondary p-1">
            {SHELL_TABS.filter(
              (item) =>
                (item.value !== "unstored" || library.counts.unstored > 0) &&
                (item.value !== "updates" || library.counts.updates > 0)
            ).map((item) => {
              const count = counts[item.value as keyof typeof counts]
              const active = screenTab === item.value
              if (item.value === "unstored" || item.value === "updates") {
                const own = item.value === "unstored" ? "adopt" : "update"
                return (
                  <ActionTab
                    key={item.value}
                    icon={item.icon}
                    label={t(item.labelKey)}
                    count={count}
                    action={t(own === "adopt" ? "skills.action.adoptAll" : "skills.action.updateAll")}
                    actionIcon={own === "adopt" ? PackagePlusIcon : DownloadIcon}
                    /* The run is this tab's to show; another one only holds it up. */
                    state={batch === null ? "idle" : batch === own ? "running" : "blocked"}
                    active={active}
                    onTab={() => {
                      setTab(item.value)
                      setNarrowed(null)
                      setPage(0)
                      setChecked([])
                    }}
                    onAction={() => void (own === "adopt" ? adoptAll() : updateAll())}
                  />
                )
              }
              return (
                <TabsTrigger
                  key={item.value}
                  value={item.value}
                  className="h-9 flex-none gap-1.5 rounded-full px-4 text-[length:var(--text-body)] text-muted-foreground data-active:bg-foreground data-active:text-background data-active:hover:text-background dark:data-active:bg-accent dark:data-active:text-foreground"
                >
                  <item.icon className="size-3.5 shrink-0" aria-hidden />
                  {t(item.labelKey)}
                  <span className={`font-mono text-[13px] ${library.error !== null || count === 0 ? "opacity-45" : ""}`}>
                    {library.error === null ? count : "—"}
                  </span>
                </TabsTrigger>
              )
            })}
            <DropdownMenu>
              <DropdownMenuTrigger
                disabled={selectable.length === 0}
                render={
                  <button
                    type="button"
                    disabled={selectable.length === 0}
                    aria-label={chosen !== null && screenTab === "place"
                      ? `${t("skills.tab.places")}: ${t(chosen.labelKey)} · ${t(`skills.group.${chosen.scope}`)} · ${placePath(chosen)}`
                      : `${t("skills.tab.places")}: ${t("skills.tab.all")}`}
                    aria-current={screenTab === "place" ? "true" : undefined}
                    className={`flex h-9 flex-none items-center gap-1.5 rounded-full px-4 text-[length:var(--text-body)] outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${screenTab === "place" ? "bg-foreground text-background dark:bg-accent dark:text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <ContainerIcon className="size-3.5 shrink-0" aria-hidden />
                    {t("skills.tab.places")}
                    <ChevronDownIcon className="size-3.5 shrink-0" aria-hidden />
                  </button>
                }
              />
              <PlaceMenu
                words={placeWords(t)}
                currentSelection
                groups={SCOPES.map((scope) => ({
                  label: t(`skills.group.${scope}`),
                  options: displaySelectable.filter((place) => place.scope === scope).map((place) => ({
                    id: skillPlaceKey(place),
                    icon: place.icon,
                    label: t(place.labelKey),
                    where: placePath(place),
                    count: library.places.find((held) => skillPlaceKey(held) === skillPlaceKey(place))?.view?.skills.length ?? null,
                    selected: screenTab === "place" && chosen !== null && skillPlaceKey(chosen) === skillPlaceKey(place),
                  })),
                }))}
                onPick={(id) => {
                  const place = selectable.find((item) => skillPlaceKey(item) === id)
                  if (place === undefined) return
                  setNarrowed({ id: place.id, scope: place.scope, dir: place.dir })
                  setTab("place")
                  setPage(0)
                  setChecked([])
                }}
              />
            </DropdownMenu>
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
            <Button
              className="h-9 gap-2 rounded-full px-4"
              render={<a href="/market/skills" />}
            >
              <CompassIcon />
              {t("skills.action.explore")}
            </Button>
          </div>
        </div>
        <FilterBar
          query={query}
          onQuery={(next) => {
            setQuery(next)
            setChecked([])
          }}
          tags={library.tags}
          tag={tag}
          all="All tags"
          onTag={(next) => {
            setTag(next)
            setChecked([])
          }}
          words={{
            search: t("skills.filter.placeholder"),
            clear: t("skills.filter.clear"),
            all: t("skills.allTags"),
          }}
        />
        <TabsContent value={screenTab} aria-label={screenTab === "place" ? t("skills.tab.places") : undefined} className="flex flex-col">
          <PageBody footer={footer}>
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
                      render={<a href="/market/skills" />}
                    >
                      <CompassIcon />
                      {t("skills.action.exploreRemote")}
                    </Button>
                  }
                />
              ) : placeEmpty !== null ? (
                <EmptyState
                  icon={placeEmpty.icon}
                  title={t("skills.place.empty")}
                  hint={t("skills.place.emptyHint")}
                  note={placeEmpty.note}
                  action={
                    <Button className="h-10 rounded-full px-4" onClick={() => {
                      setTab("all")
                      setNarrowed(null)
                      setPage(0)
                      setChecked([])
                    }}>
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
                      render={<a href="/market/skills" />}
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
                blocked={blocked}
                tagSuggestions={library.tags}
                onTagsChange={setTags}
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
          </PageBody>
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
        key={detailKey ?? "closed"}
        skill={detail}
        store={library.store}
        root={library.root}
        places={library.places}
        /* Only the workspace places depend on a folder being in use; each row
           decides for itself whether it can be written. */
        blocked={blocked}
        onInstallPlace={(skill, ref) => void install(skill, ref)}
        onRemovePlace={(skill, ref) => void uninstall(skill, ref)}
        onAdopt={(skill, ref) => void adopt(skill, ref)}
        onDelete={removeSkill}
        onDeletePlace={removePlaceSkill}
        onCheckUpdate={(skill) => library.checkUpdate(skill.name)}
        onUpdate={(skill) => library.update(skill.name)}
        onTagsChange={(tags) => {
          if (detail) setTags(detail, tags)
        }}
        /* The editor offers the types the library already carries rather than
           a fixed vocabulary, so picking one cannot invent a second spelling. */
        tagSuggestions={library.tags}
        onChanged={() => void library.reload()}
        onOpenChange={(open) => {
          if (!open) setDetailKey(null)
        }}
      />
    </div>
  )
}
