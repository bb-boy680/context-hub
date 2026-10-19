/**
 * The library's own read: published under a name, started by whoever asks, and
 * read again when the answer could have changed.
 *
 * The cases here are the ones that fail where nobody is looking. A read nobody
 * can find is a page that draws an empty library forever. A read started on
 * construction is a machine probed before anybody asked. And a read that asks for
 * itself — which is what watching a service the read itself calls does — is a
 * request loop with nothing in it to stop.
 *
 * Nothing here touches React, a disk or a network: the form, its folder list and
 * its route are all this test's own, and the read is driven through them.
 */
import { Context } from "@deepseek-ai/cordis"
import { afterEach, describe, expect, it, vi } from "vitest"

import { NOTHING_READ, PLUGIN_LIBRARY_SERVICE, PluginLibrary } from "../src/library-store.ts"
import { PLUGIN_SERVICE, type PluginInstaller } from "../src/provider.ts"

/** Every case here answers its own host; none of them keeps one. */
afterEach(() => {
  vi.unstubAllGlobals()
})

/** Let everything a read set going — microtasks and timers alike — finish. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 30))

/**
 * The workspace list as a form provides it, holding one folder and one choice.
 *
 * `tell` is called on every change, including the ones a read makes itself,
 * because that is what the web form's own service does.
 *
 * @returns the service, and the ways a test moves it: `move` is picking another
 *   folder, `choose` is which agents this hub delivers to, and `announce` is any
 *   of the changes that keep both.
 */
function formWorkspaces(ctx: Context) {
  const listeners = new Set<() => void>()
  let folder: string | null = null
  let agents: string[] = []
  const tell = () => {
    for (const listener of [...listeners]) listener()
  }
  const service = {
    current: () => ({ folders: [], current: folder, agents }),
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    /* The first read of the folder list learns the folder; every later one finds
       the same one, which is what makes a moved folder stay moved. */
    refresh: async () => {
      folder ??= "D:/work"
      tell()
    },
    move: (to: string) => {
      folder = to
      tell()
    },
    choose: (id: string, on = true) => {
      agents = on ? [...agents, id] : agents.filter((one) => one !== id)
      tell()
    },
    announce: tell,
  }
  ctx.provide("hub.workspaces", service)
  return service
}

/** Count the calls the library's own read makes, and answer them all the same way. */
function countReads(): () => number {
  let calls = 0
  vi.stubGlobal("fetch", async () => {
    calls += 1
    return { ok: true, json: async () => ({ root: "/library", plugins: [], missing: [] }) }
  })
  return () => calls
}

describe("a library nothing has asked", () => {
  it("is published under its own name, so a form can find and start it", () => {
    const ctx = new Context()
    const library = new PluginLibrary(ctx)

    /* Read through the service rather than compared by identity: what a context
       hands back for a service is its own traced view of the instance, so the
       answer is that this name reaches *this* read and not another one. */
    expect(ctx.get(PLUGIN_LIBRARY_SERVICE)?.state(), "the form cannot find the shared read").toBe(
      library.state()
    )
  })

  it("reads nothing on construction", async () => {
    /* A module being enabled is not a module asked to probe a machine: the
       startup is what asks, and a page that opens before it does. */
    const asked = vi.fn()
    vi.stubGlobal("fetch", asked)
    new PluginLibrary(new Context())
    /* A read that were started here would go out on a microtask, so this waits
       for the ones a start would have run on. */
    await settle()

    expect(asked, "constructing it went to the host on its own").not.toHaveBeenCalled()
  })

  it("answers its own emptiness until something has been read", () => {
    const library = new PluginLibrary(new Context())
    expect(library.state()).toMatchObject({ status: "idle", value: NOTHING_READ, failure: null })
  })
})

describe("watching the folder in use", () => {
  it("settles: the workspace read it makes itself does not ask for another", async () => {
    const ctx = new Context()
    const form = formWorkspaces(ctx)
    const reads = countReads()
    const library = new PluginLibrary(ctx)

    /* The form's own startup read and the page's fallback start, which is the
       pair that runs every cold start. */
    void form.refresh()
    void library.load()
    await settle()
    const soFar = reads()

    await settle()
    expect(reads(), "a workspace announcement kept asking for another read").toBe(soFar)
  })

  it("reads again when the folder moves or the chosen agents change, and not for an announcement", async () => {
    const ctx = new Context()
    const form = formWorkspaces(ctx)
    const reads = countReads()
    const library = new PluginLibrary(ctx)
    void form.refresh()
    await library.load()
    await settle()

    /* A rename, a folder added beside this one: the form announces all of them,
       and none of them changes which client files a read goes through. */
    const before = reads()
    form.announce()
    await settle()
    expect(reads() - before, "an announcement that moves nothing re-read the library").toBe(0)

    form.move("D:/other")
    await settle()
    expect(reads() - before, "moving to another folder did not re-read the library").toBe(1)

    /* Choosing an agent is what adds its client files to the read. */
    const moved = reads()
    form.choose("hub.target.one")
    await settle()
    expect(reads() - moved, "choosing an agent did not re-read the library").toBe(1)

    /* And announcing that choice again is not a second change. */
    form.announce()
    await settle()
    expect(reads() - moved, "the key stayed behind, so every announcement re-read").toBe(1)
  })
})

describe("which clients a read asks", () => {
  it("asks the chosen agents and no others", async () => {
    const ctx = new Context()
    const form = formWorkspaces(ctx)
    form.choose("hub.target.one")
    /* The installer toolkit reaches the form's client files; this form has none,
       which is not what this case is about. */
    ctx.provide("host", { files: null } as never)

    const asked: string[] = []
    const installer = (id: string): PluginInstaller => ({
      id,
      label: id,
      places: [],
      available: async () => {
        asked.push(id)
        return true
      },
      held: async () => [],
      install: async () => ({ message: "" }),
      remove: async () => ({ message: "" }),
    })
    ctx.provide(PLUGIN_SERVICE, {
      installers: () => [installer("hub.target.one"), installer("hub.target.two")],
      tools: {
        root: async () => "/library",
        syncMarketplace: async () => undefined,
        run: async () => "",
        files: null,
        has: async () => true,
        describe: async () => ({ name: "", version: "", description: "" }),
      },
    } as never)

    vi.stubGlobal("fetch", async () => ({
      ok: true,
      json: async () => ({ root: "/library", plugins: [], missing: [] }),
    }))

    const library = new PluginLibrary(ctx)
    await library.load()
    await settle()

    expect(asked, "the chosen agent was not asked").toContain("hub.target.one")
    expect(asked, "an un-chosen agent's command line was run").not.toContain("hub.target.two")
  })
})
