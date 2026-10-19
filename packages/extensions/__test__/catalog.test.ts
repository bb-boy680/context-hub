/**
 * The shared reading layer: one library, read once per generation, watched by
 * everyone who draws it.
 *
 * Almost every assertion here is about a race or a failure, because those are
 * the two things a hand-written loader in a React hook gets wrong and nobody
 * notices: a slow earlier answer replacing a newer one, and a backend that is
 * not there emptying a page that was drawing fine.
 *
 * Nothing here touches React, a disk or a network: what to read is a function.
 */
import { describe, expect, it } from "vitest"

import { createCatalog, mapLimit } from "../src/catalog.ts"

/** A promise a test can settle by hand, for holding a read open. */
function gate<T>() {
  let open!: (value: T) => void
  let shut!: (reason: unknown) => void
  const promise = new Promise<T>((resolve, reject) => {
    open = resolve
    shut = reject
  })
  return { promise, open, shut }
}

/** Let every already-queued microtask run. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe("a catalog nothing has read", () => {
  it("is idle, holds nothing and answers with its starting value", () => {
    const catalog = createCatalog({ initial: { n: 0 }, read: async () => ({ n: 1 }) })
    expect(catalog.state().status).toBe("idle")
    expect(catalog.state().value).toEqual({ n: 0 })
    expect(catalog.state().failure).toBeNull()
    expect(catalog.state().at).toBe(0)
  })

  it("reads once for however many callers ask at once", async () => {
    let reads = 0
    const held = gate<{ n: number }>()
    const catalog = createCatalog({
      initial: null,
      read: async () => {
        reads += 1
        return held.promise
      },
    })

    const first = catalog.load()
    const second = catalog.load()
    held.open({ n: 1 })
    await Promise.all([first, second])

    expect(reads).toBe(1)
    expect(catalog.state()).toMatchObject({ status: "ready", value: { n: 1 }, failure: null })
  })

  it("reads again for a reload that lands while a read is in flight", async () => {
    /* The read under way cannot know what the reload knows, so it goes round
       again rather than the request being dropped. */
    let reads = 0
    const first = gate<{ n: number }>()
    const catalog = createCatalog({
      initial: null,
      read: async () => {
        reads += 1
        if (reads === 1) return first.promise
        return { n: 2 }
      },
    })

    const started = catalog.load()
    /* Let the read actually go out, so the reload lands on a read in flight
       rather than on one that has not started asking yet. */
    await settle()
    const reloaded = catalog.reload()
    first.open({ n: 1 })
    await Promise.all([started, reloaded])

    expect(reads).toBe(2)
    expect(catalog.state().value).toEqual({ n: 2 })
  })

  it("reads once for a reload asked for before the read has started", async () => {
    /* Nothing has been read yet, so the read about to happen already answers
       both calls; going round again would be reading the same thing twice. */
    let reads = 0
    const catalog = createCatalog({
      initial: null,
      read: async () => {
        reads += 1
        return { n: 1 }
      },
    })

    await Promise.all([catalog.load(), catalog.reload()])
    expect(reads).toBe(1)
    expect(catalog.state().value).toEqual({ n: 1 })
  })

  it("reads nothing more for a load once it has an answer", async () => {
    let reads = 0
    const catalog = createCatalog({
      initial: null,
      read: async () => {
        reads += 1
        return { n: reads }
      },
    })

    await catalog.load()
    await catalog.load()
    await catalog.load()
    expect(reads, "opening a page is not a reason to read again").toBe(1)

    /* A reload is, though: that is what a page calls after it writes. */
    await catalog.reload()
    expect(reads).toBe(2)
  })

  it("does not read again for a load that lands on a read already out", async () => {
    /* The whole point of a form starting its own reads: the page that opens a
       moment later asks for the same thing and must be told to wait, not to
       read it a second time. */
    let reads = 0
    const held = gate<{ n: number }>()
    const catalog = createCatalog({
      initial: null,
      read: async () => {
        reads += 1
        return held.promise
      },
    })

    const form = catalog.load()
    await settle()
    const page = catalog.load()
    held.open({ n: 1 })
    await Promise.all([form, page])

    expect(reads, "the page opening caused a second read").toBe(1)
  })
})

describe("a read that fails", () => {
  it("is reported without rejecting the caller and without emptying the value", async () => {
    let reads = 0
    const catalog = createCatalog({
      initial: null,
      read: async () => {
        reads += 1
        if (reads === 1) return { n: 1 }
        throw new Error("the host is not there")
      },
    })

    /* A caller that only wants the load to have been started must not have to
       catch: a backend that is absent is the ordinary case, not an exception. */
    await catalog.load()
    await catalog.reload()

    expect(catalog.state()).toMatchObject({
      status: "error",
      value: { n: 1 },
      failure: "the host is not there",
    })
  })

  it("keeps the status readable while a later read is running", async () => {
    const block = gate<{ n: number }>()
    const catalog = createCatalog({
      initial: null,
      read: async () => {
        if (catalog.state().at === 0) return { n: 1 }
        return block.promise
      },
    })

    await catalog.load()
    const reloaded = catalog.reload()
    await settle()
    /* Not back to a spinner: the page still has an answer to draw. */
    expect(catalog.state()).toMatchObject({ status: "ready", value: { n: 1 } })
    block.open({ n: 2 })
    await reloaded
  })

  it("is idle again when there was never an answer to keep", async () => {
    const catalog = createCatalog({
      initial: null,
      read: async () => {
        throw new Error("nothing here")
      },
    })
    await catalog.load()
    expect(catalog.state()).toMatchObject({ status: "error", value: null })
  })
})

