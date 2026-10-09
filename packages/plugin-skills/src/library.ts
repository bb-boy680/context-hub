/**
 * Catalog data for the skills UI. The page asks this hook for one page of
 * skills; the hook reads the form-owned store when one exists, follows its
 * change notifications, and hands back rows the components already understand.
 * A form with no store has no catalog, and the page says so instead of
 * rendering rows nothing on this machine holds.
 */
import * as React from "react"
import { useHub, useI18n } from "@workspace/extensions/react"

import { parseSkillFile } from "./frontmatter.ts"
import type {
  SkillFileEntry,
  SkillPage,
  SkillStore,
  SkillSummary,
  SkillUpdateCheck,
  SkillUpdateSummary,
  WorkspaceInstall,
  WorkspaceSkill,
  WorkspaceSkillsView,
} from "./store.ts"
import type {
  Skill,
  SkillHold,
  SkillLocation,
  SkillPlace,
  SkillSource,
} from "./types.ts"

/** One place a workspace keeps skills in, with what it holds right now. */
export interface SkillPlaceView {
  id: SkillPlace
  /** Message key the tab and the provenance line resolve for this place. */
  labelKey: string
  /** The place's directory inside the workspace, `/`-separated. */
  dir: string
  /** The place's own skills directory, as it reads; `null` when it has none. */
  view: WorkspaceSkillsView | null
}

/** One page of the catalog, plus what the UI needs to render around it. */
export interface SkillLibrary {
  /** The form-owned library, or `null` when this form has none. */
  store: SkillStore | null
  /** Every skill in reach: the library's own, then each place's. */
  rows: Skill[]
  /** Rows each tab shows, keyed by tab value: "all", "library", or a place id. */
  counts: Record<string, number>
  /** The places a workspace keeps skills in, in tab order. */
  places: SkillPlaceView[]
  /** The workspace in use, or `null` when this form has none selected. */
  workspaceId: string | null
  /**
   * The agent this hub delivers to, by integration id; `null` when none is
   * chosen. It names a place, so the page can open on the chosen agent's tab.
   */
  agent: string | null
  loading: boolean
  /** Display-ready failure from the last load, if any. */
  error: string | null
  /** Where the library's rows came from, once a page has answered. */
  root: string | null
  /** Every category in use across the library. */
  tags: string[]
  /** Re-read the library and every place. */
  reload(): Promise<void>
  /** Put one library skill into one place; answers how it landed. */
  install(id: string, dir?: string): Promise<WorkspaceInstall>
  /** Copy one skill a place holds into the library. */
  adopt(id: string, dir?: string): Promise<WorkspaceInstall>
  /** Delete one skill from a place, its directory included. */
  deleteWorkspaceSkill(id: string, dir?: string): Promise<void>
  /** Take one skill the hub installed back out of a place. */
  remove(id: string, dir?: string): Promise<void>
  /** Measure one library skill against the upstream its files came from. */
  checkUpdate(id: string): Promise<SkillUpdateCheck>
  /** Measure every skill that records a source; the rows carry the answers. */
  checkAll(): Promise<SkillUpdateSummary>
  /** Install that upstream's current revision over this copy. */
  update(id: string): Promise<void>
}

/** Every place holding a row's files. */
export function holdsOf(skill: Skill): SkillHold[] {
  return skill.places ?? []
}

/**
 * Where one row's files live, and how that directory reads.
 *
 * @param skill — the row.
 * @param places — the places in use, which carry the display path.
 * @returns the directory and its display form, or `null` for a library-only row.
 */
export function placeOf(
  skill: Skill,
  places: readonly SkillPlaceView[]
): { id: SkillPlace; dir: string; display: string } | null {
  const hold = holdsOf(skill)[0]
  if (hold === undefined) return null
  const display = places.find((place) => place.id === hold.id)?.view?.display
  return { id: hold.id, dir: hold.dir, display: display ?? hold.dir }
}

/** Whether the hub's own library holds this row, so the row is not only a place's. */
export function inLibrary(skill: Skill): boolean {
  return skill.location === "library" || skill.location === "both"
}

/**
 * A row's location as its provenance line names it: the hub's own two cases by
 * key, and a place by the key the extension that contributed it chose.
 *
 * @param location — the row's location.
 * @param t — the active locale's lookup.
 * @param places — the places in use, which carry their own labels.
 * @returns the label, or the raw id for a place this build does not know.
 */
