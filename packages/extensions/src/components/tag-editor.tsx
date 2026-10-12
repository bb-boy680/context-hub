/**
 * The row of type chips a record edits: what it carries — each chip with its
 * own remove button — and the chip that opens a field beside the names already
 * in use, where an existing one is a click and a new one is typed.
 *
 * Which names exist belongs to the caller: this row draws the list it is given
 * and reports the values it is handed back, so two modules with different
 * vocabularies share one control. A value a person reads under another name
 * passes `labelFor`.
 */
import { PlusIcon, XIcon } from "lucide-react"
import * as React from "react"

import { Input } from "@workspace/ui/components/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

/** The words the row draws; each is the caller's, so a locale can replace it. */
export interface TagEditorWords {
  /** The trailing chip, which opens the field and the suggestions. */
  add: string
  /** The field's placeholder, which is also its accessible name. */
  placeholder: string
  /** The remove button's name, with `{tag}` standing for the chip's own label. */
  remove: string
}

const CHIP =
  "flex h-6 shrink-0 items-center gap-1 rounded-full bg-secondary pr-[5px] pl-2.5 text-[12px] font-medium text-copy"
const REMOVE =
  "flex size-[15px] items-center justify-center rounded-full bg-foreground/8 text-muted-foreground transition-colors hover:bg-foreground/12 hover:text-foreground"
const TRIGGER =
  "flex h-6 shrink-0 items-center gap-[5px] rounded-full px-2.5 text-[12px] font-medium text-muted-foreground ring-1 ring-muted-soft transition-colors hover:text-foreground hover:ring-foreground/40"
const OPTION =
  "flex h-6 shrink-0 items-center rounded-full bg-secondary px-2.5 text-[12px] font-medium text-copy transition-colors hover:bg-foreground/12"

/**
 * Draw the chips and the panel that edits them.
 *
 * @param tags — the values this record carries, in the order it lists them.
 * @param suggestions — names already in use elsewhere; the ones it carries are
 * left out of the panel.
 * @param words — the row's copy, in the caller's locale.
 * @param onChange — the row's next set of values; an added one goes last.
 * @param labelFor — what a person reads for a stored value; the value itself
 * when omitted.
 */
export function TagEditor({
  tags,
  suggestions,
  words,
  onChange,
  labelFor,
}: {
  tags: readonly string[]
  suggestions: readonly string[]
  words: TagEditorWords
  onChange: (tags: string[]) => void
  labelFor?: (value: string) => string
}) {
  const [value, setValue] = React.useState("")
  const read = (tag: string) => (labelFor === undefined ? tag : labelFor(tag))
  const available = suggestions.filter((tag) => !tags.includes(tag))

  const add = (tag: string) => {
    const next = tag.trim()
    if (next === "" || tags.includes(next)) return
    onChange([...tags, next])
    setValue("")
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span key={tag} className={CHIP}>
          {read(tag)}
          <button
            type="button"
            aria-label={words.remove.replace("{tag}", read(tag))}
            onClick={() => onChange(tags.filter((held) => held !== tag))}
            className={REMOVE}
          >
            <XIcon className="size-[11px]" />
          </button>
        </span>
      ))}
      <Popover>
        <PopoverTrigger
          render={<button type="button" aria-label={words.add} className={TRIGGER} />}
        >
          <PlusIcon className="size-3" />
          {words.add}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-60 gap-2 p-2">
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") add(value)
            }}
            placeholder={words.placeholder}
            aria-label={words.placeholder}
            className="h-8"
          />
          {available.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {available.map((tag) => (
                <button key={tag} type="button" onClick={() => add(tag)} className={OPTION}>
                  {read(tag)}
                </button>
              ))}
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  )
}
