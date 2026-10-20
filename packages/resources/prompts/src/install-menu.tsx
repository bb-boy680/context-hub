/**
 * The one thing a prompt card offers: taking it somewhere.
 *
 * A prompt has no switch — nothing loads it or unloads it — so the only choice
 * a row presents is *which agent* gets it, and then *as what*. That second
 * question belongs to the row it is asked about, so every place inside the menu
 * carries its own `⋯`, and the menu behind it is the same one the detail panel
 * opens: installing, removing what is there, and writing the derived forms.
 *
 * The menu lives in a portal while staying a React child of the card it sits
 * on, so its clicks stop at their own row: without that, opening the menu would
 * also open the prompt.
 */
import { CheckIcon, ChevronDownIcon, DownloadIcon, EllipsisIcon } from "lucide-react"

import type { PlaceFiles } from "@context-hub/core/place-files"
import { PlaceMenu, type PlaceGroup, type PlaceOption, type PlaceWords } from "@context-hub/extensions/components"
import { useI18n } from "@context-hub/extensions/react"
import { Button } from "@context-hub/shadcn-ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@context-hub/shadcn-ui/components/dropdown-menu"

import { generatedUnder, holdsSomething, NOTHING_HELD, type Delivery, type Held } from "./deliver.ts"
import type { Holds } from "./library.ts"
import type { PromptPlace } from "./provider.ts"
import type { Prompt } from "./store.ts"

/** The scopes, in the order a list of places reads them. */
const SCOPES = ["workspace", "global"] as const

/**
 * The shape of a button on a card's action row, matching the other asset pages.
 * Exported because the row's other button is drawn by the page, and the two
 * stand side by side: one literal, so they cannot drift apart.
 */
export const cardActionShell =
  "h-8 gap-1.5 rounded-full px-3 text-[13px] font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"

/**
 * Writing one form out, or taking back what is there.
 *
 * @param remove — true when the entry was offered as a removal, which is the
 * only thing that tells the two apart once the menu has closed.
 */
export type DeliveryRun = (
  place: PromptPlace,
  action: Delivery,
  document?: string,
  remove?: boolean
) => void

/**
 * One place's own ways of writing a prompt out — or taking one back, where it
 * is already there.
 *
 * The files a prompt becomes, and then one entry for every document this place
 * says it keeps. A place that declares no agents directory or no documents
 * simply has fewer entries, rather than being offered an action that would
 * fail.
 *
 * The list is about *where*, and these are about *what*: the two questions have
 * different answers at every row, which is why they are not more rows of it.
 */
export function GenerateItems({
  place,
  held,
  disabled = false,
  onGenerate,
}: {
  place: PromptPlace
  held: Held
  /** A form that cannot reach the files says so here, rather than refusing. */
  disabled?: boolean
  onGenerate: DeliveryRun
}) {
  const { t } = useI18n()
  const documents = place.documents ?? []

  return (
    <>
      <DropdownMenuItem
        disabled={disabled}
        variant={held.commands ? "destructive" : "default"}
        onClick={() => onGenerate(place, "commands", undefined, held.commands)}
      >
        {t(held.commands ? "prompts.menu.commands.remove" : "prompts.menu.commands")}
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={disabled}
        variant={held.rule ? "destructive" : "default"}
        onClick={() => onGenerate(place, "rule", undefined, held.rule)}
      >
        {t(held.rule ? "prompts.menu.rule.remove" : "prompts.menu.rule")}
      </DropdownMenuItem>
      {/* The agents file appears because the place declares a directory for it. */}
      {place.agentDir === undefined ? null : (
        <DropdownMenuItem
          disabled={disabled}
          variant={held.agent ? "destructive" : "default"}
          onClick={() => onGenerate(place, "agent", undefined, held.agent)}
        >
          {t(held.agent ? "prompts.menu.agent.remove" : "prompts.menu.agent")}
        </DropdownMenuItem>
      )}
      {/* The entries that follow exist because the place declares the files
          they write — and a removal only where the place names a word for it. */}
      {documents.length === 0 ? null : (
        <>
          <DropdownMenuSeparator />
          {documents.map((document) => {
            const removable =
              held.documents.includes(document.id) && document.removeLabelKey !== undefined
            return (
              <DropdownMenuItem
                key={document.id}
                disabled={disabled}
                variant={removable ? "destructive" : "default"}
                onClick={() => onGenerate(place, "instructions", document.id, removable)}
              >
                {t(removable ? (document.removeLabelKey ?? document.labelKey) : document.labelKey)}
              </DropdownMenuItem>
            )
          })}
        </>
      )}
    </>
  )
}

/**
 * Everything one place's row can do, behind the single control it carries.
 *
 * The row itself is not an action — it names a place, and the list beside it
 * says what that place is — so every action is in this menu. The card and the
 * detail panel open this same component, which is what keeps them telling one
 * story about the same place.
 */