export function locationLabel(
  location: SkillLocation,
  t: (key: string) => string,
  places: readonly { id: SkillPlace; labelKey: string }[]
): string {
  if (location === "library") return t("skills.location.library")
  if (location === "both") return t("skills.location.both")
  const labelKey = places.find((place) => place.id === location)?.labelKey
  return labelKey === undefined ? location : t(labelKey)
}

/**
 * A row's places as one label. The card reads a count and the detail panel
 * names which ones: a place is a property of the skill, never its identity.
 *
 * @param skill — the row whose places are read.
 * @param t — the active locale's lookup.
 * @param places — the places in use, which carry their own labels.
 * @returns the library's own label, the place's, or how many hold it.
 */
export function placeLabel(
  skill: Skill,
  t: (key: string) => string,
  places: readonly { id: SkillPlace; labelKey: string }[]
): string {
  const holds = holdsOf(skill)
  if (holds.length === 0) return t("skills.location.library")
  if (holds.length === 1) return locationLabel(holds[0].id, t, places)
  return t("skills.location.count").replace("{count}", String(holds.length))
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
 * screen twice — a library skill and a same-named skill a place wrote are two
 * rows — so the side a row comes from is part of it. Which places hold it is
 * not: installing into one changes no identity, so the card behind an open
 * menu is re-rendered rather than replaced.
 */
export function skillKey(skill: Skill): string {
  return inLibrary(skill) ? `library:${skill.id}` : `${skill.location}:${skill.id}`
}

/** Token count as a compact label, the way the cards show it. */
export function tokenLabel(body: string): string {
  const count = Math.round(body.length / 4)
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count)
}

/** One skill's document as a cover reads it. */
export interface SkillDocument {
  /** The SKILL.md body, or `null` until it is read. */
  body: string | null
  /** Every file the skill ships, which the same read already answered. */
  files: readonly SkillFileEntry[]
}

const NO_FILES: readonly SkillFileEntry[] = []

/** Documents already read, so a re-mounted cover does not refetch. */
const documents = new Map<string, SkillDocument>()

/**
 * The skill's own document — the SKILL.md body and its file list, read from
 * wherever the skill lives. Only a cover that shows the document calls this, so
 * a card with a picture never pays for the read.
 *
 * @param skill — the row whose document is shown.
 * @param store — the form's library, or `null` when this form has none.
 * @returns the body and files, both empty until the read answers.
 */
export function useSkillDocument(
  skill: Skill,
  store: SkillStore | null
): SkillDocument {
  const key = `${skillKey(skill)}@${skill.stamp ?? ""}`
  const [document, setDocument] = React.useState<SkillDocument>(
    () => documents.get(key) ?? { body: null, files: NO_FILES }
  )

  React.useEffect(() => {
    if (store === null || documents.has(key)) return
    let live = true
    void (async () => {
      try {
        /* A skill no library record holds is read where the place keeps it. */
        const dir = holdsOf(skill)[0]?.dir
        const record =
          dir === undefined
            ? await store.get(skill.id)
            : await store.workspaceSkill(skill.id, dir)
        if (record === undefined || record === null) return
        const text = "body" in record ? record.body : record.text
        const read: SkillDocument = {
          body: dir === undefined ? text : parseSkillFile(text).body,
          files: record.files,
        }
        documents.set(key, read)
        if (live) setDocument(read)
      } catch {
        /* An unreadable skill leaves the cover on its file-less placeholder. */
      }
    })()
    return () => {
      live = false
    }
  }, [key, store, skill])

  return document
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
    ...(row.upstream === undefined ? {} : { upstream: row.upstream }),
    ...(row.checked === undefined ? {} : { checked: row.checked }),
  }
}

/** Nothing to follow when this form provides no workspace list. */
const NO_LISTENERS: (listener: () => void) => () => void = () => () => undefined

/** One skill's row for a skill a place holds and the library does not. */
function placeRow(skill: WorkspaceSkill, place: SkillHold): Skill {
  return {
    id: skill.id,
    name: skill.name,
    summary: skill.description,
    description: skill.description,
    tags: [],
    /* A folder in the project is a skill somebody put there, on this machine. */
    source: "local",
    updated: "",
    location: place.id,
    places: [{ id: place.id, dir: place.dir }],
    installed: false,
    stale: skill.origin === "stale",
  }
}

/** One place as a contribution describes it, which is all the loader needs. */
export interface SkillPlaceSpec {
  id: SkillPlace
  labelKey: string
  /** The place's directory inside the workspace, `/`-separated. */
  dir: string
}

