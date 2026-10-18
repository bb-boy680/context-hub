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
import { SearchSkillsDialog } from "./search-dialog.tsx"
import { holdsOf, inLibrary, modified, outdated, placePath, skillKey, tokenLabel, unstored, useReadablePlaces, useSkillDocument, useSkillLibrary } from "./library.ts"
import { ProvenanceLine } from "./provenance-line.tsx"
import { SkillDetailDialog } from "./skill-detail-dialog.tsx"
import { tagTone } from "./tags.ts"
import type { SkillPlaceRef, SkillStore } from "./store.ts"
import type { Skill } from "./types.ts"

import { useContributions, useI18n, useSearchPage, useSettings } from "@context-hub/extensions/react"
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
  PlaceScopePicker,
  TablePagination,
  type LedgerColumn,
  type PlaceOption,
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

/* The tab row carries one dimension: where a skill's files are. Two entries are
   the shell's own — everything, and the hub's library — and two group the places
   by scope: the ones in the workspace in use, and the machine-wide ones of the
   agents chosen in the sidebar. A scope can hold several places, so it says
   which with an icon stack rather than a count: the count is what the stack
   answers, and printing both would say it twice.

   The last two entries stand for what is missing rather than for where anything
   is: a skill a place holds that the library does not, and one whose source has
   moved on. Each carries the one batch action its set is for, so the toolbar
   stays about the page as a whole. */
const SHELL_TABS: { value: SkillTab; labelKey: string; icon: ExtensionIcon }[] = [
  { value: "all", labelKey: "skills.tab.all", icon: LayoutGridIcon },
  { value: "library", labelKey: "skills.tab.library", icon: LibraryIcon },
  { value: "unstored", labelKey: "skills.tab.unstored", icon: InboxIcon },
  { value: "updates", labelKey: "skills.tab.updates", icon: CircleArrowUpIcon },
  /* Not a folder: the stack beside this label already draws the places' own
     marks, and the workspace place among them IS a folder. */
  { value: "workspace", labelKey: "skills.tab.workspace", icon: ContainerIcon },
  { value: "global", labelKey: "skills.tab.global", icon: GlobeIcon },
]

/** The tabs that group places by scope, which are the ones that open a menu. */
const SCOPE_TABS: SkillTab[] = ["workspace", "global"]

/** Which rows a tab shows. */
type SkillTab = "all" | "library" | "unstored" | "updates" | AssetScope

/** Which rows one tab holds, before the category filter. A place narrows a
    scope to that one place; the shell's own tabs have no places to narrow. */
