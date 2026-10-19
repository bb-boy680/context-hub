/**
 * What the prompts page reads: the hub's own library, and the agent places a
 * prompt can be delivered to.
 *
 * The two come from different places on purpose. The library is the form's —
 * a store the kernel was handed before it started, so this page asks the
 * context for it rather than fetching anything itself. The places belong to the
 * agent extensions, which register them into this module's registry as they
 * activate, so the list follows the snapshot's revision: an agent enabled while
 * the page is open appears in it, and one disabled leaves.
 */
import * as React from "react"

import type { PlaceFiles } from "@context-hub/core/place-files"
import { createCatalog, type Catalog } from "@context-hub/extensions"
import { useCatalog, useChosenAgents, useExtensionSnapshot, useHub } from "@context-hub/extensions/react"

import { heldAt, NOTHING_HELD, type Held } from "./deliver.ts"
import type { PromptLibraryValue } from "./library-store.ts"
import { promptPlaces, type PromptPlace } from "./provider.ts"
import type { PromptDraft, PromptPatch, PromptStore, StoredPrompt } from "./store.ts"

/**
 * What a page watches when this module is not loaded: always empty, never
 * reading. It exists so that watching a library is one code path rather than a
 * hook called inside a condition.
 */
const EMPTY: PromptLibraryValue = { rows: [], tags: [], root: "" }

const NO_LIBRARY: Catalog<PromptLibraryValue> = createCatalog({
  initial: EMPTY,
  read: async () => EMPTY,
})

/** What the page draws and can do. */
export interface PromptLibrary {
  /** The form's library, or `null` when this form cannot reach one. */
  store: PromptStore | null
  /** Where the library lives, as a person reads it. */
  root: string
  rows: StoredPrompt[]
  tags: string[]
  loading: boolean
  /** Why the last read failed, or `null`; the rows are what was read last. */
  error: string | null
  reload: () => Promise<void>
  add: (draft: PromptDraft) => Promise<void>
  update: (id: string, patch: PromptPatch) => Promise<void>
  remove: (prompt: StoredPrompt) => Promise<void>
}

/**
 * The agent places that take prompts, as their extensions declare them.
 *
 * The registry's own array is what a render reads, so the list follows the
 * snapshot's revision rather than the array identity: enabling or disabling an
 * agent is what makes a place appear or go. Which agents are offered is the
 * sidebar's choice — an agent nobody chose is not a delivery target.
 */
export function usePromptPlaces(): readonly PromptPlace[] {
  const ctx = useHub()
  const { revision } = useExtensionSnapshot()
  const service = React.useMemo(() => ctx.get("prompts") ?? null, [ctx])
  const chosen = useChosenAgents()

  return React.useMemo(() => {
    void revision
    return service === null ? [] : promptPlaces(service.providers(), chosen)
  }, [service, revision, chosen])
}

/** The form's client-file port, or `null` when this form cannot reach one. */
export function usePlaceFiles(): PlaceFiles | null {
  return useHub().host.files
}

/** The form's prompt library, or `null` when this form cannot reach one. */
export function usePromptStore(): PromptStore | null {
  const ctx = useHub()
  return React.useMemo(() => ctx.get("hub.prompts") ?? null, [ctx])
}

/**
 * Read and change the prompt library.
 *
 * A read is the whole library in one call: a row carries its own text, and the
 * page draws that text as the card's cover, so fetching bodies separately would
 * be paying for the same read twice.
 *
 * The read itself is not made here. It is the library's own shared read, so a
 * form can start it before this page is ever opened and the rows are already
 * there when it is; what lives here is the wiring between that read and React —
 * and a fallback start, for a page opened in a form that never asked.
 */