/**
 * Load the whole catalog and what every place holds, and follow the library's
 * change notifications. The page filters and pages what it gets, so a row that
 * lives in more than one of them is still one list with one meaning.
 *
 * @param specs — the places to read, as the contributions describe them.
 * @param query — the filter row's text; the store narrows the catalog with it.
 */
export function useSkillLibrary(
  specs: readonly SkillPlaceSpec[],
  query = ""
): SkillLibrary {
  const ctx = useHub()
  const { state } = useI18n()
  const locale = state.active
  const store = React.useMemo(() => ctx.get("hub.skills") ?? null, [ctx])
  const workspaces = React.useMemo(() => ctx.get("hub.workspaces") ?? null, [ctx])

  /* A contribution list is rebuilt on every render, so the loads follow the
     places it names rather than the array that carried them. */
  const specKey = JSON.stringify(specs.map((spec) => [spec.id, spec.dir]))
  const targets = React.useMemo(
    () => JSON.parse(specKey) as [SkillPlace, string][],
    [specKey]
  )

  const subscribeWorkspaces = React.useCallback(
    (listener: () => void) => workspaces?.subscribe(listener) ?? NO_LISTENERS(listener),
    [workspaces]
  )
  const readWorkspaceId = React.useCallback(
    () => workspaces?.current()?.current ?? null,
    [workspaces]
  )
  /* The chosen agent decides which place the page opens on. */
  const readAgent = React.useCallback(
    () => workspaces?.current()?.agent ?? null,
    [workspaces]
  )
  /* The workspace in use decides which skills are in reach, so it is a reload key. */
  const workspaceId = React.useSyncExternalStore(subscribeWorkspaces, readWorkspaceId)
  const agent = React.useSyncExternalStore(subscribeWorkspaces, readAgent)

  const [page, setPage] = React.useState<SkillPage | null>(null)
  /* What each place holds, keyed by its id; a place that could not be read is absent. */
  const [held, setHeld] = React.useState<Record<string, WorkspaceSkillsView | null>>({})
  const [loading, setLoading] = React.useState(store !== null)
  const [error, setError] = React.useState<string | null>(null)
  const [tags, setTags] = React.useState<string[]>([])
  const generation = React.useRef(0)
  /* The store owns what a query matches, so the page hands it over untouched. */
  const needle = query.trim()

  const reload = React.useCallback(async () => {
    if (store === null) return
    /* The workspace in use is a reload key: it decides what the rows mean. */
    void workspaceId
    const current = ++generation.current
    try {
      const [catalog, ...views] = await Promise.all([
        store.list(needle === "" ? { sort: "updated" } : { sort: "updated", q: needle }),
        ...targets.map(([, dir]) => store.workspaceSkills(dir)),
      ])
      /* A slower earlier request must not overwrite a newer one. */
      if (current !== generation.current) return
      setPage(catalog)
      setHeld(
        Object.fromEntries(targets.map(([id], at) => [id, views[at] ?? null]))
      )
      setError(null)
    } catch (failure) {
      if (current !== generation.current) return
      setError(failure instanceof Error ? failure.message : String(failure))
    } finally {
      if (current === generation.current) setLoading(false)
    }
  }, [store, workspaceId, targets, needle])

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

  /** Each place with what it holds right now, for the tabs and the rows. */
  const places = React.useMemo(
    (): SkillPlaceView[] =>
      specs.map((spec) => ({ ...spec, view: held[spec.id] ?? null })),
    [specs, held]
  )

  const rows = React.useMemo((): Skill[] => {
    if (store === null) return []
    const items = page?.items ?? []
    /** Every place, with the directory it reads and the skills it holds. */
    const roots = targets.map(([id, dir]) => {
      const view = held[id] ?? null
      return {
        id,
        dir,
        root: view?.root ?? null,
        byId: new Map((view?.skills ?? []).map((skill) => [skill.id, skill])),
      }
    })
    /** Whether a library row reaches its files through a link into one place. */
    const reachedFrom = (row: SkillSummary, root: string | null): boolean =>
      row.link !== undefined && root !== null && row.link.startsWith(root)

    const library: Skill[] = items.map((item) => {
      /*
       * One skill, whichever places hold the files: a place linked it in from
       * the library, or the hub installed the library's skill into a place.
       * Either way it is one row, and `linkAt` says which side holds the link —
       * that is the side an action takes back.
       */
      const holding: SkillHold[] = []
      let linkAt: "library" | SkillPlace | undefined
      const takenAt: SkillPlace[] = []
      for (const place of roots) {
        const own = place.byId.get(item.id)
        const adopted = reachedFrom(item, place.root)
        const installed = own?.origin === "hub"
        if (adopted || installed) {
          holding.push({ id: place.id, dir: place.dir })
          if (adopted) linkAt = "library"
          else if (linkAt === undefined) linkAt = place.id
        } else if (own !== undefined) {
          /* A same-named skill the project wrote is not this one, and it holds the name. */
          takenAt.push(place.id)
        }
      }
      return {
        ...toSkill(item, store, locale),
        location: holding.length === 0 ? "library" : "both",
        installed: holding.length > 0,
        ...(holding.length === 0 ? {} : { places: holding }),
        ...(linkAt === undefined ? {} : { linkAt }),
        ...(takenAt.length === 0 ? {} : { takenAt }),
      }
    })
    /*
     * A link the hub made, or a skill the library already reached through one,
     * is on screen already; anything else a place holds is that place's own.
     */
    const own: Skill[] = []
    for (const place of roots) {
      for (const skill of held[place.id]?.skills ?? []) {
        if (skill.origin === "hub") continue
        if (items.some((item) => item.id === skill.id && reachedFrom(item, place.root))) continue
        own.push({
          ...placeRow(skill, place),
          inLibrary: items.some((item) => item.id === skill.id),
        })
      }
    }
    return [...library, ...own]
  }, [store, page, held, targets, locale])

  const install = React.useCallback(
    async (id: string, dir?: string) => {
      if (store === null) throw new Error("this form has no skill library")
      const landed = await store.installToWorkspace(id, dir)
      await reload()
      return landed
    },
    [store, reload]
  )

  const adopt = React.useCallback(
    async (id: string, dir?: string) => {
      if (store === null) throw new Error("this form has no skill library")
      /* The place keeps its files; the library reaches them through a link. */
      const landed = await store.importFromWorkspace(id, dir)
      await reload()
      return landed
    },
    [store, reload]
  )

  const deleteWorkspaceSkill = React.useCallback(
    async (id: string, dir?: string) => {
      if (store === null) throw new Error("this form has no skill library")
      await store.deleteWorkspaceSkill(id, dir)
      await reload()
    },
    [store, reload]
  )

  const remove = React.useCallback(
    async (id: string, dir?: string) => {
      if (store === null) throw new Error("this form has no skill library")
      await store.removeFromWorkspace(id, dir)
      await reload()
    },
    [store, reload]
  )

  const checkUpdate = React.useCallback(
    async (id: string) => {
      if (store === null) throw new Error("this form has no skill library")
      const result = await store.checkUpdate(id)
      /* The row now carries the answer, so the list's badge agrees with the dialog. */
      await reload()
      return result
    },
    [store, reload]
  )

  const checkAll = React.useCallback(
    async () => {
      if (store === null) throw new Error("this form has no skill library")
      const summary = await store.checkUpdates()
      await reload()
      return summary
    },
    [store, reload]
  )

  const update = React.useCallback(
    async (id: string) => {
      if (store === null) throw new Error("this form has no skill library")
      await store.updateFromUpstream(id)
      await reload()
    },
    [store, reload]
  )

  if (store === null) {
    return {
      store: null,
      rows: [],
      counts: {},
      places: [],
      workspaceId,
      agent: null,
      loading: false,
      error: null,
      root: null,
      tags: [],
      reload: async () => undefined,
      install: async () => "link",
      adopt: async () => "link",
      deleteWorkspaceSkill: async () => undefined,
      remove: async () => undefined,
      checkUpdate: async () => {
        throw new Error("this form has no skill library")
      },
      checkAll: async () => {
        throw new Error("this form has no skill library")
      },
      update: async () => undefined,
    }
  }
  /* A skill in the library and in a place counts under each tab; only its
     absence from a side excludes it there. */
  const counts: Record<string, number> = {
    all: rows.length,
    library: rows.filter(inLibrary).length,
  }
  for (const [id] of targets) {
    counts[id] = rows.filter((row) => holdsOf(row).some((hold) => hold.id === id)).length
  }
  return {
    store,
    rows,
    counts,
    places,
    workspaceId,
    agent,
    loading,
    error,
    root: page?.root ?? null,
    tags,
    reload,
    install,
    adopt,
    deleteWorkspaceSkill,
    remove,
    checkUpdate,
    checkAll,
    update,
  }
}