describe("an answer that arrives late", () => {
  it("is dropped rather than replacing the newer one", async () => {
    /* A read that publishes as it goes keeps its committer after it returns,
       and a subprocess's answer can land a second later — by which time a newer
       read owns the screen. Its answer is about the library as it was. */
    let reads = 0
    let stale: ((recipe: (draft: { n: number }) => void) => void) | null = null
    const catalog = createCatalog({
      initial: { n: 0 },
      read: async (commit) => {
        reads += 1
        if (reads === 1) {
          stale = commit
          return { n: 1 }
        }
        return { n: 2 }
      },
    })

    await catalog.load()
    await catalog.reload()
    expect(catalog.state().value).toEqual({ n: 2 })

    /* The first read's late answer. */
    stale!((draft) => {
      draft.n = 99
    })
    expect(catalog.state().value, "a superseded read published over a newer one").toEqual({ n: 2 })
  })
})

describe("watching", () => {
  it("tells each watcher once per real change, and stops when asked to", async () => {
    const catalog = createCatalog({ initial: null, read: async () => ({ n: 1 }) })
    let heard = 0
    const stop = catalog.subscribe(() => {
      heard += 1
    })

    await catalog.load()
    /* Loading, then the answer. */
    expect(heard).toBe(2)

    stop()
    await catalog.reload()
    expect(heard, "a watcher that stopped hearing is not told again").toBe(2)
  })

  it("does not tell anyone when a commit changed nothing", async () => {
    const catalog = createCatalog({
      initial: { rows: { a: 1 } },
      read: async (commit) => {
        commit((draft) => {
          /* A recipe that writes what was already there. */
          draft.rows.a = 1
        })
        return { rows: { a: 1 } }
      },
    })

    let heard = 0
    catalog.subscribe(() => {
      heard += 1
    })
    const before = catalog.state().value
    catalog.update((draft) => {
      draft.rows.a = 1
    })

    expect(catalog.state().value, "the same value, not an equal one").toBe(before)
    expect(heard).toBe(0)
  })

  it("publishes a commit as it lands, before the whole read is done", async () => {
    const block = gate<void>()
    const catalog = createCatalog({
      initial: { rows: {} as Record<string, number> },
      read: async (commit) => {
        commit((draft) => {
          draft.rows.one = 1
        })
        await block.promise
        return { rows: { one: 1, two: 2 } }
      },
    })

    const load = catalog.load()
    await settle()
    /* The first answer is on screen while the rest is still being read, which
       is the whole reason `commit` exists. */
    expect(catalog.state().value).toEqual({ rows: { one: 1 } })

    block.open()
    await load
    expect(catalog.state().value).toEqual({ rows: { one: 1, two: 2 } })
  })

  it("ignores a commit when there is nothing to commit into", () => {
    const catalog = createCatalog<{ n: number }>({
      initial: null,
      read: async (commit) => {
        commit(() => undefined)
        return { n: 1 }
      },
    })
    let heard = 0
    catalog.subscribe(() => {
      heard += 1
    })
    catalog.update(() => {
      throw new Error("this must not be called")
    })
    expect(heard).toBe(0)
  })
})

describe("running jobs a few at a time", () => {
  it("keeps every answer in the order the items were given", async () => {
    const answers = await mapLimit(2, [30, 5, 20, 1], async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms))
      return ms
    })
    expect(answers).toEqual([30, 5, 20, 1])
  })

  it("never runs more than the limit at once", async () => {
    let running = 0
    let most = 0
    await mapLimit(3, Array.from({ length: 12 }, (_one, at) => at), async () => {
      running += 1
      most = Math.max(most, running)
      await new Promise((resolve) => setTimeout(resolve, 1))
      running -= 1
      return null
    })
    expect(most).toBe(3)
  })

  it("runs at least one at a time when the limit is nonsense", async () => {
    expect(await mapLimit(0, [1, 2], async (one) => one)).toEqual([1, 2])
    expect(await mapLimit(-5, [], async (one) => one)).toEqual([])
  })

  it("answers nothing for no items, without running anything", async () => {
    let ran = 0
    expect(
      await mapLimit(4, [], async () => {
        ran += 1
        return null
      })
    ).toEqual([])
    expect(ran).toBe(0)
  })

  it("rejects with the reason, after the jobs already running have settled", async () => {
    /* The point: one item failing must not abandon the work already under way,
       whose effects — a probe's subprocess, a client's command — are happening
       whether or not anyone is waiting for the answer. */
    const release = gate<void>()
    const finished: string[] = []

    const call = mapLimit(2, ["slow", "doomed", "never"], async (item) => {
      if (item === "doomed") throw new Error("this one is broken")
      if (item === "slow") {
        await release.promise
        finished.push(item)
        return item
      }
      finished.push(item)
      return item
    })
    const outcome = call.then(
      () => null,
      (error: unknown) => error
    )

    /* Let both jobs be picked up, so the failure lands beside one in flight. */
    await settle()
    release.open()
    const error = await outcome

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe("this one is broken")
    expect(finished, "the job beside the failing one was abandoned").toEqual(["slow"])
  })
})
