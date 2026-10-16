/**
 * Catalog data for the skills UI. The page asks this hook for one page of
 * skills; the hook reads the form-owned store when one exists, follows its
 * change notifications, and hands back rows the components already understand.
 * A form with no store has no catalog, and the page says so instead of
 * rendering rows nothing on this machine holds.
 */
import * as React from "react"
import { useCatalog, useExtensionSnapshot, useHub, useI18n } from "@context-hub/extensions/react"
import type { AssetScope } from "@context-hub/extensions"

import { parseSkillFile } from "./frontmatter.ts"
import { createCatalog, type Catalog } from "@context-hub/extensions"
import { NOTHING_READ, type SkillLibraryValue } from "./library-store.ts"
import { readablePlaces, type SkillPlace, type SkillProvider } from "./provider.ts"
import type {
  PlaceSkill,
  PlaceSkillsView,
  SkillFileEntry,
  SkillInstall,
  SkillPage,
  SkillPlaceRef,
  SkillStore,
  SkillSummary,
  SkillUpdateCheck,
  SkillUpdateSummary,
} from "./store.ts"
import type {
  Skill,
  SkillHold,
  SkillLocation,
  SkillPlaceId,
  SkillSource,
} from "./types.ts"

/** Nothing chosen, as a stable value: a reload key must not change identity. */
const NO_AGENTS: string[] = []

/**
 * What a page watches when this module is not loaded: always empty, never
 * reading. It exists so that watching a library is one code path rather than a
 * hook called inside a condition.
 */
const NOTHING: Catalog<SkillLibraryValue> = createCatalog({
  initial: NOTHING_READ,
  read: async () => NOTHING_READ,
})