export function PlaceGenerate({
  place,
  held,
  busy,
  files,
  onGenerate,
}: {
  place: PromptPlace
  held: Held
  busy: boolean
  files: PlaceFiles | null
  onGenerate: DeliveryRun
}) {
  const { t } = useI18n()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            disabled={busy}
            aria-label={`${t("prompts.action.more")} · ${t(place.labelKey)}`}
            className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          />
        }
      >
        <EllipsisIcon className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        /* The app's own menu chrome, as the sidebar draws its row menus: the
           surface, the hairline and the row rhythm are one house style, so a
           menu here reads as a menu anywhere else in the app. */
        className="flex w-[200px] flex-col gap-0.5 rounded-md p-1.5 ring-1 ring-border shadow-soft"
        onClick={(event) => event.stopPropagation()}
      >
        <GenerateItems
          place={place}
          held={held}
          disabled={busy || files === null}
          onGenerate={onGenerate}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * The places a prompt can be taken to, grouped by scope, one `⋯` per place.
 *
 * The row is a name and its directory, not a button: every action belongs to
 * the place's own menu, and the panel and the card open the same one.
 *
 * @param places — every agent place a delivery can go to.
 * @param holds — what each of them already holds of what is being sent.
 * @param files — the form's client-file port; `null` makes every entry say so.
 * @param words — the strings this menu draws, in the active locale.
 * @param countHolds — whether the header counts the places already holding it,
 * rather than the places themselves.
 * @param onGenerate — write or take back one of the forms; a document's id says
 * which file a section goes into.
 */
function PlaceChoices({
  places,
  holds,
  files,
  words,
  countHolds,
  onGenerate,
}: {
  places: readonly PromptPlace[]
  holds: Holds
  files: PlaceFiles | null
  words: PlaceWords
  countHolds: boolean
  onGenerate: DeliveryRun
}) {
  const { t } = useI18n()

  const options: PlaceOption[] = places.map((place) => ({
    id: place.id,
    icon: place.icon,
    label: t(place.labelKey),
    /* The line under the name is whichever of the two answers the row cannot
       give by its name. A place that is only a directory has no name to
       recognise, so it gives the root its forms land under; an agent's name
       says what it is, so it explains what its `⋯` is for instead. */
    ...(place.generatedOnly === true
      ? { where: generatedUnder(place) }
      : { note: t("prompts.place.generates") }),
    selected: holdsSomething(holds[place.id]),
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
      /* A row carries its own menu, so the row is not the action. */
      activation="control"
      words={words}
      groups={groups}
      {...(countHolds
        ? { count: (all: readonly PlaceOption[]) => all.filter((one) => one.selected === true).length }
        : {})}
      trailing={(option) => {
        const place = byId.get(option.id)
        if (place === undefined) return null
        /* A trailing node replaces the check the list draws by default rather
           than joining it, so the check is drawn here too — `mt-1` is the list's
           own offset, since every row carries the directory as its second line. */
        return (
          <span className="flex shrink-0 items-center gap-1">
            {option.selected === true ? <CheckIcon className="mt-1 size-4 shrink-0" /> : null}
            <PlaceGenerate
              place={place}
              held={holds[place.id] ?? NOTHING_HELD}
              busy={false}
              files={files}
              onGenerate={onGenerate}
            />
          </span>
        )
      }}
    />
  )
}

/** The words every list of places in this module draws. */
export function usePlaceWords(): PlaceWords {
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
 * @param holds — what each of them already holds of it, read from the files.
 * @param files — the form's client-file port; `null` makes every row say so.
 * @param busy — a delivery is in flight; the trigger waits.
 * @param onGenerate — write or take back one of the forms; a document's id says
 *   which file a section goes into.
 */
export function PromptActions({
  prompt,
  places,
  holds,
  files,
  busy,
  onGenerate,
}: {
  prompt: Prompt
  places: readonly PromptPlace[]
  holds: Holds
  files: PlaceFiles | null
  busy: boolean
  onGenerate: DeliveryRun
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
            className={cardActionShell}
          />
        }
      >
        <DownloadIcon className="size-3.5" />
        {t("prompts.action.install")}
        <ChevronDownIcon className="size-3" />
      </DropdownMenuTrigger>
      <PlaceChoices
        places={places}
        holds={holds}
        files={files}
        words={words}
        countHolds
        onGenerate={onGenerate}
      />
    </DropdownMenu>
  )
}

/**
 * What the batch strip offers: writing the ticked prompts out into one place.
 *
 * It is the same list of the same places, with the same menu per row, so a run
 * of prompts can be written out in bulk exactly as one can. Nothing here reads
 * a held state: a batch is a run of writes, not a place a set of prompts does or
 * does not sit in, and a half-written set has no single answer to show — which
 * is why every entry here writes, and none removes.
 *
 * @param count — how many prompts are ticked, for the trigger's own label.
 * @param places — every agent place the ticked prompts can go to.
 * @param files — the form's client-file port.
 * @param busy — a delivery is in flight.
 * @param onGenerate — write one of the forms for each of the ticked prompts.
 */
export function BatchActions({
  count,
  places,
  files,
  busy,
  onGenerate,
}: {
  count: number
  places: readonly PromptPlace[]
  files: PlaceFiles | null
  busy: boolean
  onGenerate: DeliveryRun
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
            className={`${cardActionShell} border-border bg-transparent px-4 dark:border-input dark:bg-transparent`}
          />
        }
      >
        <DownloadIcon className="size-3.5" />
        {t("prompts.action.install")}
        <ChevronDownIcon className="size-3" />
      </DropdownMenuTrigger>
      <PlaceChoices
        places={places}
        /* A batch has no held state to show: what is ticked is not what any one
           place holds, and marking a row would claim something untrue. */
        holds={{}}
        files={files}
        words={words}
        countHolds={false}
        onGenerate={onGenerate}
      />
    </DropdownMenu>
  )
}
