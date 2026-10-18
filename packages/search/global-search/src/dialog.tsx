/**
 * The Ctrl+K palette: one list of rows every module contributed, grouped by the
 * module that offered them.
 *
 * The keyboard, focus trap, overlay, Escape, and scrolling of the selected row
 * belong to the repository's `Command` component (cmdk); this file only decides
 * what the rows are and what selecting one does. Providers search the query
 * themselves — `shouldFilter` is off — so a skill, a setting, and an extension
 * can each answer in the words their page uses.
 */
import * as React from "react"
import { LayoutGridIcon, SearchIcon } from "lucide-react"
import { Command as CommandPrimitive } from "cmdk"
import { useNavigate } from "react-router"

import {
  Highlighted,
} from "@context-hub/extensions/components"
import type {
  ExtensionIcon,
  SearchContribution,
  SearchResult,
} from "@context-hub/extensions"
import {
  useExtensionSnapshot,
  useHub,
  useI18n,
} from "@context-hub/extensions/react"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@context-hub/shadcn-ui/components/command"

/** One row: an avatar when it has one, the module's mark otherwise. */
function ResultRow({
  result,
  provider,
  needle,
}: {
  result: SearchResult
  provider: SearchContribution
  needle: string
}) {
  const [broken, setBroken] = React.useState(false)
  const Icon = result.icon ?? provider.icon
  const showPicture = result.avatar !== undefined && !broken

  return (
    <span className="flex min-w-0 flex-1 items-center gap-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-raised">
        {showPicture ? (
          <img
            src={result.avatar}
            alt=""
            className="size-9 object-cover"
            onError={() => setBroken(true)}
          />
        ) : (
          <Icon className="size-4 text-muted-foreground" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13.5px] leading-4 font-medium">
          <Highlighted text={result.title} needle={needle} />
        </span>
        {result.description === undefined ||
        result.description.trim() === "" ? null : (
          <span className="line-clamp-2 break-words whitespace-pre-line text-xs leading-[15px] text-muted-foreground">
            <Highlighted text={result.description} needle={needle} />
          </span>
        )}
      </span>
    </span>
  )
}

/** One provider's answer; a module that throws is an empty group, not a dead palette. */
function rowsOf(provider: SearchContribution, needle: string): SearchResult[] {
  try {
    return provider.search(needle)
  } catch (error) {
    console.error(`global search: provider "${provider.labelKey}" failed`, error)
    return []
  }
}

/** One module filter under the query field, in the shell's old chip style. */
function FilterChip({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  icon: ExtensionIcon
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-[26px] shrink-0 items-center justify-center gap-1.5 rounded-full border px-2.5 text-[12.5px] whitespace-nowrap transition-colors ${
        active
          ? "border-transparent bg-primary font-semibold text-primary-foreground"
          : "border-border font-medium text-muted-foreground hover:bg-muted"
      }`}
    >
      <Icon className="size-3" />
      {label}
    </button>
  )
}

export function GlobalSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const ctx = useHub()
  const { t } = useI18n()
  const navigate = useNavigate()
  const snapshot = useExtensionSnapshot()
  const providers = React.useMemo(() => {
    /* The catalog rebuilds its list on every snapshot; the revision is what
       says the providers themselves changed. */
    void snapshot.revision
    return ctx.extensions.contributions("search")
  }, [ctx, snapshot.revision])
  const [query, setQuery] = React.useState("")
  const inputRef = React.useRef<HTMLInputElement>(null)
  /* Provider whose chip narrows the current answer, or `null` for all. The
     chip row itself is built from the answer below, so a module with no matched
     rows never gets a chip, and the active one falls back to All. */
  const [active, setActive] = React.useState<string | null>(null)
  /* Providers whose read can land after the palette opened announce it here;
     the count is not read, it only asks React to render again. */
  const [, refresh] = React.useReducer((count: number) => count + 1, 0)

  React.useEffect(() => {
    const stops: (() => void)[] = []
    for (const provider of providers) {
      try {
        const stop = provider.subscribe?.(refresh)
        if (typeof stop === "function") stops.push(stop)
      } catch {
        /* A provider that cannot subscribe still searches on the next key. */
      }
    }
    return () => {
      for (const stop of stops) stop()
    }
  }, [providers])

  const change = React.useCallback(
    (next: boolean) => {
      if (!next) setQuery("")
      onOpenChange(next)
    },
    [onOpenChange]
  )

  const needle = query.trim()
  const results =
    needle === ""
      ? []
      : providers.flatMap((provider) => {
          const rows = rowsOf(provider, needle)
          return rows.length === 0 ? [] : [{ provider, rows }]
        })
  const activeKey =
    active !== null &&
    results.some((group) => group.provider.labelKey === active)
      ? active
      : null
  const groups =
    activeKey === null
      ? results
      : results.filter((group) => group.provider.labelKey === activeKey)
  /* Only the modules the current query actually found get a filter chip. */
  const filterProviders = results.map((group) => group.provider)
  const count = groups.reduce((sum, group) => sum + group.rows.length, 0)
  const hints = [
    t("globalSearch.hint.navigate"),
    t("globalSearch.hint.open"),
    t("globalSearch.hint.close"),
  ]

  return (
    <CommandDialog
      open={open}
      onOpenChange={change}
      title={t("globalSearch.label")}
      description={t("globalSearch.description")}
      className="top-1/2 w-[640px] max-w-[calc(100%-2rem)] -translate-y-1/2 gap-0 overflow-hidden rounded-xl bg-popover p-0 shadow-soft ring-1 ring-border sm:max-w-[640px]"
    >
      <Command shouldFilter={false} loop className="bg-popover p-0">
        {/* The palette's own 52px field; cmdk still owns the input state and
            keyboard, the shell only decides what it looks like. */}
        <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-border px-4">
          <SearchIcon className="size-[17px] shrink-0 text-primary" />
          <CommandPrimitive.Input
            ref={inputRef}
            autoFocus
            aria-label={t("globalSearch.inputLabel")}
            value={query}
            onValueChange={(value) => {
              setQuery(value)
              const next = value.trim()
              /* Without a query there is nothing to narrow; with one, a chip
                 whose module no longer matches falls back to All rather than
                 keeping an invisible filter. */
              if (next === "") {
                setActive(null)
                return
              }
              if (active !== null) {
                const selected = providers.find(
                  (provider) => provider.labelKey === active
                )
                if (selected === undefined || rowsOf(selected, next).length === 0) {
                  setActive(null)
                }
              }
            }}
            placeholder={t("globalSearch.placeholder")}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
          />
          <span className="flex h-[22px] shrink-0 items-center justify-center rounded-[5px] bg-muted px-[7px] font-mono text-[11px] text-muted-foreground">
            Esc
          </span>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-4 py-2.5">
          <FilterChip
            active={activeKey === null}
            icon={LayoutGridIcon}
            label={t("globalSearch.filter.all")}
            onClick={() => {
              setActive(null)
              inputRef.current?.focus()
            }}
          />
          {filterProviders.map((provider) => (
            <FilterChip
              key={provider.labelKey}
              active={provider.labelKey === activeKey}
              icon={provider.icon}
              label={t(provider.labelKey)}
              onClick={() => {
                setActive(provider.labelKey)
                inputRef.current?.focus()
              }}
            />
          ))}
        </div>
        <CommandList className="max-h-[420px] p-2">
          <CommandEmpty className="py-10 text-center text-[13px] text-muted-foreground">
            {needle === ""
              ? t("globalSearch.empty")
              : t("globalSearch.noResults").replace("{query}", needle)}
          </CommandEmpty>
          {groups.map(({ provider, rows }, index) => (
            <CommandGroup
              key={`${provider.labelKey}:${index}`}
              heading={t(provider.labelKey)}
              className="p-0 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:leading-[14px] [&_[cmdk-group-heading]]:font-normal [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase"
            >
              {rows.map((row) => (
                <CommandItem
                  key={`${provider.labelKey}:${row.id}`}
                  value={`${provider.labelKey}:${row.id}`}
                  onSelect={() => {
                    navigate(row.path)
                    change(false)
                  }}
                  className="h-auto items-center gap-2.5 px-2.5 py-2"
                >
                  <ResultRow result={row} provider={provider} needle={needle} />
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
        <div className="flex h-11 shrink-0 items-center gap-4 border-t border-border px-4">
          {hints.map((hint) => (
            <span
              key={hint}
              className="flex h-[22px] items-center justify-center rounded-[5px] bg-muted px-[7px] font-mono text-[11px] whitespace-pre text-muted-foreground"
            >
              {hint}
            </span>
          ))}
          <span className="flex-1" />
          <span className="text-xs text-muted-foreground">
            {needle === ""
              ? ""
              : t("globalSearch.resultCount").replace("{count}", String(count))}
          </span>
        </div>
      </Command>
    </CommandDialog>
  )
}