function rowsForTab(rows: Skill[], value: SkillTab, place: string | null): Skill[] {
  if (value === "all") return rows
  if (value === "library") return rows.filter(inLibrary)
  if (value === "unstored") return rows.filter(unstored)
  if (value === "updates") return rows.filter(outdated)
  return rows.filter((row) =>
    holdsOf(row).some(
      (hold) => hold.scope === value && (place === null || hold.id === place)
    )
  )
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

/* A quiet chip over a cover: a hairline pill on the canvas colour, so a label
   never competes with the picture underneath it. */
const pillSurface =
  "inline-flex h-5 shrink-0 items-center rounded-full bg-card/95 px-[9px] text-[12px] leading-none font-semibold text-foreground ring-1 ring-border"

function TagPill({ tag }: { tag: string }) {
  return <span className={pillSurface}>{tag}</span>
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
  /* The places this build reads, which the row offers itself rather than having
     every list thread them down to it. */
  const places = useReadablePlaces()
  const holds = holdsOf(skill)
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
    if (skill.inLibrary === true) return null
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
              blocked:
                (place.scope === "workspace" ? blocked : null) ??
                (!holds.some((hold) => hold.id === place.id) &&
                skill.takenAt?.includes(place.id) === true
                  ? t("skills.workspace.taken")
                  : null),
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
 * The asset a card shows: the first picture when it is a video, else the cover,
 * else the first picture. `undefined` means the card falls back to its document.
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
  onInstall: (ref: SkillPlaceRef) => void
  onAdopt: (ref: SkillPlaceRef) => void
  onRemove: (ref: SkillPlaceRef) => void
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
  onInstall: (skill: Skill, ref: SkillPlaceRef) => void
  onAdopt: (skill: Skill, ref: SkillPlaceRef) => void
  onRemove: (skill: Skill, ref: SkillPlaceRef) => void
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
            onInstall={(ref) => onInstall(skill, ref)}
            onAdopt={(ref) => onAdopt(skill, ref)}
            onRemove={(ref) => onRemove(skill, ref)}
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
  onInstall: (ref: SkillPlaceRef) => void
}) {
  const { t } = useI18n()
  const places = useReadablePlaces()
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
          if (place !== undefined) onInstall({ scope: place.scope, dir: place.dir })
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
            onInstall={(ref) => {
              for (const skill of skills) {
                if (checked.includes(skillKey(skill))) onInstall(skill, ref)
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
  /* One place inside the current scope, once a person picked one from the tab's
     menu; `null` leaves the scope whole. */
  const [narrowed, setNarrowed] = React.useState<string | null>(null)
  const settings = useSettings()
  const search = useSearchPage()
  /* A result from the global search asks for the list view, where the matched
     text is marked; the page's own choice is what remains once that is cleared. */
  const [localView, setLocalView] = React.useState<"grid" | "list">(settings.layout)
  const view = search.listView ? "list" : localView
  const chooseView = (next: "grid" | "list") => {
    search.clearListView()
    setLocalView(next)
  }
  const [addTab, setAddTab] = React.useState<AddSkillTab | null>(null)
  const [searchOpen, setSearchOpen] = React.useState(false)
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

  const library = useSkillLibrary(places, needle)
  /* A registry plugin answers the search; with none the dialog says so. */
  const registries = useContributions("skillRegistry")
  const registry = registries[0] ?? null
  /* Each scope tab names the places it holds by their marks, so the number of
     them is a count of places rather than of skills; the same list, with what
     each place holds, is what hovering the stack shows. */
  const scopePlaces = React.useMemo(() => {
    const byScope: Record<AssetScope, PlaceOption[]> = { workspace: [], global: [] }
    for (const place of places) {
      const view = library.places.find((held) => held.id === place.id)?.view ?? null
      byScope[place.scope].push({
        id: place.id,
        icon: place.icon,
        label: t(place.labelKey),
        where: placePath(place),
        count: view === null ? null : view.skills.length,
      })
    }
    return byScope
  }, [places, library.places, t])

  /* A scope tab stands for the places it spans, so a scope holding none is not a
     tab at all: with no agent chosen the machine-wide one has nothing to open,
     and the row says only what this hub can actually read. */
  const scopeHasPlaces = React.useCallback(
    (value: SkillTab) =>
      value === "workspace" || value === "global" ? scopePlaces[value].length > 0 : true,
    [scopePlaces]
  )

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
    library.workspaceId === null && places.some((place) => place.scope === "workspace")
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

  /* A screen holding nothing leaves the row rather than opening empty, and the
     row is read before the filters: a category that happens to match none of
     them must not make the tab itself disappear under the pointer. A scope with
     no places left — the last agent chosen for it was un-chosen — is one of
     those screens too. */
  const screenTab: SkillTab =
    (tab === "unstored" && library.counts.unstored === 0) ||
    (tab === "updates" && library.counts.updates === 0) ||
    !scopeHasPlaces(tab)
      ? "all"
      : tab

  /* A choice from the tab's menu only means something while the scope it belongs
     to is the one on screen; anywhere else the scope is whole. */
  const chosen =
    narrowed !== null && places.some((place) => place.scope === screenTab && place.id === narrowed)
      ? narrowed
      : null
  const matching = React.useMemo(
    () => rowsForTab(onTag, screenTab, chosen),
    [onTag, screenTab, chosen]
  )

  /* A scope tab holds nothing for one of four reasons, and each needs its own
     words: a workspace the hub cannot read, one holding no skills, a
     machine-wide scope with no agent chosen, or one whose agents hold nothing. */
  const scopeEmpty = ((): { icon: LucideIcon; title: string; hint: string; note: string | null } | null => {
    if (!SCOPE_TABS.includes(screenTab)) return null
    const tab = screenTab as AssetScope
    const held = library.places.filter((place) => place.scope === tab)
    /* Narrowed to one place, only that place's own directory answers. */
    if (chosen !== null) {
      const only = scopePlaces[tab].find((place) => place.id === chosen)
      return {
        icon: tab === "workspace" ? FolderOpenIcon : GlobeIcon,
        title: t("skills.place.empty"),
        hint: t("skills.place.emptyHint"),
        note: only?.where ?? null,
      }
    }
    const readable = held.some((place) => place.view !== null)
    const note = held.map(placePath).join(" · ") || null
    if (tab === "global") {
      return held.length === 0
        ? { icon: GlobeIcon, title: t("skills.global.unread"), hint: t("skills.global.unreadHint"), note }
        : { icon: GlobeIcon, title: t("skills.global.empty"), hint: t("skills.global.emptyHint"), note }
    }
    if (library.workspaceId === null) {
      return {
        icon: FolderOpenIcon,
        title: t("skills.workspace.none"),
        hint: t("skills.workspace.noneHint"),
        note,
      }
    }
    return readable
      ? {
          icon: FolderOpenIcon,
          title: t("skills.workspace.empty"),
          hint: t("skills.workspace.emptyHint"),
          note,
        }
      : {
          icon: FolderOpenIcon,
          title: t("skills.workspace.noPath"),
          hint: t("skills.workspace.noPathHint"),
          note,
        }
  })()

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

  const setTags = (skill: Skill, tags: string[]) =>
    void applyTo(() => library.store?.update(skill.name, { tags }) ?? Promise.resolve())

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
          setPage(0)
          setChecked([])
        }}
        className="flex-1 gap-8"
      >
        <div className="flex items-center justify-between gap-6">
          <TabsList className="h-11! gap-1 rounded-full bg-secondary p-1">
            {SHELL_TABS.filter(
              (item) =>
                (item.value !== "unstored" || library.counts.unstored > 0) &&
                (item.value !== "updates" || library.counts.updates > 0) &&
                scopeHasPlaces(item.value)
            ).map((item) => {
              const scope = SCOPE_TABS.includes(item.value) ? (item.value as AssetScope) : null
              const stack = scope === null ? null : scopePlaces[scope]
              const count = counts[item.value as keyof typeof counts]
              const active = screenTab === item.value
              /* A scope opens through its place list, and the two screens that
                 stand for a missing set open through the one action that set is
                 for; the rest are screens already and open on the press. */
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
                      setPage(0)
                      setChecked([])
                    }}
                    onAction={() => void (own === "adopt" ? adoptAll() : updateAll())}
                  />
                )
              }
              if (scope === null || stack === null) {
                return (
                  <TabsTrigger
                    key={item.value}
                    value={item.value}
                    className="h-9 flex-none gap-1.5 rounded-full px-4 text-[length:var(--text-body)] text-muted-foreground data-active:bg-foreground data-active:text-background data-active:hover:text-background dark:data-active:bg-accent dark:data-active:text-foreground"
                  >
                    <item.icon className="size-3.5 shrink-0" aria-hidden />
                    {t(item.labelKey)}
                    <span
                      className={`font-mono text-[13px] ${
                        library.error !== null || count === 0 ? "opacity-45" : ""
                      }`}
                    >
                      {library.error === null ? count : "—"}
                    </span>
                  </TabsTrigger>
                )
              }
              return (
                <PlaceScopePicker
                  key={item.value}
                  scopeIcon={item.icon}
                  scopeLabel={t(item.labelKey)}
                  places={stack}
                  chosen={active ? chosen : null}
                  active={active}
                  allLabel={t("skills.place.all")}
                  title={t("skills.place.which")}
                  words={placeWords(t)}
                  onChoose={(id) => {
                    setTab(scope)
                    setNarrowed(id)
                    setPage(0)
                    setChecked([])
                  }}
                />
              )
            })}
          </TabsList>
          <div className="flex shrink-0 items-center gap-2">
            <div className={viewToggleSurface}>
              <ViewButton
                icon={LayoutGridIcon}
                label={t("skills.view.grid")}
                active={view === "grid"}
                onClick={() => chooseView("grid")}
              />
              <ViewButton
                icon={ListIcon}
                label={t("skills.view.list")}
                active={view === "list"}
                onClick={() => chooseView("list")}
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
        <TabsContent value={screenTab} className="flex flex-col">
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
                      onClick={() => setSearchOpen(true)}
                    >
                      <CompassIcon />
                      {t("skills.action.exploreRemote")}
                    </Button>
                  }
                />
              ) : scopeEmpty !== null ? (
                <EmptyState
                  icon={scopeEmpty.icon}
                  title={scopeEmpty.title}
                  hint={scopeEmpty.hint}
                  note={scopeEmpty.note}
                  action={
                    /* Narrowed to one place, the way out is the scope it came
                       from; otherwise the whole library is. */
                    chosen === null ? (
                      <Button className="h-10 rounded-full px-4" onClick={() => setTab("all")}>
                        {t("skills.tab.all")}
                      </Button>
                    ) : (
                      <Button
                        className="h-10 rounded-full px-4"
                        onClick={() => setNarrowed(null)}
                      >
                        {t("skills.place.all")}
                      </Button>
                    )
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
