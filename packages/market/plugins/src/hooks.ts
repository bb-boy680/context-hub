/**
 * The page's two reads: which sources are registered, and what each one says.
 *
 * The registry is subscribed through React's own external-store hook, so
 * enabling or disabling a source extension redraws the rail and the directory
 * without the page asking again. The catalog is read once per round, with a
 * failed source kept apart from the ones that answered.
 */
import * as React from "react"

import { useHub } from "@context-hub/extensions/react"
import type { PluginRecord } from "@context-hub/plugins"

import { listLibraryRecords } from "./apis/library.ts"
import { MARKET_SOURCE_SERVICE, type MarketEntry, type MarketSource } from "./contract.ts"

export type SourceStatus = "loading" | "ready" | "failed"

/** One source as the page draws it. */
export interface SourceRead {
  source: MarketSource
  status: SourceStatus
  entries: readonly MarketEntry[]
  /** The source's own words, when it failed. */
  error?: string
}

/** What one round of reading keeps for one source. */
interface HeldRead {
  status: "ready" | "failed"
  entries: MarketEntry[]
  error?: string
  round: number
}

/** The answer for a form whose page extension is not loaded. */
const NO_SOURCES: readonly MarketSource[] = []

/** Every source the kernel has registered, in registration order. */
export function useMarketSources(): readonly MarketSource[] {
  const ctx = useHub()
  const registry = React.useMemo(() => ctx.get(MARKET_SOURCE_SERVICE) ?? null, [ctx])
  return React.useSyncExternalStore(
    React.useCallback(
      (onChange: () => void) => registry?.subscribe(onChange) ?? (() => undefined),
      [registry]
    ),
    React.useCallback(() => registry?.sources() ?? NO_SOURCES, [registry])
  )
}

/**
 * Read every registered source, and read again on request.
 *
 * A round is the unit a refresh or a retry starts: every source is asked, and
 * until its answer for this round arrives it reads as loading. A source that
 * failed keeps its failure visible, while the others carry on.
 */
export function useMarketCatalog(sources: readonly MarketSource[]): {
  reads: readonly SourceRead[]
  refresh: () => void
  busy: boolean
} {
  const [held, setHeld] = React.useState<Record<string, HeldRead>>({})
  const [round, setRound] = React.useState(0)

  React.useEffect(() => {
    if (sources.length === 0) return
    let live = true
    for (const source of sources) {
      Promise.resolve()
        .then(() => source.list({ refresh: round > 0 }))
        .then((entries) => {
          if (!live) return
          setHeld((current) => ({
            ...current,
            [source.id]: { status: "ready", entries, round },
          }))
        })
        .catch((error: unknown) => {
          if (!live) return
          setHeld((current) => ({
            ...current,
            [source.id]: {
              status: "failed",
              entries: [],
              error: error instanceof Error ? error.message : String(error),
              round,
            },
          }))
        })
    }
    return () => {
      live = false
    }
  }, [sources, round])

  const reads = React.useMemo(
    () =>
      sources.map((source): SourceRead => {
        const read = held[source.id]
        if (read === undefined || read.round !== round) {
          return { source, status: "loading", entries: [] }
        }
        return {
          source,
          status: read.status,
          entries: read.entries,
          ...(read.error === undefined ? {} : { error: read.error }),
        }
      }),
    [sources, held, round]
  )

  const refresh = React.useCallback(() => setRound((current) => current + 1), [])
  const busy = reads.some((read) => read.status === "loading")
  return { reads, refresh, busy }
}

/**
 * What the library already holds, read without the agents' own answers.
 *
 * The page only needs to know whether an entry is already collected, so this
 * is the one lightweight list call rather than the whole plugin library hook.
 */
export function useLibraryRecords(): {
  records: readonly PluginRecord[]
  reread: () => void
} {
  const [records, setRecords] = React.useState<readonly PluginRecord[]>([])
  const [round, setRound] = React.useState(0)

  React.useEffect(() => {
    let live = true
    void listLibraryRecords()
      .then((plugins) => {
        if (live) setRecords(plugins)
      })
      /* A form without the plugin bridge holds nothing this page can install. */
      .catch(() => {
        if (live) setRecords([])
      })
    return () => {
      live = false
    }
  }, [round])

  const reread = React.useCallback(() => setRound((current) => current + 1), [])
  return { records, reread }
}
