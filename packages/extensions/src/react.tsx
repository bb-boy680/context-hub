/**
 * React bindings for the kernel: one provider plus subscription hooks. Kept in
 * a separate entry so the kernel itself carries no UI framework.
 */
import * as React from "react"

import type { Context } from "./cordis.ts"

import type { I18nState } from "./i18n.ts"
import type { ExtensionSnapshot } from "./service.ts"
import type { ContributionMap, ExtensionPointId } from "./types.ts"

const HubContext = React.createContext<Context | null>(null)

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