export function usePromptLibrary(): PromptLibrary {
  const ctx = useHub()
  const store = usePromptStore()
  const shared = React.useMemo(() => ctx.get("catalog.prompts") ?? null, [ctx])
  const catalog = shared ?? NO_LIBRARY

  React.useEffect(() => {
    /* Somebody has to be the first to ask. A form's startup does this before
       anything is drawn; until it does, the page is what asks. */
    void shared?.load()
  }, [shared])

  const value = useCatalog(catalog, (snapshot) => snapshot.value ?? EMPTY)
  const failure = useCatalog(catalog, (snapshot) => snapshot.failure)
  const status = useCatalog(catalog, (snapshot) => snapshot.status)

  const reload = React.useCallback(async () => {
    await shared?.reload()
  }, [shared])

  const add = React.useCallback(
    async (draft: PromptDraft) => {
      if (store === null) throw new Error("this form has no prompt library")
      await store.create(draft)
      await reload()
    },
    [store, reload]
  )

  const update = React.useCallback(
    async (id: string, patch: PromptPatch) => {
      if (store === null) throw new Error("this form has no prompt library")
      await store.update(id, patch)
      await reload()
    },
    [store, reload]
  )

  const remove = React.useCallback(
    async (prompt: StoredPrompt) => {
      if (store === null) throw new Error("this form has no prompt library")
      await store.remove(prompt.id)
      await reload()
    },
    [store, reload]
  )

  return {
    store,
    root: value.root,
    rows: value.rows,
    tags: value.tags,
    /* A form with no library is not loading one, and a read that has answered
       is not still going: what is left is a page waiting to be told. */
    loading: store !== null && (status === "idle" || status === "loading"),
    error: failure,
    reload,
    add,
    update,
    remove,
  }
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

/** Token count as a compact label, the way the cards show it. */
export function tokenLabel(body: string): string {
  const count = Math.round(body.length / 4)
  return count >= 1000 ? `${(count / 1000).toFixed(1)}k` : String(count)
}

/** What each place already holds of one prompt, keyed by place id. */
export type Holds = Readonly<Record<string, Held>>

/**
 * What every place already holds of this prompt, read from the files.
 *
 * Nothing records a delivery: the file being there is the whole answer, and a
 * second copy of that answer kept here would be the one that goes stale when
 * someone deletes a command by hand. `stamp` is what makes a re-read happen —
 * the page raises it after every delivery, so the ticks follow the files.
 *
 * @param prompt — the prompt whose deliveries are asked about.
 * @param places — every place a delivery can go to.
 * @param files — the form's client-file port; `null` disables the question.
 * @param stamp — changes whenever a delivery may have happened.
 */
export function useHolds(
  prompt: StoredPrompt | null,
  places: readonly PromptPlace[],
  files: PlaceFiles | null,
  stamp: number
): Holds {
  const [held, setHeld] = React.useState<Holds>({})

  React.useEffect(() => {
    if (prompt === null || files === null || places.length === 0) return
    let live = true
    void (async () => {
      const answers = await Promise.all(
        places.map(async (place) => {
          try {
            return [place.id, await heldAt(files, place, prompt)] as const
          } catch {
            /* A place whose files cannot be read holds nothing that is known. */
            return [place.id, NOTHING_HELD] as const
          }
        })
      )
      if (live) setHeld(Object.fromEntries(answers))
    })()
    return () => {
      live = false
    }
  }, [prompt, places, files, stamp])

  return held
}

/**
 * What every place holds of every prompt, keyed by prompt id and then place id.
 *
 * One scan for the page rather than one per card: the scope tabs count what
 * each place holds and filter by it, which is a question about every row at
 * once. A card reading the answer for its own row from here keeps the two from
 * disagreeing, and keeps the page from reading the same files twice.
 *
 * @param rows — every prompt the library holds.
 * @param places — every place a delivery can go to.
 * @param files — the form's client-file port; `null` answers with nothing held.
 * @param stamp — changes whenever a delivery may have happened.
 */
export function useHoldsMap(
  rows: readonly StoredPrompt[],
  places: readonly PromptPlace[],
  files: PlaceFiles | null,
  stamp: number
): Readonly<Record<string, Holds>> {
  const [held, setHeld] = React.useState<Readonly<Record<string, Holds>>>({})

  React.useEffect(() => {
    /* Nothing to ask, so nothing is asked: a lookup for a row that is gone finds
       no entry, which reads as "nothing held" without clearing the last answer. */
    if (files === null || places.length === 0 || rows.length === 0) return
    let live = true
    void (async () => {
      const entries = await Promise.all(
        rows.map(async (row) => {
          const answers = await Promise.all(
            places.map(async (place) => {
              try {
                return [place.id, await heldAt(files, place, row)] as const
              } catch {
                return [place.id, NOTHING_HELD] as const
              }
            })
          )
          return [row.id, Object.fromEntries(answers)] as const
        })
      )
      if (live) setHeld(Object.fromEntries(entries))
    })()
    return () => {
      live = false
    }
  }, [rows, places, files, stamp])

  return held
}
