/**
 * The one thing a prompt card offers: taking it somewhere.
 *
 * A prompt has no switch — nothing loads it or unloads it — so the only choice
 * a row presents is *which agent* gets it, and then *as what*. That second
 * question is small and belongs to the row it is asked about, so each agent
 * inside the menu carries its own `⋯` and the three ways of writing a prompt
 * hang off that. A place whose agent reads no instruction file simply has two
 * of the three, because the place says so rather than the menu deciding it.
 *
 * Both menus live in a portal while staying React children of the card they sit
 * on, so their clicks stop at their own row: without that, opening the menu
 * would also open the prompt.
 */
import { CheckIcon, ChevronDownIcon, DownloadIcon, MoreHorizontalIcon } from "lucide-react"

import type { PlaceFiles } from "@workspace/core/place-files"
import { PlaceMenu, type PlaceGroup, type PlaceOption, type PlaceWords } from "@workspace/extensions/components"
import { useI18n } from "@workspace/extensions/react"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

import type { Delivery } from "./deliver.ts"
import type { Installed } from "./library.ts"
import type { PromptPlace } from "./provider.ts"
import type { Prompt } from "./store.ts"

/** The scopes, in the order a list of places reads them. */
const SCOPES = ["workspace", "global"] as const

/** The button shape this cluster's trigger wears, matching the other asset pages. */
const shell =
  "h-8 gap-1.5 rounded-full px-3 text-[13px] font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"

/** The `⋯` that opens one agent's own actions; sized to the row it sits in. */
const MORE =
  "flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"

/**
 * The one mark a submenu trigger draws for itself, hidden here.
 *
 * A chevron pointing right is the affordance of a text row that opens a nested
 * menu; this trigger is a 28px icon button, and a second arrow inside it says
 * nothing the `⋯` has not already said. Hiding it is the only way to keep the
 * shared trigger's own keyboard and hover behaviour.
 */
const NO_CHEVRON = "[&>svg:last-child]:hidden"

/**
 * One agent's own ways of writing a prompt out.
 *
 * A submenu rather than three more rows in the list above it: the list is about
 * *where*, and these are about *what*, and the two questions have different
 * answers at every row.
 */
