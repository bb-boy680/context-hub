import {
  CheckIcon,
  CompassIcon,
  ChevronDownIcon,
  ContainerIcon,
  DownloadIcon,
  FileTextIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  GlobeIcon,
  LayersIcon,
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
import { holdsOf, inLibrary, placePath, skillKey, tokenLabel, useReadablePlaces, useSkillDocument, useSkillLibrary } from "./library.ts"
import { cardMedia, knownAspect, rememberAspect } from "./media.ts"
import { ProvenanceLine } from "./provenance-line.tsx"
import { SkillDetailDialog } from "./skill-detail-dialog.tsx"
import { tagTone } from "./tags.ts"
import type { SkillPlaceRef, SkillStore } from "./store.ts"
import type { Skill } from "./types.ts"

import { useContributions, useI18n } from "@workspace/extensions/react"
import type { AssetScope, ExtensionIcon } from "@workspace/extensions"
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
  DropdownMenuSeparator,
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

/* The tab row carries one dimension: where a skill's files are. Two entries are
   the shell's own — everything, and the hub's library — and two group the places
   by scope: the ones in the workspace in use, and the machine-wide ones of the
   agents chosen in the sidebar. A scope can hold several places, so it says
   which with an icon stack rather than a count: the count is what the stack
   answers, and printing both would say it twice. */
const SHELL_TABS: { value: SkillTab; labelKey: string; icon: ExtensionIcon }[] = [
  { value: "all", labelKey: "skills.tab.all", icon: LayoutGridIcon },
  { value: "library", labelKey: "skills.tab.library", icon: LibraryIcon },
  /* Not a folder: the stack beside this label already draws the places' own
     marks, and the workspace place among them IS a folder. */
  { value: "workspace", labelKey: "skills.tab.workspace", icon: ContainerIcon },
  { value: "global", labelKey: "skills.tab.global", icon: GlobeIcon },
]

/** Which rows a tab shows. */
type SkillTab = "all" | "library" | AssetScope

/** Which rows one tab holds, before the category filter. A place narrows a
    scope to that one place; the shell's own two tabs have no places to narrow. */
function rowsForTab(rows: Skill[], value: SkillTab, place: string | null): Skill[] {
  if (value === "all") return rows
  if (value === "library") return rows.filter(inLibrary)
  return rows.filter((row) =>
    holdsOf(row).some(
      (hold) => hold.scope === value && (place === null || hold.id === place)
    )
  )
}

/** The 20px tile and the 13px step the tab row's icon stacks are drawn at. */
const STACK_TILE = 20
const STACK_STEP = 13

/** Past this many places a stack keeps the first few and counts the rest. */
const STACK_MAX = 5

/** The two scopes, in the order a list of places reads them. */
const SCOPES: readonly AssetScope[] = ["workspace", "global"]

/**
 * Past this many places a scope's menu searches its own list and caps its
 * height. How many agents a person enables is their own business, so the menu
 * has to stay usable at any number of them.
 */
const PLACE_SEARCH_MIN = 8

/** One place a scope tab stands for, as its stack and its menu name it. */
interface StackPlace {
  id: string
  icon: ExtensionIcon
  /** The place's name, resolved in the active locale. */
  label: string
  /** The directory as a person reads it. */
  where: string
  /** How many skills the place holds; `null` when it could not be read. */
  count: number | null
}

/**
 * The places of one scope, as its tab shows them: a 20px mark each — the mark
 * itself, not a glyph inside a box — stepping 13px so every one overlaps the one
 * before it, with a 2px seam in the colour behind the stack drawn inside the
 * tile the mark has to give up. The number of agents follows from the
 * integrations a person enabled, so a scope can hold more than fits; past
 * {@link STACK_MAX} the last tile carries the count.
 */
function PlaceStack({
  places,
  active,
}: {
  places: readonly StackPlace[]
  /** Whether the tab this stack belongs to is the one on screen. */
  active: boolean
}) {
  const shown = places.slice(0, STACK_MAX)
  const more = places.length - shown.length
  const slots = more === 0 ? shown.length : STACK_MAX + 1
  const tile = "absolute top-0 flex items-center justify-center overflow-hidden rounded-[6px]"
  const seam = `pointer-events-none absolute inset-0 rounded-[6px] ring-2 ring-inset ${
    active ? "ring-foreground dark:ring-accent" : "ring-secondary"
  }`
  const at = (index: number) => ({ left: STACK_STEP * index, width: STACK_TILE, height: STACK_TILE })

  return (
    <span
      className="relative shrink-0"
      style={{ width: STACK_STEP * (slots - 1) + STACK_TILE, height: STACK_TILE }}
    >
      {shown.map((place, index) => {
        const Mark = place.icon
        return (
          <span key={place.id} className={tile} style={at(index)}>
            <Mark className="size-5" aria-hidden />
            <span className={seam} aria-hidden />
          </span>
        )
      })}
      {more === 0 ? null : (
        <span key="more" className={`${tile} bg-current/15`} style={at(STACK_MAX)}>
          <span className="font-mono text-[10px] leading-none">{`+${more}`}</span>
          <span className={seam} aria-hidden />
        </span>
      )}
    </span>
  )
}

/** One place as a menu offers it. */
interface PlaceChoice {
  id: string
  icon: ExtensionIcon
  label: string
  where: string
  /** Taken already, so the row shows its check. */
  checked?: boolean
  /** Why the row cannot be taken right now; nothing when it can. */
  blocked?: string | null
  /** How many skills the place holds; omitted where the menu does not count. */
  count?: number | null
}

/**
 * The places a menu lists, as its whole content: a header naming what the list
 * is for, a search field once the list is longer than a glance, and one row per
 * place. Three menus ask the same question — which place — so they all show the
 * same answer: the scope tab's own list, a row's install menu, and the batch
 * bar's.
 */
function PlaceMenu({
  title,
  groups,
  leading,
  closeOnClick = true,
  onPick,
}: {
  /** What the list is for, e.g. "Install into". */
  title: string
  groups: readonly { label: string; choices: readonly PlaceChoice[] }[]
  /** A row above the groups that names the whole list rather than one place. */
  leading?: { choice: PlaceChoice; onPick: () => void }
  /** Whether taking a place dismisses the menu. */
  closeOnClick?: boolean
  onPick: (id: string) => void
}) {
  const { t } = useI18n()
  const [query, setQuery] = React.useState("")
  const all = groups.flatMap((group) => group.choices)
  const searchable = all.length >= PLACE_SEARCH_MIN
  const needle = query.trim().toLowerCase()
  const showing = groups
    .map((group) => ({
      label: group.label,
      choices:
        needle === ""
          ? group.choices
          : group.choices.filter(
              (choice) =>
                choice.label.toLowerCase().includes(needle) ||
                choice.where.toLowerCase().includes(needle)
            ),
    }))
    .filter((group) => group.choices.length > 0)
  const found = showing.reduce((sum, group) => sum + group.choices.length, 0)

  const row = "items-start gap-2.5 py-2"
  const plate =
    "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary ring-1 ring-border ring-inset"
  const name = "text-[13.5px] leading-[18px] font-semibold"
  const whereClass = "truncate font-mono text-[12px] leading-[16px] text-muted-foreground"
  const tally = "mt-0.5 shrink-0 font-mono text-[12.5px] text-muted-foreground"

  const renderRow = (choice: PlaceChoice, pick: () => void) => {
    const Mark = choice.icon
    const blocked = choice.blocked ?? null
    return (
      <DropdownMenuItem
        key={choice.id}
        /* Taking one place should not dismiss the menu: an install can go to
           several, and the row just taken shows its check in place. */
        closeOnClick={closeOnClick}
        disabled={blocked !== null}
        title={blocked ?? undefined}
        onClick={pick}
        className={row}
      >
        <span className={plate}>
          <Mark className="size-3.5" aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col text-left">
          <span className={name}>{choice.label}</span>
          <span className={whereClass}>{choice.where}</span>
        </span>
        {choice.count === undefined ? null : (
          <span className={tally}>{choice.count ?? "—"}</span>
        )}
        {choice.checked === true ? <CheckIcon className="mt-1 size-4 shrink-0" /> : null}
      </DropdownMenuItem>
    )
  }

  return (
    <DropdownMenuContent
      align="start"
      sideOffset={6}
      /* A menu drawn in a portal is still a React child of whatever opened it,
         so its clicks bubble to that element's own handler: on a card, choosing
         a place would also open the skill it belongs to. */
      onClick={(event) => event.stopPropagation()}
      /* A searchable menu scrolls its own list, under a field that stays put,
         so the popup itself must not be the scroller. */
      className={`w-[280px] ${searchable ? "overflow-hidden p-0" : ""}`}
    >
      {searchable ? (
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
          <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <input
            value={query}
            aria-label={t("skills.place.search")}
            placeholder={t("skills.place.search")}
            onChange={(event) => setQuery(event.target.value)}
            /* A menu keeps focus on its own items, which would send typing to
               its typeahead instead of here; the field takes focus itself. */
            onMouseDown={(event) => {
              event.stopPropagation()
              event.currentTarget.focus()
            }}
            onClick={(event) => event.stopPropagation()}
            /* Typing belongs to this field once it has focus: the menu reads
               the same keys for its own navigation. */
            onKeyDown={(event) => {
              if (event.key === "Escape" && query !== "") {
                event.preventDefault()
                event.stopPropagation()
                setQuery("")
                return
              }
              if (event.key !== "Escape") event.stopPropagation()
            }}
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/70"
          />
          {query === "" ? null : (
            <button
              type="button"
              aria-label={t("skills.place.searchClear")}
              onClick={() => setQuery("")}
              className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <XIcon className="size-3" />
            </button>
          )}
        </div>
      ) : null}
      <div className={searchable ? "max-h-[400px] overflow-y-auto p-1" : "p-1"}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center justify-between gap-2">
            <span>{title}</span>
            <span className="font-mono text-[11px] font-normal">
              {t("skills.location.count").replace("{count}", String(all.length))}
            </span>
          </DropdownMenuLabel>
          {/* A row that names the whole list is the answer to no query, so a
             search sets it aside. */}
          {leading !== undefined && needle === ""
            ? renderRow(leading.choice, leading.onPick)
            : null}
          {showing.map((group, index) => (
            <React.Fragment key={group.label}>
              {/* Two groups are two different answers — a folder the hub was
                  pointed at, and a machine-wide directory of a chosen agent —
                  so a rule keeps them apart. The first needs none. */}
              {index === 0 ? null : <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-[11.5px] font-semibold text-muted-soft">
                {group.label}
              </DropdownMenuLabel>
              {group.choices.map((choice) => renderRow(choice, () => onPick(choice.id)))}
            </React.Fragment>
          ))}
        </DropdownMenuGroup>
        {found === 0 ? (
          <p className="px-2 py-3 text-center text-[12.5px] text-muted-foreground">
            {t("skills.place.searchEmpty")}
          </p>
        ) : null}
      </div>
    </DropdownMenuContent>
  )
}

/**
 * One scope, as the tab row offers it: one pill holding the scope's name and the
 * marks of the places it stands for, which is the whole control. Pressing it
 * opens the list of places; choosing one is what opens the scope, so a person
 * never lands on a scope without having said which place they meant.
 */
function PlacePicker({
  scopeIcon: ScopeIcon,
  scopeLabel,
  places,
  chosen,
  active,
  onChoose,
}: {
  scopeIcon: ExtensionIcon
  /** The scope's own name, which the menu's first row takes whole. */
  scopeLabel: string
  places: readonly StackPlace[]
  /** The place the scope is narrowed to; `null` when it is whole. */
  chosen: string | null
  /** Whether this scope is the one on screen. */
  active: boolean
  onChoose: (id: string | null) => void
}) {
  const { t } = useI18n()
  /* Narrowed to one place, the marks are that one place's. */
  const marks = chosen === null ? places : places.filter((place) => place.id === chosen)
  const total = places.reduce((sum, place) => sum + (place.count ?? 0), 0)
  const pill = `flex h-9 flex-none shrink-0 items-center gap-1.5 rounded-full px-4 text-[length:var(--text-body)] outline-none focus-visible:ring-2 focus-visible:ring-ring ${
    active
      ? "bg-foreground text-background dark:bg-accent dark:text-foreground"
      : "text-muted-foreground hover:text-foreground"
  }`

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={`${scopeLabel} · ${places.map((place) => place.label).join(", ")}`}
            /* The pill is the scope's own control rather than a tab, so being
               the scope on screen is a current state, not a tab selection. */
            aria-current={active ? "true" : undefined}
            className={pill}
          >
            <ScopeIcon className="size-3.5 shrink-0" aria-hidden />
            {scopeLabel}
            <PlaceStack places={marks} active={active} />
          </button>
        }
      />
      <PlaceMenu
        title={t("skills.place.which")}
        groups={[
          {
            label: scopeLabel,
            choices: places.map((place) => ({
              id: place.id,
              icon: place.icon,
              label: place.label,
              where: place.where,
              count: place.count,
              checked: place.id === chosen,
            })),
          },
        ]}
        leading={{
          choice: {
            id: "",
            icon: LayersIcon,
            label: t("skills.place.all"),
            where: scopeLabel,
            count: total,
            checked: chosen === null,
          },
          onPick: () => onChoose(null),
        }}
        onPick={(id) => onChoose(id)}
      />
    </DropdownMenu>
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
        closeOnClick={false}
        groups={SCOPES.map((scope) => ({
          label: t(`skills.group.${scope}`),
          choices: writable
            .filter((place) => place.scope === scope)
            .map((place) => ({
              id: place.id,
              icon: place.icon,
              label: t(place.labelKey),
              where: placePath(place),
              checked: holds.some((hold) => hold.id === place.id),
              blocked:
                (place.scope === "workspace" ? blocked : null) ??
                (!holds.some((hold) => hold.id === place.id) &&
                skill.takenAt?.includes(place.id) === true
                  ? t("skills.workspace.taken")
                  : null),
            })),
        })).filter((group) => group.choices.length > 0)}
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
  /** Why a workspace place cannot be written, ready to show; `null` when one can. */
  blocked: string | null
  onInstall: (ref: SkillPlaceRef) => void
  onClear: () => void
}) {
  const { t } = useI18n()
  const places = useReadablePlaces()
  /* A machine-wide place needs no workspace, so only the workspace ones depend
     on there being a folder to write into. */
  const writable = places.filter((place) => place.scope !== "workspace" || blocked === null)

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
          groups={SCOPES.map((scope) => ({
            label: t(`skills.group.${scope}`),
            choices: writable
              .filter((place) => place.scope === scope)
              .map((place) => ({
                id: place.id,
                icon: place.icon,
                label: t(place.labelKey),
                where: placePath(place),
                blocked: place.scope === "workspace" ? blocked : null,
              })),
          })).filter((group) => group.choices.length > 0)}
          onPick={(id) => {
            const place = writable.find((entry) => entry.id === id)
            if (place !== undefined) onInstall({ scope: place.scope, dir: place.dir })
          }}
        />
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
  onInstall: (skill: Skill, ref: SkillPlaceRef) => void
  onAdopt: (skill: Skill, ref: SkillPlaceRef) => void
  onRemove: (skill: Skill, ref: SkillPlaceRef) => void
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
        onInstall={(ref) => {
          for (const skill of skills) {
            if (checked.includes(skillKey(skill))) onInstall(skill, ref)
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
                  onInstall={(ref) => onInstall(skill, ref)}
                  onAdopt={(ref) => onAdopt(skill, ref)}
                  onRemove={(ref) => onRemove(skill, ref)}
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
  const [tab, setTab] = React.useState<SkillTab>("all")
  /* One place inside the current scope, once a person picked one from the tab's
     menu; `null` leaves the scope whole. */
  const [narrowed, setNarrowed] = React.useState<string | null>(null)
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

  /* The places this build reads: every workspace one an enabled integration
     contributes, and the machine-wide ones of the agents the sidebar chose. */
  const places = useReadablePlaces()
  const placeSpecs = React.useMemo(
    () =>
      places.map((place) => ({
        id: place.id,
        labelKey: place.labelKey,
        scope: place.scope,
        dir: place.dir,
      })),
    [places]
  )

  const library = useSkillLibrary(placeSpecs, needle)
  /* A registry plugin answers the search; with none the dialog says so. */
  const registries = useContributions("skillRegistry")
  const registry = registries[0] ?? null
  /* Each scope tab names the places it holds by their marks, so the number of
     them is a count of places rather than of skills; the same list, with what
     each place holds, is what hovering the stack shows. */
  const scopePlaces = React.useMemo(() => {
    const byScope: Record<AssetScope, StackPlace[]> = { workspace: [], global: [] }
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
    }),
    [onTag]
  )

  /* A choice from the tab's menu only means something while the scope it belongs
     to is the one on screen; anywhere else the scope is whole. */
  const chosen =
    narrowed !== null && places.some((place) => place.scope === tab && place.id === narrowed)
      ? narrowed
      : null
  const matching = React.useMemo(
    () => rowsForTab(onTag, tab, chosen),
    [onTag, tab, chosen]
  )

  /* A scope tab holds nothing for one of four reasons, and each needs its own
     words: a workspace the hub cannot read, one holding no skills, a
     machine-wide scope with no agent chosen, or one whose agents hold nothing. */
  const scopeEmpty = ((): { icon: LucideIcon; title: string; hint: string; note: string | null } | null => {
    if (tab === "all" || tab === "library") return null
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

  const install = async (skill: Skill, ref: SkillPlaceRef) => {
    try {
      await library.install(skill.id, ref)
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
  const uninstall = async (skill: Skill, ref: SkillPlaceRef) => {
    try {
      if (skill.linkAt === "library") {
        /* The library linked the skill in; removing its entry takes the link. */
        await (library.store?.remove(skill.id) ?? Promise.resolve())
        await library.reload()
      } else {
        await library.remove(skill.id, ref)
      }
      setRefusal(null)
    } catch (failure) {
      setRefusal(reasonOf(failure))
    }
  }

  /** Link a skill a place wrote into the library. */
  const adopt = async (skill: Skill, ref: SkillPlaceRef) => {
    try {
      await library.adopt(skill.id, ref)
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
  const removePlaceSkill = async (skill: Skill, ref: SkillPlaceRef) => {
    await library.deleteInPlace(skill.id, ref)
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
          setTab(SHELL_TABS.find((item) => item.value === value)?.value ?? "all")
          setPage(0)
          setChecked([])
        }}
        className="flex-1 gap-8"
      >
        <div className="flex items-center justify-between gap-6">
          <TabsList className="h-11! gap-1 rounded-full bg-secondary p-1">
            {SHELL_TABS.map((item) => {
              const scope = item.value === "all" || item.value === "library" ? null : item.value
              const stack = scope === null ? null : scopePlaces[scope]
              const count = counts[item.value as keyof typeof counts]
              const active = tab === item.value
              /* A scope opens through its place list; the shell's own two tabs
                 are screens already and open on the press. */
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
                <PlacePicker
                  key={item.value}
                  scopeIcon={item.icon}
                  scopeLabel={t(item.labelKey)}
                  places={stack}
                  chosen={active ? chosen : null}
                  active={active}
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
        /* Only the workspace places depend on a folder being in use; each row
           decides for itself whether it can be written. */
        blocked={blocked}
        onInstallPlace={(skill, ref) => void install(skill, ref)}
        onRemovePlace={(skill, ref) => void uninstall(skill, ref)}
        onAdopt={(skill, ref) => void adopt(skill, ref)}
        onDelete={removeSkill}
        onDeletePlace={removePlaceSkill}
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
