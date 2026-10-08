/**
 * Catalog data for the skills UI. The page asks this hook for one page of
 * skills; the hook reads the form-owned store when one exists, follows its
 * change notifications, and hands back rows the components already understand.
 * Without a store the page keeps rendering its bundled samples.
 */
import * as React from "react"
import { useHub, useI18n } from "@workspace/extensions/react"

import type {
  SkillPage,
  SkillStore,
  SkillSummary,
  WorkspaceInstall,
  WorkspaceSkill,
  WorkspaceSkillsView,
} from "./store.ts"
import type { Skill, SkillLocation, SkillSource } from "./types.ts"

/** One page of the catalog, plus what the UI needs to render around it. */
export interface SkillLibrary {
  /** The form-owned library, or `null` when this form has none. */
  store: SkillStore | null
  /** Every skill the hub knows here: the library's own, then the workspace's. */
  rows: Skill[]
  /** Rows under each tab: everything, and what the current workspace holds. */
  counts: { all: number; workspace: number }
  /** The current workspace's skills; `null` when no folder is selected. */
  workspace: WorkspaceSkillsView | null
  /** The workspace in use, or `null` when this form has none selected. */
  workspaceId: string | null
  /** Where the current workspace keeps its skills, as it reads; `null` when there is no folder. */
  workspaceRoot: string | null
  loading: boolean
  /** Display-ready failure from the last load, if any. */
  error: string | null
  /** Where the library's rows came from, once a page has answered. */
  root: string | null
  /** Every category in use across the library. */
  tags: string[]
  /** Re-read the library and the workspace. */
  reload(): Promise<void>
  /** Put one library skill into the current workspace; answers how it landed. */
  install(id: string): Promise<WorkspaceInstall>
  /** Copy one skill the current workspace holds into the library. */
  adopt(id: string): Promise<void>
  /** Delete one skill from the current workspace folder, its directory included. */
  deleteWorkspaceSkill(id: string): Promise<void>
  /** Take one skill the hub installed back out of the current workspace. */
  remove(id: string): Promise<void>
}

/** Where a row lives, as its provenance line and the lightbox name it. */
export function locationLabel(
  location: SkillLocation,
  t: (key: string) => string
): string {
  return t(location === "library" ? "skills.location.library" : "skills.location.workspace")
}

/** How a row reached this machine, as its provenance line names it. */
const SOURCE_KEYS: Record<SkillSource, string> = {
  local: "skills.source.local",
  registry: "skills.source.registry",
  builtin: "skills.source.builtin",
}

/**
 * How a row's source reads.
 *
 * @param source — where the skill came from.
 * @param t — the active locale's lookup.
 * @returns the label, or the raw value for an origin this build does not know.
 */
export function sourceLabel(
  source: string,
  t: (key: string) => string
): string {
  const key = SOURCE_KEYS[source as SkillSource]
  return key === undefined ? source : t(key)
}

/**
 * A row's identity for React and for the open lightbox. The same id can be on
 * screen twice — a library skill and a same-named skill the workspace wrote are
 * two rows — so the location is part of it.
 */
export function skillKey(skill: Skill): string {
  return `${skill.location}:${skill.id}`
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
): Omit<Skill, "location" | "installed"> {
  const gallery = row.assets.map((ref) => store.assetUrl(ref))
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
    cover: gallery[0],
    gallery: gallery.length > 0 ? gallery : undefined,
  }
}

/** Nothing to follow when this form provides no workspace list. */
const NO_LISTENERS: (listener: () => void) => () => void = () => () => undefined

/** One skill's row for a skill the workspace holds and the library does not. */
function workspaceRow(skill: WorkspaceSkill): Skill {
  return {
    id: skill.id,
    name: skill.name,
    summary: skill.description,
    description: skill.description,
    tags: [],
    /* A folder in the project is a skill somebody put there, on this machine. */
    source: "local",
    updated: "",
    location: "workspace",
    installed: false,
    stale: skill.origin === "stale",
  }
}

/**
 * Load the whole catalog and the current workspace's skills, and follow the
 * library's change notifications. The page filters and pages what it gets, so a
 * row that lives in either place is in one list with one meaning.
 */
