/**
 * One list of places, drawn wherever the hub asks "which agent's files?": the
 * scope pill a tab row offers, the menu a row or a batch bar opens, and the
 * panel a detail dialog lists.
 *
 * The places and every action on them belong to the screen that knows them —
 * this module owns the list's chrome, its search, its fold and its rows, so two
 * modules answering the same question cannot drift apart. The words are the
 * caller's too: a list here draws only the strings it is handed.
 */
import {
  CheckIcon,
  ChevronDownIcon,
  LayersIcon,
  SearchIcon,
  XIcon,
} from "lucide-react"
import * as React from "react"

import type { ExtensionIcon } from "../types.ts"

import { AvatarStack, type AvatarMark } from "./avatar-stack.tsx"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

/**
 * Past this many places a menu searches its own list and caps its height. How
 * many agents a person enables is their own business, so the menu has to stay
 * usable at any number of them.
 */
const PLACE_SEARCH_MIN = 8

/** How many places of one scope a detail panel lists before it offers the rest. */
const PLACES_VISIBLE = 8

/** The width both menus share. */
const PANEL = "w-[280px]"

/**
 * Row chrome: a 50px menu row (8px padding around a 34px text column) and the
 * roomier row a detail panel draws, both built on the same 28px tile.
 */
const MENU_ROW = "items-start gap-2.5 py-2"
const MENU_ROW_CONTROL = "items-center gap-2.5 py-2"
const ROW_TILE =
  "flex size-7 shrink-0 items-center justify-center overflow-clip rounded-lg bg-surface-raised ring-1 ring-border ring-inset"
const MENU_NAME = "truncate text-[13.5px] leading-[18px] font-semibold"
const MENU_NOTE =
  "truncate font-mono text-[12px] leading-[16px] text-muted-foreground"
const NOTE = "truncate text-[12px] leading-[16px] text-muted-foreground"
const TALLY = "mt-0.5 shrink-0 font-mono text-[12.5px] text-muted-foreground"
const MENU_GROUP = "text-[11.5px] font-semibold text-muted-soft"
const LIST_ROW = "flex h-14 items-center gap-2.5"
const LIST_NAME = "truncate text-[12.5px] leading-[15px] font-semibold"
const LIST_NOTE =
  "truncate font-mono text-[10.5px] leading-[14px] text-muted-foreground"
const LIST_GROUP =
  "py-0.5 text-[11.5px] leading-[16px] font-semibold text-muted-soft"
const RULE = "h-px shrink-0 bg-border"

/**
 * The fold reads as the sidebar's own fold row: a 40px row with an 18px chevron
 * in the mark column and no tile, since it stands for the rows under it rather
 * than for a place.
 */
const FOLD =
  "flex h-10 w-full items-center gap-2.5 rounded-md pr-3 pl-[5px] text-left text-sm font-medium text-copy outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"

/** One place as every list here offers it: its mark, its name, and where it is. */
export interface PlaceOption extends AvatarMark {
  /** The place's name, resolved in the active locale. */
  label: string
  /** The file or directory it stands for, as a person reads it; drawn monospaced. */
  where?: string
  /** A sentence where `where` would be a path; a row draws one or the other. */
  note?: string
  /** How many assets the place holds; omitted where the list does not count. */
  count?: number | null
  /** Holds what the list is about, so a default row shows its check. */
  selected?: boolean
  /** Why the row cannot be taken right now; nothing when it can. */
  blocked?: string | null
}

/** One named run of places, as their scope names it. */
export interface PlaceGroup {
  label: string
  options: readonly PlaceOption[]
}

/** The words a menu draws itself, translated by the module that owns them. */
export interface PlaceWords {
  /** The search field's placeholder and accessible name. */
  search: string
  /** Clears the search field. */
  searchClear: string
  /** Shown when a search matches nothing. */
  searchEmpty: string
  /** Shown when the list holds no places at all; the search's own words fit a
   * list that has places and a query that matched none. */
  empty?: string
  /** The header's tally, e.g. "12 places". */
  count: (total: number) => string
}