function PlaceMore({
  place,
  onGenerate,
}: {
  place: PromptPlace
  onGenerate: (place: PromptPlace, action: Delivery) => void
}) {
  const { t } = useI18n()

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger
        render={
          <button
            type="button"
            aria-label={`${t("prompts.action.more")} · ${t(place.labelKey)}`}
            /* The row underneath is itself an action — pressing it installs —
               so a press here has to stop before it reaches that. */
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            className={`${MORE} ${NO_CHEVRON}`}
          />
        }
      >
        <MoreHorizontalIcon className="size-4" />
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        className="w-[210px]"
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenuItem onClick={() => onGenerate(place, "commands")}>
          {t("prompts.menu.commands")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onGenerate(place, "rule")}>
          {t("prompts.menu.rule")}
        </DropdownMenuItem>
        {/* The action appears because the place declares an instruction file.
            A menu that decided it per agent would be a list of agents to keep
            in step, which is the thing this registry exists to avoid. */}
        {place.instructionFile === undefined ? null : (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onGenerate(place, "instructions")}>
              {t("prompts.menu.instructions")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

/**
 * The list itself: one row per agent that takes prompts, under the scope that
 * names its root, with both of a row's actions hanging off it.
 *
 * It renders the popup, so a caller owns only the trigger that opens it — the
 * page's card and its batch strip ask the same question of the same places and
 * must not be able to answer it differently.
 *
 * @param places — every agent place a delivery can go to.
 * @param installed — which of them already hold what is being sent.
 * @param files — the form's client-file port; `null` makes every row say so.
 * @param words — the strings this menu draws, in the active locale.
 * @param onPick — deliver what is being sent into a place.
 * @param onGenerate — write one of the three derived forms into a place.
 */
function PlaceChoices({
  places,
  installed,
  files,
  words,
  onPick,
  onGenerate,
}: {
  places: readonly PromptPlace[]
  installed: Installed
  files: PlaceFiles | null
  words: PlaceWords
  onPick: (place: PromptPlace) => void
  onGenerate: (place: PromptPlace, action: Delivery) => void
}) {
  const { t } = useI18n()

  const options: PlaceOption[] = places.map((place) => ({
    id: place.id,
    icon: place.icon,
    label: t(place.labelKey),
    /* The directory the row writes into, which is what tells an agent's two
       places apart: they are the same name under two different roots. */
    where: place.commandDir,
    selected: installed[place.id] === true,
    blocked: files === null ? t("prompts.menu.blocked") : null,
  }))
  const byId = new Map(places.map((place) => [place.id, place]))

  const groups: PlaceGroup[] = SCOPES.map((scope) => ({
    label: t(`prompts.group.${scope}`),
    options: options.filter((option) => byId.get(option.id)?.scope === scope),
  })).filter((group) => group.options.length > 0)

  return (
    <PlaceMenu
      title={t("prompts.menu.installTo")}
      align="end"
      /* Installing can go to several agents, and the row just taken shows its
         tick in place, so the menu stays up. */
      closeOnClick={false}
      words={words}
      groups={groups}
      trailing={(option) => {
        const place = byId.get(option.id)
        if (place === undefined) return null
        /* A row carries two things once it is taken: the mark saying so, and
           the button for this agent's own actions. A trailing node replaces
           the tick the list draws by default rather than joining it, so the
           tick is drawn here — `mt-1` is the list's own offset, since every
           row of this menu carries the directory as its second line. */
        return (
          <span className="flex shrink-0 items-center gap-1">
            {option.selected === true ? <CheckIcon className="mt-1 size-4 shrink-0" /> : null}
            <PlaceMore place={place} onGenerate={onGenerate} />
          </span>
        )
      }}
      onPick={(id) => {
        const place = byId.get(id)
        if (place !== undefined) onPick(place)
      }}
    />
  )
}

/** The words every list of places in this module draws. */
function usePlaceWords(): PlaceWords {
  const { t } = useI18n()
  return {
    search: t("prompts.place.search"),
    searchClear: t("prompts.place.searchClear"),
    searchEmpty: t("prompts.place.searchEmpty"),
    empty: t("prompts.place.none"),
    count: (total) => t("prompts.location.count").replace("{count}", String(total)),
  }
}

/**
 * What one prompt's card and the lightbox footer offer: taking this prompt
 * somewhere.
 *
 * @param prompt — the prompt being delivered.
 * @param places — every agent place it can go to.
 * @param installed — which of them already hold it, read from the files.
 * @param files — the form's client-file port; `null` makes every row say so.
 * @param busy — a delivery is in flight; the trigger waits.
 * @param onToggle — install into a place, or take it back out of one.
 * @param onGenerate — write one of the three derived forms into a place.
 */
export function PromptActions({
  prompt,
  places,
  installed,
  files,
  busy,
  onToggle,
  onGenerate,
}: {
  prompt: Prompt
  places: readonly PromptPlace[]
  installed: Installed
  files: PlaceFiles | null
  busy: boolean
  onToggle: (place: PromptPlace) => void
  onGenerate: (place: PromptPlace, action: Delivery) => void
}) {
  const { t } = useI18n()
  const words = usePlaceWords()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            aria-label={`${t("prompts.action.install")} ${prompt.description}`}
            onClick={(event) => event.stopPropagation()}
            className={shell}
          />
        }
      >
        <DownloadIcon className="size-3.5" />
        {t("prompts.action.install")}
        <ChevronDownIcon className="size-3" />
      </DropdownMenuTrigger>
      <PlaceChoices
        places={places}
        installed={installed}
        files={files}
        words={words}
        onPick={onToggle}
        onGenerate={onGenerate}
      />
    </DropdownMenu>
  )
}

/**
 * What the batch strip offers: taking every ticked prompt to one place.
 *
 * It is the same list of the same places, with the same two actions per row —
 * so a prompt can be installed to an agent in bulk exactly as it can be one at
 * a time, without the two drifting apart. Nothing here reads a tick state: a
 * batch is a run of writes, not a place a set of prompts does or does not sit
 * in, and a half-installed set has no single answer to show.
 *
 * @param count — how many prompts are ticked, for the trigger's own label.
 * @param places — every agent place the ticked prompts can go to.
 * @param files — the form's client-file port.
 * @param busy — a delivery is in flight.
 * @param onDeliver — send the ticked prompts into a place.
 * @param onGenerate — write one of the three derived forms for each of them.
 */
export function BatchActions({
  count,
  places,
  files,
  busy,
  onDeliver,
  onGenerate,
}: {
  count: number
  places: readonly PromptPlace[]
  files: PlaceFiles | null
  busy: boolean
  onDeliver: (place: PromptPlace) => void
  onGenerate: (place: PromptPlace, action: Delivery) => void
}) {
  const { t } = useI18n()
  const words = usePlaceWords()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            disabled={busy || count === 0}
            aria-label={t("prompts.action.install")}
            onClick={(event) => event.stopPropagation()}
            className={`${shell} border-border bg-transparent px-4 dark:border-input dark:bg-transparent`}
          />
        }
      >
        <DownloadIcon className="size-3.5" />
        {t("prompts.action.install")}
        <ChevronDownIcon className="size-3" />
      </DropdownMenuTrigger>
      <PlaceChoices
        places={places}
        /* A batch has no tick to show: what is ticked is not what any one place
           holds, and marking a row would claim something untrue of the set. */
        installed={{}}
        files={files}
        words={words}
        onPick={onDeliver}
        onGenerate={onGenerate}
      />
    </DropdownMenu>
  )
}