export function useSkillLibrary(): SkillLibrary {
  const ctx = useHub()
  const { state } = useI18n()
  const locale = state.active
  const store = React.useMemo(() => ctx.get("hub.skills") ?? null, [ctx])
  const workspaces = React.useMemo(() => ctx.get("hub.workspaces") ?? null, [ctx])

  const subscribeWorkspaces = React.useCallback(
    (listener: () => void) => workspaces?.subscribe(listener) ?? NO_LISTENERS(listener),
    [workspaces]
  )
  const readWorkspaceId = React.useCallback(
    () => workspaces?.current()?.current ?? null,
    [workspaces]
  )
  /* The workspace in use decides which skills are in reach, so it is a reload key. */
  const workspaceId = React.useSyncExternalStore(subscribeWorkspaces, readWorkspaceId)

  const [page, setPage] = React.useState<SkillPage | null>(null)
  const [workspace, setWorkspace] = React.useState<WorkspaceSkillsView | null>(null)
  const [loading, setLoading] = React.useState(store !== null)
  const [error, setError] = React.useState<string | null>(null)
  const [tags, setTags] = React.useState<string[]>([])
  const generation = React.useRef(0)

  const reload = React.useCallback(async () => {
    if (store === null) return
    /* The workspace in use is a reload key: it decides what the rows mean. */
    void workspaceId
    const current = ++generation.current
    try {
      const [catalog, held] = await Promise.all([
        store.list({ sort: "updated" }),
        store.workspaceSkills(),
      ])
      /* A slower earlier request must not overwrite a newer one. */
      if (current !== generation.current) return
      setPage(catalog)
      setWorkspace(held)
      setError(null)
    } catch (failure) {
      if (current !== generation.current) return
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      if (current === generation.current) setLoading(false)
    }
  }, [store, workspaceId])

  /* The filter row spans the whole library, not the rows on screen. */
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

  const rows = React.useMemo((): Skill[] => {
    if (store === null) return []
    const held = new Map((workspace?.skills ?? []).map((skill) => [skill.id, skill]))
    const listed = new Set((page?.items ?? []).map((item) => item.id))
    const library: Skill[] = (page?.items ?? []).map((item) => {
      const own = held.get(item.id)
      const installed = own?.origin === "hub"
      return {
        ...toSkill(item, store, locale),
        location: installed ? "both" : "library",
        installed,
        /* A same-named skill the project wrote is not this one, and it holds the name. */
        taken: own !== undefined && !installed,
      }
    })
    /*
     * A link the hub made is the library's skill, already on screen; anything
     * else the workspace holds is its own — including a directory that happens
     * to share a name with a library skill, which is a different skill.
     */
    const own = (workspace?.skills ?? [])
      .filter((skill) => skill.origin !== "hub")
      .map((skill) => ({ ...workspaceRow(skill), inLibrary: listed.has(skill.id) }))
    return [...library, ...own]
  }, [store, page, workspace, locale])

  const install = React.useCallback(
    async (id: string) => {
      if (store === null) throw new Error("this form has no skill library")
      const landed = await store.installToWorkspace(id)
      await reload()
      return landed
    },
    [store, reload]
  )

  const adopt = React.useCallback(
    async (id: string) => {
      if (store === null) throw new Error("this form has no skill library")
      await store.importFromWorkspace(id)
      await reload()
    },
    [store, reload]
  )

  const deleteWorkspaceSkill = React.useCallback(
    async (id: string) => {
      if (store === null) throw new Error("this form has no skill library")
      await store.deleteWorkspaceSkill(id)
      await reload()
    },
    [store, reload]
  )

  const remove = React.useCallback(
    async (id: string) => {
      if (store === null) throw new Error("this form has no skill library")
      await store.removeFromWorkspace(id)
      await reload()
    },
    [store, reload]
  )

  if (store === null) {
    return {
      store: null,
      rows: [],
      counts: { all: 0, workspace: 0 },
      workspace: null,
      workspaceId,
      workspaceRoot: null,
      loading: false,
      error: null,
      root: null,
      tags: [],
      reload: async () => undefined,
      install: async () => "link",
      adopt: async () => undefined,
      deleteWorkspaceSkill: async () => undefined,
      remove: async () => undefined,
    }
  }
  return {
    store,
    rows,
    counts: {
      all: rows.length,
      workspace: rows.filter((row) => row.location !== "library").length,
    },
    workspace,
    workspaceId,
    workspaceRoot: workspace?.display ?? null,
    loading,
    error,
    root: page?.root ?? null,
    tags,
    reload,
    install,
    adopt,
    deleteWorkspaceSkill,
    remove,
  }
}
