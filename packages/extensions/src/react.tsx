/**
 * React bindings for the kernel: one provider plus subscription hooks. Kept in
 * a separate entry so the kernel itself carries no UI framework.
 */
import * as React from "react"
import { useSearchParams } from "react-router"
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/shim/with-selector"

import type { Context } from "./cordis.ts"

import { chosenAgentsOf } from "./agents.ts"
import type { Catalog, CatalogState } from "./catalog.ts"
import type { I18nState } from "./i18n.ts"
import type { ExtensionSnapshot } from "./service.ts"
import type { HubSettings } from "./settings.ts"
import type { ContributionMap, ExtensionPointId } from "./types.ts"

const HubContext = React.createContext<Context | null>(null)

/** Nothing to follow when this form provides no workspace list. */
const NO_LISTENERS: (listener: () => void) => () => void = () => () => undefined

/** Provide the composed kernel to the component tree. */
export function HubProvider({
  ctx,
  children,
}: {
  ctx: Context
  children: React.ReactNode
}) {
  return <HubContext.Provider value={ctx}>{children}</HubContext.Provider>
}

/** The kernel context; throws when a component renders outside {@link HubProvider}. */
export function useHub(): Context {
  const ctx = React.useContext(HubContext)
  if (ctx === null) throw new Error("useHub: no HubProvider in the component tree")
  return ctx
}

/** Current catalog state, re-rendering on every enablement or status change. */
export function useExtensionSnapshot(): ExtensionSnapshot {
  const ctx = useHub()
  return React.useSyncExternalStore(
    (onChange) => ctx.on("extensions/changed", onChange),
    () => ctx.extensions.snapshot()
  )
}

/** Every contribution at one point; re-renders when contributors change. */
export function useContributions<P extends ExtensionPointId>(
  point: P
): ContributionMap[P][] {
  const ctx = useHub()
  useExtensionSnapshot()
  return ctx.extensions.contributions(point)
}

/** Contributions one extension makes at one point; re-renders when they change. */
export function useExtensionContributions<P extends ExtensionPointId>(
  id: string,
  point: P
): ContributionMap[P][] {
  const ctx = useHub()
  useExtensionSnapshot()
  return ctx.extensions.contributionsFrom(id, point)
}

/**
 * The agents the sidebar chose, re-rendering when the choice changes.
 *
 * Which agents a person works with is one choice, shared by every library: the
 * modules that read an agent's files filter what they read by this, so a
 * provider nobody chose is not read at all.
 *
 * @returns the chosen integration ids, or an empty list when nothing is chosen
 *   or this form has no workspace list.
 */
export function useChosenAgents(): readonly string[] {
  const ctx = useHub()
  const workspaces = React.useMemo(() => ctx.get("hub.workspaces"), [ctx])
  const subscribe = React.useCallback(
    (listener: () => void) => workspaces?.subscribe(listener) ?? NO_LISTENERS(listener),
    [workspaces]
  )
  const read = React.useCallback(() => chosenAgentsOf(ctx), [ctx])
  return React.useSyncExternalStore(subscribe, read)
}

/** Translation and locale control returned by {@link useI18n}. */
export interface I18n {
  state: I18nState
  t(key: string): string
  setLocale(id: string): void
}

/** Translation and locale control, re-rendering on every locale change. */
export function useI18n(): I18n {
  const ctx = useHub()
  const state = React.useSyncExternalStore(
    (onChange) => ctx.on("i18n/change", onChange),
    () => ctx.i18n.state
  )
  return React.useMemo<I18n>(
    () => ({
      state,
      t: (key) => ctx.i18n.t(key),
      setLocale: (id) => ctx.i18n.setLocale(id),
    }),
    [ctx, state]
  )
}

/**
 * Settings and their control returned by {@link useSettings}.
 */
export interface SettingsControl extends HubSettings {
  set(patch: Partial<HubSettings>): void
}

/** This machine's hub settings, re-rendering on every change. */
export function useSettings(): SettingsControl {
  const ctx = useHub()
  const state = React.useSyncExternalStore(
    (onChange) => ctx.on("settings/change", onChange),
    () => ctx.settings.state
  )
  return React.useMemo<SettingsControl>(
    () => ({
      ...state,
      set: (patch) => ctx.settings.set(patch),
    }),
    [ctx, state]
  )
}

/**
 * The query string the global search writes into a page.
 *
 * A page keeps its filter in the address rather than in a local state so the
 * palette can open the same page already narrowed, even when that page is the
 * one on screen: navigating to `/skills?q=pdf` is a render the page can see,
 * while a local setter in another component is not.
 */
export interface SearchPage {
  /** The text in `?q=`, or an empty string when the page is not searching. */
  query: string
  /** Write the query back; clearing it drops the palette's list request too. */
  setQuery(next: string): void
  /** The palette asked for the list view, where the matched text is marked. */
  listView: boolean
  /** Stop forcing the list view, leaving the page's own choice in charge. */
  clearListView(): void
}

/**
 * Read and write the search parameters a page's filter uses.
 *
 * `replace` is deliberate: one keystroke is one narrowing, not one history
 * entry, and a person pressing Back should leave the page rather than walk
 * their query backwards.
 */
export function useSearchPage(): SearchPage {
  const [params, setParams] = useSearchParams()
  const query = params.get("q") ?? ""
  const listView = params.get("view") === "list"

  const setQuery = React.useCallback(
    (next: string) => {
      setParams(
        (current) => {
          const updated = new URLSearchParams(current)
          if (next === "") {
            updated.delete("q")
            updated.delete("view")
          } else {
            updated.set("q", next)
          }
          return updated
        },
        { replace: true }
      )
    },
    [setParams]
  )

  const clearListView = React.useCallback(() => {
    setParams(
      (current) => {
        if (!current.has("view")) return current
        const updated = new URLSearchParams(current)
        updated.delete("view")
        return updated
      },
      { replace: true }
    )
  }, [setParams])

  return { query, setQuery, listView, clearListView }
}

/**
 * One slice of a catalog, re-rendering when that slice changes and not when the
 * rest of it does.
 *
 * A library of servers is drawn a row at a time, and every row is reading the
 * same catalog: one probe's answer landing must not redraw all of them. So the
 * caller says what it reads, and `isEqual` decides whether what it read is a new
 * value — `Object.is` unless the selector builds a fresh object every time.
 *
 * @param catalog — the library to watch.
 * @param select — the slice, read out of the whole snapshot.
 * @param isEqual — whether two slices are the same; `Object.is` by default.
 * @returns the selected slice, recomputed only when it changes.
 */
export function useCatalog<S, T>(
  catalog: Catalog<S>,
  select: (state: CatalogState<S>) => T,
  isEqual?: (a: T, b: T) => boolean
): T {
  const subscribe = React.useCallback(
    (onChange: () => void) => catalog.subscribe(onChange),
    [catalog]
  )
  const snapshot = React.useCallback(() => catalog.state(), [catalog])
  return useSyncExternalStoreWithSelector(subscribe, snapshot, undefined, select, isEqual)
}
