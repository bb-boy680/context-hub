/**
 * The scope control the tab row offers: one pill holding a scope's name and the
 * marks of the places it stands for, which opens the list of places when
 * pressed.
 *
 * This is the skills page's control, kept the same on purpose — the two pages
 * answer the same question ("which agent's files?") and a person should not have
 * to learn it twice. Only the words differ: everything here reads `mcp.place.*`
 * and `mcp.detail.place.count`.
 */
import { CheckIcon, LayersIcon, SearchIcon, XIcon } from "lucide-react"
import * as React from "react"

import type { ExtensionIcon } from "@workspace/extensions"
import { useI18n } from "@workspace/extensions/react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

/** The 20px tile and the 13px step the tab row's icon stacks are drawn at. */
const STACK_TILE = 20
const STACK_STEP = 13

/** Past this many places a stack keeps the first few and counts the rest. */
const STACK_MAX = 5

/**
 * Past this many places a scope's menu searches its own list and caps its
 * height. How many agents a person enables is their own business, so the menu
 * has to stay usable at any number of them.
 */
const PLACE_SEARCH_MIN = 8

/** One place a scope tab stands for, as its stack and its menu name it. */
export interface StackPlace {
  id: string
  icon: ExtensionIcon
  /** The place's name, which is its client's name. */
  label: string
  /** The file as a person reads it. */
  where: string
  /** How many servers that place declares; `null` when it could not be read. */
  count: number | null
}

/** One place as a menu offers it. */
interface PlaceChoice {
  id: string
  icon: ExtensionIcon
  label: string
  where: string
  checked?: boolean
  /** Why the row cannot be taken right now; nothing when it can. */
  blocked?: string | null
  /** How many servers the place declares; omitted where the menu does not count. */
  count?: number | null
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

/**
 * The places a menu lists, as its whole content: a header naming what the list
 * is for, a search field once the list is longer than a glance, and one row per
 * place.
 */
function PlaceMenu({
  title,
  groups,
  leading,
  closeOnClick = true,
  onPick,
}: {
  /** What the list is for, e.g. "Location". */
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
        {choice.count === undefined ? null : <span className={tally}>{choice.count ?? "—"}</span>}
        {choice.checked === true ? <CheckIcon className="mt-1 size-4 shrink-0" /> : null}
      </DropdownMenuItem>
    )
  }

  return (
    <DropdownMenuContent
      align="start"
      sideOffset={6}
      /* A menu drawn in a portal is still a React child of whatever opened it,
         so its clicks bubble to that element's own handler. */
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
            aria-label={t("mcp.place.search")}
            placeholder={t("mcp.place.search")}
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
              aria-label={t("mcp.place.searchClear")}
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
              {t("mcp.detail.place.count").replace("{count}", String(all.length))}
            </span>
          </DropdownMenuLabel>
          {/* A row that names the whole list is the answer to no query, so a
             search sets it aside. */}
          {leading !== undefined && needle === "" ? renderRow(leading.choice, leading.onPick) : null}
          {showing.map((group, index) => (
            <React.Fragment key={group.label}>
              {/* The rule keeps the scope's whole-list row apart from its own
                  places; the first group needs none. */}
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
            {t("mcp.place.searchEmpty")}
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
export function PlacePicker({
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
        title={t("mcp.place.which")}
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
            label: t("mcp.place.all"),
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