/** The words a folded list draws itself. */
export interface PlaceListWords {
  /** The fold row while the rest is hidden, e.g. "Show 3 more". */
  expand: (rest: number) => string
  /** The fold row once the rest is shown. */
  collapse: string
}

/**
 * A row's own line under its name: the path where the place is a directory, or
 * the sentence a caller supplies where it is a note.
 *
 * @param option — the place whose second line is drawn.
 * @param className — the row's own note class, since a menu and a panel size it.
 */
function PlaceNote({
  option,
  className,
}: {
  option: PlaceOption
  className: string
}) {
  if (option.note !== undefined)
    return <span className={NOTE}>{option.note}</span>
  if (option.where === undefined) return null
  return <span className={className}>{option.where}</span>
}

/**
 * Taking one place, which a row list is for and a control list is not: a menu
 * whose rows carry their own switches has nothing left for the row to do.
 */
type PlacePick =
  | { activation?: "row"; onPick: (id: string) => void }
  | { activation: "control"; onPick?: (id: string) => void }

/**
 * The places a menu lists, as its whole content: a header naming what the list
 * is for, a search field once the list is longer than a glance, and one row per
 * place.
 *
 * It renders the popup itself, so a caller owns only its trigger: put this
 * inside a `DropdownMenu` beside the element that opens it.
 *
 * @param title — what the list is for, e.g. "Install to".
 * @param groups — the places, each run under the scope that names it.
 * @param words — the strings this menu draws, translated by the caller.
 * @param leading — a row above the groups that names the whole list rather than
 * one place; set aside once a search narrows the list.
 * @param closeOnClick — whether taking a place dismisses the menu; several
 * installs in one visit are what a row's own menu is for.
 * @param trailing — what a row's right edge shows: a check where the option is
 * selected, or the caller's own control.
 * @param align — which edge the popup lines up with on its trigger.
 * @param count — the number the header prints; what it counts is the caller's,
 * since a menu may tally places that hold something rather than places.
 */
