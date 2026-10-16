/**
 * The sidebar's two building blocks: a group of rows under its label, and one
 * row. A page, a workspace and an agent are the same 40px row with an 18px
 * leading mark, so the column reads as one list instead of three widgets
 * stacked on top of each other.
 */
import * as React from "react"
import { Link } from "react-router"

import { cn } from "@context-hub/shadcn-ui/lib/utils"

/** A group of rows under the label that names it. */
export function SidebarGroup({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      {/* The label reads #A8ACB3 in both themes, which is the light
          muted-soft token and, on dark, the running-text one. */}
      <div className="flex h-[25px] items-center px-3 text-xs leading-[15px] font-semibold text-muted-soft dark:text-copy">
        {label}
      </div>
      <ul className="flex list-none flex-col gap-1 p-0">{children}</ul>
    </div>
  )
}

/**
 * One row. A row that goes somewhere is a link, which is what a browser and a
 * screen reader expect of navigation; every other row is a button. A row that
 * carries a control of its own — a workspace's ⋯ menu — is a plain element
 * instead, because a button inside a button is neither legal nor reachable.
 */
export function SidebarRow({
  label,
  hint,
  active,
  icon,
  iconWrap,
  trailing,
  expanded,
  href,
  onClick,
}: {
  label: string
  /** What the row points at, shown on hover rather than as a second line. */
  hint?: string | null
  active: boolean
  icon: React.ReactNode
  /** Extra classes for the icon's 18px box — an agent mark sits on a plate. */
  iconWrap?: string
  trailing?: React.ReactNode
  /** Set on a row that reveals and hides the rows under it. */
  expanded?: boolean
  href?: string
  onClick?: () => void
}) {
  const className = cn(
    "group/row flex h-10 w-full items-center gap-2.5 rounded-md px-3 text-left text-sm ring-sidebar-ring outline-hidden transition-colors focus-visible:ring-2",
    active
      ? "bg-sidebar-accent font-semibold text-foreground"
      : "font-medium text-copy hover:bg-sidebar-accent/60"
  )
  const body = (
    <>
      <span
        className={cn("flex size-[18px] shrink-0 items-center justify-center", iconWrap)}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {/* `ReactNode` holds `null` as well as `undefined`, and the row that
          switches its trailing element off passes exactly that — so testing
          only for `undefined` leaves an empty box that still takes a `gap-2.5`
          beside the label. */}
      {trailing === undefined || trailing === null ? null : (
        /* Whatever the row carries answers its own presses: choosing a row and
           opening its menu are two different intentions. */
        <span
          className="flex shrink-0 items-center"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {trailing}
        </span>
      )}
    </>
  )
  const title = hint ?? undefined

  if (href !== undefined) {
    return (
      <li>
        <Link to={href} title={title} className={className}>
          {body}
        </Link>
      </li>
    )
  }

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        title={title}
        aria-expanded={expanded}
        className={className}
        onClick={onClick}
        onKeyDown={(event) => {
          /* Keys belong to the row's own control once the focus is inside it. */
          if (event.target !== event.currentTarget) return
          if (event.key !== "Enter" && event.key !== " ") return
          event.preventDefault()
          onClick?.()
        }}
      >
        {body}
      </div>
    </li>
  )
}