/** One place an agent keeps skills in, with what it holds right now. */
export interface SkillPlaceView {
  id: SkillPlaceId
  /** Message key the provenance line resolves for this place. */
  labelKey: string
  /** Which root the place's directory sits under. */
  scope: AssetScope
  /** The place's directory inside that root, `/`-separated. */
  dir: string
  /** The place's own skills directory, as it reads; `null` when it has none. */
  view: PlaceSkillsView | null
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
  install(id: string, ref: SkillPlaceRef): Promise<SkillInstall>
  /** Copy one skill a place holds into the library. */
  adopt(id: string, ref: SkillPlaceRef): Promise<SkillInstall>
  /** Delete one skill from a place, its directory included. */
  deleteInPlace(id: string, ref: SkillPlaceRef): Promise<void>
  /** Take one skill the hub installed back out of a place. */
  remove(id: string, ref: SkillPlaceRef): Promise<void>
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
 * The agents the sidebar has chosen, re-read whenever the choice changes. It is
 * the page's own read, not the loader's: which places to load follows from it,
 * and the loader only loads what it is handed.
 *
 * @returns the chosen integrations' ids, and nothing when this form has no
 *   workspace service.
 */
export function useChosenAgents(): string[] {
  const ctx = useHub()
  const workspaces = React.useMemo(() => ctx.get("hub.workspaces") ?? null, [ctx])
  const subscribe = React.useCallback(
    (listener: () => void) => workspaces?.subscribe(listener) ?? NO_LISTENERS(listener),
    [workspaces]
  )
  const read = React.useCallback(
    () => workspaces?.current()?.agents ?? NO_AGENTS,
    [workspaces]
  )
  return React.useSyncExternalStore(subscribe, read)
}

/**
 * Every provider the skills registry holds, re-read on each catalog change: an
 * agent extension registers the places it reads while it activates, and gives
 * them back when it is disabled.
 */
function useSkillProviders(): readonly SkillProvider[] {
  const ctx = useHub()
  useExtensionSnapshot()
  return ctx.get("skills")?.providers() ?? []
}

/**
 * The places this build reads, in the order their own extensions ask for; see
 * {@link readablePlaces} for which of them a given set of agents makes readable.
 */
export function useReadablePlaces(): SkillPlace[] {
  const providers = useSkillProviders()
  const chosen = useChosenAgents()
  return readablePlaces(providers, chosen)
}

/**
 * The agents this hub reads skills from: one id per registered provider. A
 * `target` reads as an agent row while its own id is one of these, because a
 * provider and a target are two halves of one integration.
 *
 * @returns the registered agents' ids, in registration order.
 */
export function useSkillAgents(): string[] {
  return useSkillProviders().map((provider) => provider.id)
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
): { id: SkillPlaceId; ref: SkillPlaceRef; display: string } | null {
  const hold = holdsOf(skill)[0]
  if (hold === undefined) return null
  const display = places.find((place) => place.id === hold.id)?.view?.display
  return {
    id: hold.id,
    ref: { scope: hold.scope, dir: hold.dir },
    display: display ?? hold.dir,
  }
}

/** Whether the hub's own library holds this row, so the row is not only a place's. */
export function inLibrary(skill: Skill): boolean {
  return skill.location === "library" || skill.location === "both"
}

/**
 * A skill a place holds and the library does not, which is what 收录 is for. A
 * place's own row is out when the library already holds that name: taking it in
 * would collide with the copy already there rather than add anything.
 */
export function unstored(skill: Skill): boolean {
  return skill.inLibrary !== true && !inLibrary(skill) && holdsOf(skill).length > 0
}

/**
 * Whether the last check found the skill's source ahead of the files here. Only
 * a check that recorded an answer says so: a row with no recorded source, or one
 * nobody has asked about, is not ahead of anything.
 */
export function outdated(skill: Skill): boolean {
  const latest = skill.checked?.latest
  if (latest === undefined || skill.upstream === undefined) return false
  return latest !== skill.upstream.hash
}

/**
 * Whether the files here differ from the revision they were installed from — a
 * person's own edit, which an update would overwrite. This holds even when the
 * source has not moved on, so it is asked apart from `outdated`.
 */
export function modified(skill: Skill): boolean {
  const current = skill.checked?.currentHash
  if (current === undefined || skill.upstream === undefined) return false
  return current !== skill.upstream.hash
}

/**
 * How one place's directory reads to a person. A place is a directory inside a
 * scope, and the scope's root is the part a person already knows: inside a
 * workspace that root is the folder in use, and outside every workspace it is
 * the home directory — so the directory alone is the answer, spelled from `~`
 * where the root is the machine's own.
 *
 * @param place — the place to name.
 * @returns the directory as a person would write it.
 */
export function placePath(place: { scope: AssetScope; dir: string }): string {
  return place.scope === "global" ? `~/${place.dir}` : place.dir
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
  places: readonly { id: SkillPlaceId; labelKey: string }[]
): string {
  if (location === "library") return t("skills.location.library")
  if (location === "both") return t("skills.location.both")
  const labelKey = places.find((place) => place.id === location)?.labelKey
  return labelKey === undefined ? location : t(labelKey)
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
        const hold = holdsOf(skill)[0]
        const record =
          hold === undefined
            ? await store.get(skill.id)
            : await store.placeSkill(skill.id, { scope: hold.scope, dir: hold.dir })
        if (record === undefined || record === null) return
        const text = "body" in record ? record.body : record.text
        const read: SkillDocument = {
          body: hold === undefined ? text : parseSkillFile(text).body,
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
function placeRow(skill: PlaceSkill, place: SkillHold): Skill {
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
    places: [{ id: place.id, scope: place.scope, dir: place.dir }],
    installed: false,
    stale: skill.origin === "stale",
  }
}

/**
 * Load the whole catalog and what every place holds, and follow the library's
 * change notifications. The page filters and pages what it gets, so a row that
 * lives in more than one of them is still one list with one meaning.
 *
 * @param places — the places to read, as their providers describe them.
 * @param query — the filter row's text; the store narrows the catalog with it.
 */
export function useSkillLibrary(
  places: readonly SkillPlace[],
  query = ""
): SkillLibrary {
  const ctx = useHub()
  const { state } = useI18n()
  const locale = state.active
  const store = React.useMemo(() => ctx.get("hub.skills") ?? null, [ctx])
  const workspaces = React.useMemo(() => ctx.get("hub.workspaces") ?? null, [ctx])

  /* A registry's list is what a re-render reads, so the loads follow the place
     ids it names rather than the array that carried them. */
  const placeKey = JSON.stringify(
    places.map((place) => [place.id, place.scope, place.dir])
  )
  const targets = React.useMemo(
    () => JSON.parse(placeKey) as [SkillPlaceId, AssetScope, string][],
    [placeKey]
  )

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

  /* The store owns what a query matches, so the page hands it over untouched. */
  const needle = query.trim()

  /* The read is not made here. It is the library's own shared read, so a form
     can start it before this page is ever opened and the rows are already there
     when it is — what is left here is a query, which is not part of the library:
     the filter row spans all of it, and folding a keystroke into that read would
     re-read every place on every keystroke, for everyone watching. */
  const shared = React.useMemo(() => ctx.get("catalog.skills") ?? null, [ctx])
  const catalog = shared ?? NOTHING

  React.useEffect(() => {
    /* Somebody has to be the first to ask. A form's startup does this before
       anything is drawn; until it does, the page is what asks. */
    void shared?.load()
  }, [shared])

  const value = useCatalog(catalog, (snapshot) => snapshot.value ?? NOTHING_READ)
  const failure = useCatalog(catalog, (snapshot) => snapshot.failure)
  const status = useCatalog(catalog, (snapshot) => snapshot.status)
  const held = value.held
  const tags = value.tags

  const [matched, setMatched] = React.useState<SkillPage | null>(null)
  const [matchFailure, setMatchFailure] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (store === null || needle === "") return
    let live = true
    void store.list({ sort: "updated", q: needle }).then(
      (answer) => {
        if (!live) return
        setMatched(answer)
        setMatchFailure(null)
      },
      (reason: unknown) => {
        if (!live) return
        setMatchFailure(reason instanceof Error ? reason.message : String(reason))
      }
    )
    return () => {
      live = false
    }
  }, [store, needle, value.page])

