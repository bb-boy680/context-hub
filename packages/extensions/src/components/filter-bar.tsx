/**
 * The bar that narrows one list: a search box and the row of type chips beside
 * it, which filter the same list and therefore share a line.
 *
 * Which types exist is the caller's business — the chips draw the values they
 * are handed, and the tail folds whatever does not fit — as are the words, so
 * two modules with different vocabularies share one control.
 */
import { SearchIcon, XIcon } from "lucide-react"
import * as React from "react"

import { Kbd } from "@workspace/ui/components/kbd"

/** How many chips show before the rest fold into one `+N` chip. */
const VISIBLE_TAGS = 4

const ROW = "flex min-w-0 flex-wrap items-center gap-3"
const FIELD =
  "flex h-11 w-[300px] max-w-full shrink-0 items-center gap-2 rounded-md border border-border px-3.5 focus-within:border-primary"
const INPUT =
  "min-w-0 flex-1 bg-transparent text-[length:var(--text-body)] outline-none placeholder:text-muted-foreground/70"
/* `min-w-fit` keeps the chips from splitting mid-row: while the whole group
   does not fit beside the field, flex-wrap drops it to the next line intact. */
const CHIPS = "flex min-w-fit shrink-0 grow basis-[280px] flex-wrap items-center gap-2"
const CHIP =
  "flex h-8 shrink-0 items-center justify-center rounded-full px-3.5 text-[length:var(--text-caption)] whitespace-nowrap transition-colors"
const ACTIVE = "bg-foreground font-semibold text-background"
const IDLE = "bg-secondary font-medium text-foreground hover:bg-accent"

/** The words the bar draws; each is the caller's, so a locale can replace it. */
export interface FilterBarWords {
  /** The field's placeholder, which is also its accessible name. */
  search: string
  /** The button that empties the field. */
  clear: string
  /** The chip that widens the list back to every type. */
  all: string
}

/**
 * Draw the bar and report every choice it carries.
 *
 * @param query — what the box holds right now.
 * @param onQuery — the box's next value.
 * @param tags — the chips on offer, in the order the caller lists them.
 * @param tag — the active chip's value, or `all` while no type narrows the list.
 * @param all — the value the "every type" chip carries.
 * @param onTag — the chip a person picked.
 * @param words — the bar's copy, in the caller's locale.
 */
export function FilterBar({
  query,
  onQuery,
  tags,
  tag,
  all,
  onTag,
  words,
}: {
  query: string
  onQuery: (query: string) => void
  tags: readonly string[]
  tag: string
  all: string
  onTag: (tag: string) => void
  words: FilterBarWords
}) {
  const [expanded, setExpanded] = React.useState(false)
  const field = React.useRef<HTMLInputElement>(null)
  const visible = expanded ? tags : tags.slice(0, VISIBLE_TAGS)
  const rest = tags.length - visible.length

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

  const chip = (value: string, label: string) => (
    <button
      key={value}
      type="button"
      aria-pressed={tag === value}
      onClick={() => onTag(value)}
      className={`${CHIP} ${tag === value ? ACTIVE : IDLE}`}
    >
      {label}
    </button>
  )

  return (
    <div className={ROW}>
      <div className={FIELD}>
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
        <input
          ref={field}
          value={query}
          aria-label={words.search}
          placeholder={words.search}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || query === "") return
            event.preventDefault()
            onQuery("")
          }}
          className={INPUT}
        />
        {query === "" ? (
          <Kbd className="shrink-0 border-0 bg-transparent text-muted-foreground">/</Kbd>
        ) : (
          <button
            type="button"
            aria-label={words.clear}
            onClick={() => onQuery("")}
            className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </div>
      <div className={CHIPS}>
        {chip(all, words.all)}
        {visible.map((value) => chip(value, value))}
        {expanded || rest <= 0 ? null : (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className={`${CHIP} bg-secondary font-medium text-muted-foreground hover:bg-accent`}
          >
            +{rest}
          </button>
        )}
      </div>
    </div>
  )
}
