/**
 * One library, read once and watched by everyone who draws it.
 *
 * The four asset pages used to read their own data inside their own hook, so
 * leaving a page threw its rows away and coming back read them again — which is
 * why a global search could not find anything in a session that had never
 * opened those pages. This is the piece they share: a read that happens once
 * per generation, a snapshot anyone can watch, and a place for the answer to be
 * touched up as more of it arrives.
 *
 * It holds no transport and no React: what to read arrives as a function, and
 * who to tell arrives as a listener. That is what lets the browser form start a
 * load before anything is drawn, and lets a component watch a slice of it
 * without re-rendering when a different slice changes.
 */
import { produce } from "immer"

/** Where a library is in its own life: not asked yet, being read, or answered. */
export type CatalogStatus = "idle" | "loading" | "ready" | "error"

/** What a watcher sees: one immutable snapshot, replaced whole on every change. */
export interface CatalogState<S> {
  status: CatalogStatus
  /**
   * The last answer read, kept across later failures.
   *
   * A read that fails does not empty this: what was read is still what is true
   * of the library a moment ago, and a page drawn from it beats a page drawn
   * from nothing. `failure` is what says the answer may be stale.
   */
  value: S | null
  /** Why the last read failed, cleared by the next one that does not. */
  failure: string | null
  /** When `value` was read, in epoch milliseconds; 0 while nothing has been. */
  at: number
}

/** A read that can publish part of its answer before the whole one is ready. */
export type Commit<S> = (recipe: (draft: S) => void) => void

/** One library as its watchers and its owner use it. */
export interface Catalog<S> {
  /** The current snapshot; the same object until something changes. */
  state(): CatalogState<S>
  /** Watch for replacements. */
  subscribe(listener: () => void): () => void
  /**
   * Read if there is nothing to serve. Concurrent calls fold into the read that
   * is already running, so starting the same load twice reads once.
   */
  load(): Promise<void>
  /**
   * Read again and replace what is held. What a page calls once it has written
   * something, so the next page it draws is the library as it now is.
   */
  reload(): Promise<void>
  /**
   * Touch the held value up in place — one row's probe answer landing, say.
   *
   * @param recipe — given a draft to change. A recipe that changes nothing
   * returns the same value, and nothing is announced.
   */
  update(recipe: (draft: S) => void): void
}

/** What {@link createCatalog} needs: what to start from, and how to read. */
export interface CatalogOptions<S> {
  /** The value before anything has been read, when there is one. */
  initial: S | null
  /**
   * Read the library.
   *
   * @param commit — publish the value built so far, for a read made of several
   * calls that land at different times. Before the first answer is returned
   * there is nothing to commit into; a read that publishes as it goes returns
   * the whole value at the end as well.
   * @returns the whole answer.
   */
  read: (commit: Commit<S>) => Promise<S>
}

/** One reason, as a sentence a page can print. */
function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Create a catalog over one library.
 *
 * @param options — what to start from, and how to read.
 * @returns the catalog; a failed read writes `failure` and never rejects, so a
 *   caller can start one and not care.
 */
export function createCatalog<S>(options: CatalogOptions<S>): Catalog<S> {
  let held: CatalogState<S> = {
    status: "idle",
    value: options.initial,
    failure: null,
    at: 0,
  }
  const listeners = new Set<() => void>()
  let inFlight: Promise<void> | null = null
  /* A read asked for while one is running: the running one cannot know what it
     could not have known, so it goes round again rather than the request being
     lost or a second read racing it. */
  let rerun = false
  /* Which read owns the screen. A read finishing after a newer one started
     carries an older library, and would replace the newer answer with it. */
  let generation = 0

  const announce = () => {
    for (const listener of [...listeners]) listener()
  }

  const publish = (next: Partial<CatalogState<S>>): void => {
    held = { ...held, ...next }
    announce()
  }

  const commit: Commit<S> = (recipe) => {
    if (held.value === null) return
    const next = produce(held.value, recipe)
    /* `produce` hands back the same object when the recipe changed nothing,
       which is what keeps an empty commit from re-rendering every watcher. */
    if (next === held.value) return
    publish({ value: next, at: Date.now() })
  }

  /**
   * The committer one read owns.
   *
   * A read may publish after it has returned — a probe whose answer arrives a
   * second later, say — and by then a newer read may own the screen. Its
   * answers are about the library as it was, so they are dropped rather than
   * written over an answer that is already newer.
   */
  const committerFor = (current: number): Commit<S> => (recipe) => {
    if (current !== generation) return
    commit(recipe)
  }

  const run = async (): Promise<void> => {
    do {
      rerun = false
      const current = ++generation
      /* Only from idle: once an answer is held, asking again must not take the
         page back to a spinner over data it already has. */
      if (held.status === "idle") publish({ status: "loading" })
      try {
        const value = await options.read(committerFor(current))
        if (current !== generation) continue
        publish({ status: "ready", value, failure: null, at: Date.now() })
      } catch (error) {
        if (current !== generation) continue
        /* `error` rather than `ready`: the value is kept, but a caller asking
           again later is asking about something that did not answer. */
        publish({ status: "error", failure: reasonOf(error) })
      }
    } while (rerun)
  }

  const start = (): Promise<void> => {
    if (inFlight !== null) {
      rerun = true
      return inFlight
    }
    /* The slot is claimed before anything can synchronously reenter `load`: the
       loading publication above runs a listener, and a listener that loads
       again would otherwise start a second read. */
    const running = Promise.resolve().then(() => run())
    const settled = running.finally(() => {
      inFlight = null
    })
    inFlight = settled
    return settled
  }

  return {
    state: () => held,

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    load() {
      if (inFlight !== null) {
        rerun = true
        return inFlight
      }
      /* Already answered: a page opening is not a reason to read again. */
      if (held.status === "ready") return Promise.resolve()
      return start()
    },

    reload: start,

    update(recipe) {
      if (held.value !== null) commit(recipe)
    },
  }
}

/**
 * Run one job per item, at most `limit` of them at a time.
 *
 * A page that asks a machine several questions at once must not ask a hundred:
 * each MCP probe starts a process, and each installer probe runs a client's own
 * command line. Asking them one after another instead makes the page wait for
 * the sum of them, so this is the middle: several at a time, never more.
 *
 * The answers come back in the order the items were given, whatever order they
 * finished in.
 *
 * @param limit — how many run at once; at least one.
 * @param items — what to run over.
 * @param run — one item's job, told where it was in the list.
 * @throws the first job's reason, once the jobs already running have settled. A
 *   job that fails stops new ones from starting but does not abandon the ones
 *   under way, whose effects are already happening.
 */
export async function mapLimit<T, R>(
  limit: number,
  items: readonly T[],
  run: (item: T, at: number) => Promise<R>
): Promise<R[]> {
  const answers = new Array<R>(items.length)
  const width = Math.max(1, Math.min(Math.floor(limit), items.length))
  let next = 0
  let failed: { error: unknown } | null = null

  const worker = async (): Promise<void> => {
    for (;;) {
      if (failed !== null) return
      const at = next
      next += 1
      if (at >= items.length) return
      try {
        answers[at] = await run(items[at] as T, at)
      } catch (error) {
        failed ??= { error }
      }
    }
  }

  await Promise.all(Array.from({ length: width }, worker))
  if (failed !== null) throw (failed as { error: unknown }).error
  return answers
}
