/**
 * Catalog data for the skills UI. The page asks this hook for one page of
 * skills; the hook reads the form-owned store when one exists, follows its
 * change notifications, and hands back rows the components already understand.
 * Without a store the page keeps rendering its bundled samples.
 */
import * as React from "react"
import { useHub, useI18n } from "@workspace/extensions/react"

import type { SkillStore, SkillQuery, SkillSummary } from "./store.ts"
import type { Skill } from "./types.ts"

/** One page of the catalog, plus what the UI needs to render around it. */
export interface SkillLibrary {
  /** The form-owned library, or `null` when this form has none. */
  store: SkillStore | null
  rows: Skill[]
  total: number
  loading: boolean
  /** Display-ready failure from the last load, if any. */
  error: string | null
  /** Where the rows came from, once a page has answered. */
  root: string | null
  /** Every category in use across the library. */
  tags: string[]
  /** Re-read the current page. */
  reload(): Promise<void>
}

/** Token count as a compact label, the way the cards show it. */
export function tokenLabel(body: string): string {
  const count = Math.round(body.length / 4)
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count)
}

/** A past timestamp as an age the list can print, localized to the active locale. */
export function formatAge(iso: string, locale: string): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ""
  const seconds = Math.round((then - Date.now()) / 1000)
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "narrow" })
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
  ]
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit)
  }
  return format.format(seconds, "second")
}

/** Turn one catalog row into the row shape the components render. */
export function toSkill(
  row: SkillSummary,
  store: SkillStore,
  locale: string,
  tokens?: string
): Skill {
  const gallery = row.assets.map((file) => store.assetUrl(row.id, file))
  return {
    id: row.id,
    name: row.name,
    summary: row.description,
    description: row.description,
    tags: row.tags,
    source: row.source,
    tokens,
    updated: formatAge(row.updatedAt, locale),
    stamp: row.updatedAt,
    enabled: row.enabled,
    cover: gallery[0],
    gallery: gallery.length > 0 ? gallery : undefined,
  }
}

/** Load one page of the catalog and follow the library's change notifications. */
export function useSkillLibrary(query: SkillQuery): SkillLibrary {
  const ctx = useHub()
  const { state } = useI18n()
  const locale = state.active
  const store = React.useMemo(() => ctx.get("hub.skills") ?? null, [ctx])

  const [rows, setRows] = React.useState<Skill[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(store !== null)
  const [error, setError] = React.useState<string | null>(null)
  const [root, setRoot] = React.useState<string | null>(null)
  const [tags, setTags] = React.useState<string[]>([])

  /* The key drives reloading: a new page, filter, or search re-reads the store. */
  const key = JSON.stringify(query)
  const generation = React.useRef(0)

  const reload = React.useCallback(async () => {
    if (store === null) return
    const current = ++generation.current
    try {
      const page = await store.list(JSON.parse(key) as SkillQuery)
      /* A slower earlier request must not overwrite a newer one. */
      if (current !== generation.current) return
      setRows(page.items.map((item) => toSkill(item, store, locale)))
      setTotal(page.total)
      setRoot(page.root)
      setError(null)
    } catch (failure) {
      if (current !== generation.current) return
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      if (current === generation.current) setLoading(false)
    }
  }, [store, key, locale])

  /* The filter row spans the whole library, not the page on screen. */
  const loadTags = React.useCallback(async () => {
    if (store === null) return
    try {
      setTags(await store.tags())
    } catch {
      /* The rows carry a failure worth showing; the filter row keeps its list. */
    }
  }, [store])

  React.useEffect(() => {
    /* Deferred a microtask: the load's state change belongs to the read that
       follows, and the linter only sees the call itself. */
    queueMicrotask(() => {
      void reload()
      void loadTags()
    })
  }, [reload, loadTags])

  React.useEffect(() => {
    if (store === null) return
    return store.subscribe(() => {
      void reload()
      void loadTags()
    })
  }, [store, reload, loadTags])

  if (store === null) {
    return {
      store: null,
      rows: [],
      total: 0,
      loading: false,
      error: null,
      root: null,
      tags: [],
      reload: async () => undefined,
    }
  }
  return { store, rows, total, loading, error, root, tags, reload }
}
