/**
 * The rows a settings page is built from, shared by the shell's own settings
 * and by the sections plugins contribute there.
 *
 * The shell owns the card and the heading; a row owns how one setting reads.
 * Keeping the row here rather than in the page is what makes a contributed
 * section look like it was always part of the page.
 */
import * as React from "react"

import { Switch } from "@context-hub/shadcn-ui/components/switch"

import { Highlighted } from "./highlight.tsx"

/** One setting's title and explanation, for rows whose control sits below. */
export function SettingText({
  title,
  description,
  needle = "",
}: {
  title: string
  description: string
  /** The query the global search opened this page with, marked where it matched. */
  needle?: string
}) {
  return (
    <span className="flex flex-col gap-1">
      <span className="text-[16px] font-semibold text-foreground">
        <Highlighted text={title} needle={needle} />
      </span>
      <span className="text-[14px] leading-relaxed text-copy">
        <Highlighted text={description} needle={needle} />
      </span>
    </span>
  )
}

/** One setting's title and explanation, for rows whose control sits at the end. */
export function SettingRow({
  title,
  description,
  needle,
  children,
}: {
  title: string
  description: string
  needle?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-8 py-5">
      <SettingText title={title} description={description} needle={needle} />
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/** The pill-shaped two-or-more choice used by settings rows. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { id: T; label: string }[]
  onChange: (id: T) => void
}) {
  return (
    <div className="inline-flex h-11 items-center gap-1 rounded-pill bg-secondary p-1">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={option.id === value}
          onClick={() => onChange(option.id)}
          className={`h-9 rounded-pill px-4 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${
            option.id === value
              ? "bg-background font-semibold text-foreground dark:bg-foreground dark:text-background"
              : "text-copy"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** The switch every settings row draws, so its size and colors stay one rule. */
export function SettingSwitch({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  /** Read out by assistive technology; the row's title is usually the same text. */
  label: string
}) {
  return (
    <Switch
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={label}
      className="h-6! w-11! p-[3px] data-checked:bg-ring data-unchecked:bg-secondary [&_[data-slot=switch-thumb]]:size-[18px]! [&_[data-slot=switch-thumb]]:bg-white! data-checked:[&_[data-slot=switch-thumb]]:translate-x-[20px]!"
    />
  )
}