export function PlaceMenu(
  props: {
    title: string
    groups: readonly PlaceGroup[]
    words: PlaceWords
    leading?: { option: PlaceOption; onPick: () => void }
    closeOnClick?: boolean
    trailing?: "check" | ((option: PlaceOption) => React.ReactNode)
    align?: "start" | "end"
    count?: (all: readonly PlaceOption[]) => number
  } & PlacePick
) {
  const {
    title,
    groups,
    words,
    leading,
    closeOnClick = true,
    trailing = "check",
    activation = "row",
    align = "start",
    count,
  } = props
  const onPick = props.onPick
  const [query, setQuery] = React.useState("")
  const all = groups.flatMap((group) => group.options)
  const searchable = all.length >= PLACE_SEARCH_MIN
  const needle = query.trim().toLowerCase()
  const showing = groups
    .map((group) => ({
      label: group.label,
      options:
        needle === ""
          ? group.options
          : group.options.filter(
              (option) =>
                option.label.toLowerCase().includes(needle) ||
                (option.where ?? option.note ?? "")
                  .toLowerCase()
                  .includes(needle)
            ),
    }))
    .filter((group) => group.options.length > 0)
  const found = showing.reduce((sum, group) => sum + group.options.length, 0)

  const renderRow = (option: PlaceOption, pick: () => void) => {
    const Mark = option.icon
    const blocked = option.blocked ?? null
    /* The tile is 28px and a name is one 18px line: without a note the text
       column is shorter than the tile, and `items-start` would leave the name
       reading high. `min-h-7` lines the two up — and is inert on a row that
       carries a second line, since its own content is then already taller. The
       check follows the same line: on the first of two, or centred on the one. */
    const single = option.note === undefined && option.where === undefined
    const line = (
      <>
        <span className={ROW_TILE}>
          <Mark className="size-4" aria-hidden />
        </span>
        <span
          className={`flex min-w-0 flex-1 flex-col text-left ${single ? "min-h-7 justify-center" : ""}`}
        >
          <span className={MENU_NAME}>{option.label}</span>
          <PlaceNote option={option} className={MENU_NOTE} />
        </span>
        {option.count === undefined ? null : (
          <span className={TALLY}>{option.count ?? "—"}</span>
        )}
        {trailing === "check"
          ? option.selected === true && (
              <CheckIcon className={`size-4 shrink-0 ${single ? "self-center" : "mt-1"}`} />
            )
          : trailing(option)}
      </>
    )

    /* A row that carries its own control cannot also be the action: pressing the
       row would run the caller's pick on a place the person never chose. */
    if (activation === "control") {
      return (
        <div key={option.id} className={`flex ${MENU_ROW_CONTROL}`}>
          {line}
        </div>
      )
    }
    return (
      <DropdownMenuItem
        key={option.id}
        /* Taking one place should not dismiss the menu: an install can go to
           several, and the row just taken shows its check in place. */
        closeOnClick={closeOnClick}
        disabled={blocked !== null}
        title={blocked ?? undefined}
        onClick={pick}
        className={MENU_ROW}
      >
        {line}
      </DropdownMenuItem>
    )
  }
  return (
    <DropdownMenuContent
      align={align}
      sideOffset={6}
      /* A menu drawn in a portal is still a React child of whatever opened it,
         so its clicks bubble to that element's own handler: on a card, choosing
         a place would also open the asset it belongs to. */
      onClick={(event) => event.stopPropagation()}
      /* A searchable menu scrolls its own list, under a field that stays put,
         so the popup itself must not be the scroller. */
      className={`${PANEL} ${searchable ? "overflow-hidden p-0" : ""}`}
    >
      {searchable ? (
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
          <SearchIcon
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <input
            value={query}
            aria-label={words.search}
            placeholder={words.search}
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
              aria-label={words.searchClear}
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
              {words.count(count === undefined ? all.length : count(all))}
            </span>
          </DropdownMenuLabel>
          {/* A row that names the whole list is the answer to no query, so a
             search sets it aside. */}
          {leading !== undefined && needle === ""
            ? renderRow(leading.option, leading.onPick)
            : null}
          {showing.map((group, index) => (
            <React.Fragment key={group.label}>
              {/* Two groups are two different answers — a directory this hub was
                  pointed at, and a machine-wide one — so a rule keeps them
                  apart. The first needs none. */}
              {index === 0 ? null : <DropdownMenuSeparator />}
              <DropdownMenuLabel className={MENU_GROUP}>
                {group.label}
              </DropdownMenuLabel>
              {group.options.map((option) =>
                renderRow(option, () => onPick?.(option.id))
              )}
            </React.Fragment>
          ))}
        </DropdownMenuGroup>
        {found === 0 ? (
          <p className="px-2 py-3 text-center text-[12.5px] text-muted-foreground">
            {all.length === 0
              ? (words.empty ?? words.searchEmpty)
              : words.searchEmpty}
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
 *
 * @param scopeIcon — the scope's own mark.
 * @param scopeLabel — the scope's own name, which the menu's first row takes whole.
 * @param places — the places of this scope, with what each holds.
 * @param chosen — the place it is narrowed to; `null` while it is whole.
 * @param active — whether this scope is the one on screen.
 * @param allLabel — the leading row's words, naming the whole scope.
 * @param title — what the menu is for.
 * @param words — the strings the menu draws.
 * @param onChoose — taking one place, or the whole scope for `null`.
 */
export function PlaceScopePicker({
  scopeIcon: ScopeIcon,
  scopeLabel,
  places,
  chosen,
  active,
  allLabel,
  title,
  words,
  onChoose,
}: {
  scopeIcon: ExtensionIcon
  scopeLabel: string
  places: readonly PlaceOption[]
  chosen: string | null
  active: boolean
  allLabel: string
  title: string
  words: PlaceWords
  onChoose: (id: string | null) => void
}) {
  /* Narrowed to one place, the marks are that one place's. */
  const marks =
    chosen === null ? places : places.filter((place) => place.id === chosen)
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
            {/* The marks sit on the trough, or on the ink fill once this pill is
               the scope on screen, so the seam takes whichever is behind it. */}
            <AvatarStack
              marks={marks}
              seam={active ? "ring-foreground dark:ring-accent" : "ring-secondary"}
            />
          </button>
        }
      />
      <PlaceMenu
        title={title}
        words={words}
        groups={[
          {
            label: scopeLabel,
            options: places.map((place) => ({
              ...place,
              selected: place.id === chosen,
            })),
          },
        ]}
        leading={{
          option: {
            id: "",
            icon: LayersIcon,
            label: allLabel,
            where: scopeLabel,
            count: total,
            selected: chosen === null,
          },
          onPick: () => onChoose(null),
        }}
        onPick={(id) => onChoose(id)}
      />
    </DropdownMenu>
  )
}

/**
 * Every place of one scope, listed flat, for the panel a detail dialog shows:
 * the rows a menu draws at the roomier measurements a panel has, with the
 * caller's own control at each row's right edge. A group holding more places
 * than the panel can show beside what it describes folds behind one row.
 *
 * It renders the rows alone, as `<li>`s, so the caller owns the list around them
 * and whatever else that list holds.
 *
 * @param groups — the places, each run under the scope that names it.
 * @param words — the fold's own words.
 * @param action — what a row's right edge shows, e.g. install or remove.
 * @param visibleCount — how many rows of one group stay visible before the fold.
 */
export function PlaceList({
  groups,
  words,
  action,
  visibleCount = PLACES_VISIBLE,
}: {
  groups: readonly PlaceGroup[]
  words: PlaceListWords
  action?: (option: PlaceOption) => React.ReactNode
  visibleCount?: number
}) {
  /* Each scope folds on its own: the machine-wide list grows with every agent a
     person enables, while a workspace holds only the places this hub knows. */
  const [unfolded, setUnfolded] = React.useState<readonly string[]>([])
  const fold = (label: string) =>
    setUnfolded((current) =>
      current.includes(label)
        ? current.filter((one) => one !== label)
        : [...current, label]
    )

  return (
    <>
      {groups
        .filter((group) => group.options.length > 0)
        .map((group, index) => {
          const open = unfolded.includes(group.label)
          const rest = group.options.length - visibleCount
          const shown =
            open || rest <= 0
              ? group.options
              : group.options.slice(0, visibleCount)
          return (
            <React.Fragment key={group.label}>
              {/* Two groups are two different answers — a directory this hub was
                  pointed at, and a machine-wide one — so a rule keeps them
                  apart. The first needs none. */}
              {index === 0 ? null : <li aria-hidden className={RULE} />}
              <li className={LIST_GROUP}>{group.label}</li>
              {shown.map((option) => {
                const Mark = option.icon
                return (
                  <li key={option.id} className={LIST_ROW}>
                    <span className={ROW_TILE}>
                      <Mark className="size-4" aria-hidden />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className={LIST_NAME}>{option.label}</span>
                      <PlaceNote option={option} className={LIST_NOTE} />
                    </span>
                    {action?.(option)}
                  </li>
                )
              })}
              {rest <= 0 ? null : (
                <li>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => fold(group.label)}
                    className={FOLD}
                  >
                    <span className="flex size-[18px] shrink-0 items-center justify-center">
                      <ChevronDownIcon
                        className={`size-[18px] shrink-0 transition-transform ${
                          open ? "rotate-180" : ""
                        }`}
                        aria-hidden
                      />
                    </span>
                    {open ? words.collapse : words.expand(rest)}
                  </button>
                </li>
              )}
            </React.Fragment>
          )
        })}
    </>
  )
}