  /* Unfiltered is what the library read; a query is what the page asked for on
     top of it, and keeps the previous answer on screen until the next lands. */
  const page = needle === "" ? value.page : matched
  const loading = store !== null && (status === "idle" || status === "loading")
  const error = needle === "" ? failure : matchFailure

  const reload = React.useCallback(async () => {
    await shared?.reload()
  }, [shared])

  /** Each place with what it holds right now, for the tabs and the rows. */
  const placeViews = React.useMemo(
    (): SkillPlaceView[] =>
      places.map((place) => ({
        id: place.id,
        labelKey: place.labelKey,
        scope: place.scope,
        dir: place.dir,
        view: held[place.id] ?? null,
      })),
    [places, held]
  )

  const rows = React.useMemo((): Skill[] => {
    if (store === null) return []
    const items = page?.items ?? []
    /** Every place, with the directory it reads and the skills it holds. */
    const roots = targets.map(([id, scope, dir]) => {
      const view = held[id] ?? null
      return {
        id,
        scope,
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
      let linkAt: "library" | SkillPlaceId | undefined
      const takenAt: SkillPlaceId[] = []
      for (const place of roots) {
        const own = place.byId.get(item.id)
        const adopted = reachedFrom(item, place.root)
        const installed = own?.origin === "hub"
        if (adopted || installed) {
          holding.push({ id: place.id, scope: place.scope, dir: place.dir })
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
    async (id: string, ref: SkillPlaceRef) => {
      if (store === null) throw new Error("this form has no skill library")
      const landed = await store.installInto(id, ref)
      await reload()
      return landed
    },
    [store, reload]
  )

  const adopt = React.useCallback(
    async (id: string, ref: SkillPlaceRef) => {
      if (store === null) throw new Error("this form has no skill library")
      /* The place keeps its files; the library reaches them through a link. */
      const landed = await store.adoptFrom(id, ref)
      await reload()
      return landed
    },
    [store, reload]
  )

  const deleteInPlace = React.useCallback(
    async (id: string, ref: SkillPlaceRef) => {
      if (store === null) throw new Error("this form has no skill library")
      await store.deleteInPlace(id, ref)
      await reload()
    },
    [store, reload]
  )

  const remove = React.useCallback(
    async (id: string, ref: SkillPlaceRef) => {
      if (store === null) throw new Error("this form has no skill library")
      await store.removeFrom(id, ref)
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
      loading: false,
      error: null,
      root: null,
      tags: [],
      reload: async () => undefined,
      install: async () => "link",
      adopt: async () => "link",
      deleteInPlace: async () => undefined,
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
     absence from a side excludes it there. The two screens that stand for an
     absence — not taken in yet, and a source that moved on — are counted the
     same way, so the tab that says "three" and the list it opens agree. */
  const counts: Record<string, number> = {
    all: rows.length,
    library: rows.filter(inLibrary).length,
    unstored: rows.filter(unstored).length,
    updates: rows.filter(outdated).length,
  }
  for (const [id] of targets) {
    counts[id] = rows.filter((row) => holdsOf(row).some((hold) => hold.id === id)).length
  }
  return {
    store,
    rows,
    counts,
    places: placeViews,
    workspaceId,
    loading,
    error,
    root: page?.root ?? null,
    tags,
    reload,
    install,
    adopt,
    deleteInPlace,
    remove,
    checkUpdate,
    checkAll,
    update,
  }
}
