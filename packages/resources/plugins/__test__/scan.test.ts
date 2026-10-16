/**
 * Behaviour of asking every client what it holds: that they are asked at once
 * rather than in turn, that the answers keep the order they were asked in, and
 * that one client failing is one answer rather than the whole scan.
 *
 * Everything runs on stubs — no disk, no client, no network — so this checks the
 * scan's own behaviour rather than any machine's state. The stubs count their own
 * entrances, which is what makes "at once" checkable without timing anything.
 *
 * The cases run in the order they are written, and the first block hands the
 * answers it read to the cases below it.
 */
import { describe, expect, it } from "vitest"

import type { PluginHeld, PluginInstaller, PluginTools } from "../src/provider.ts"
import { probeInstallers, type ClientProbe } from "../src/scan.ts"

/** A toolkit no stub reads: every one here answers without reaching a machine. */
const tools = {
  root: async () => "/library",
  syncMarketplace: async () => undefined,
  run: async () => "",
  /* Required by the type and read by no stub: the client files are the form's,
     and nothing in a scan reaches them. */
  files: null,
  has: async () => true,
  describe: async () => ({ name: "", version: "", description: "" }),
} satisfies PluginTools

/** One pack, as a client would report it. */
function pack(name: string, client: string): PluginHeld {
  return {
    name,
    id: `${name}@${client}`,
    version: "1.0.0",
    scope: "user",
    enabled: true,
    marketplace: client,
    pack: { name: "", version: "", description: "" },
  }
}

/* How many clients have entered `available` so far. Every stub adds to it before
   it awaits anything, so a caller can read how many were asked at once. */
let entered = 0

/**
 * One client, answering with what it is given.
 *
 * @param id — the installer's id, which its answer is read back by.
 * @param packs — what it holds, or the reason it cannot say.
 */
function client(id: string, packs: readonly PluginHeld[] | Error): PluginInstaller {
  return {
    id,
    label: id,
    places: [],
    async available() {
      entered += 1
      return true
    },
    async held() {
      if (packs instanceof Error) throw packs
      return [...packs]
    },
    install: async (name, scope) => ({ message: `${name} at ${scope}` }),
    remove: async (name, scope) => ({ message: `${name} out of ${scope}` }),
  }
}

describe("asking every client at once", () => {
  const clients = [
    client("one", [pack("hud", "one")]),
    client("two", [pack("spell", "two")]),
    client("three", [pack("lint", "three")]),
  ]
  let probes: ClientProbe[]

  it("asks every client before any of them answers", async () => {
    entered = 0
    /* Each stub counts its entrance synchronously, so `entered` reads how many were
       reached before the first of them answered. A scan that awaited one client
       before calling the next would leave this at one. */
    const running = probeInstallers(clients, tools)
    expect(entered, "every client is asked before any of them answers").toBe(3)
    probes = await running
  })

  it("gives one answer per client, in the order they were asked", () => {
    expect(probes, "one answer per client").toHaveLength(3)
    expect(
      probes.map((one) => one.installer.id),
      "the answers keep the order they were asked in"
    ).toEqual(["one", "two", "three"])
  })

  it("carries what an answering client holds, that it is here, and the installer back", () => {
    expect(
      probes[1]?.packs.map((one) => one.name),
      "an answering client carries what it holds"
    ).toEqual(["spell"])
    expect(probes[1]?.error, "and no reason").toBeUndefined()
    expect(
      probes.map((one) => one.available),
      "an answering client reads available"
    ).toEqual([true, true, true])
    expect(probes[0]?.installer.label, "and the installer itself travels back").toBe("one")
  })
})

/* One client's command line says nothing about another's, so a client that failed
   has to be one answer among the rest rather than the whole scan: the others
   answered, and its own words are what says why it did not. */
describe("one client failing", () => {
  it("keeps it among the answers, in its place, with its own words", async () => {
    const mixed = await probeInstallers(
      [
        client("one", [pack("hud", "one")]),
        client("two", new Error("two exited with 1: no such command")),
        client("three", [pack("lint", "three")]),
      ],
      tools
    )

    expect(mixed, "the failing client is still one of the answers").toHaveLength(3)
    expect(
      mixed.map((one) => one.installer.id),
      "and keeps its place among them"
    ).toEqual(["one", "two", "three"])
    expect(mixed[1]?.error, "its own words are carried back").toBe(
      "two exited with 1: no such command"
    )
    expect(mixed[1]?.available, "it still reads as here, since its list is what failed").toBe(true)
    expect(mixed[1]?.packs, "with an unknown list rather than a known-empty one").toHaveLength(0)
    expect(
      mixed.map((one) => ({
        id: one.installer.id,
        packs: one.packs.map((each) => each.name),
        error: one.error,
      })),
      "the clients that answered are untouched by it"
    ).toEqual([
      { id: "one", packs: ["hud"], error: undefined },
      { id: "two", packs: [], error: "two exited with 1: no such command" },
      { id: "three", packs: ["lint"], error: undefined },
    ])
  })
})

/* A client that is not on this machine is not a failure: it has no list, which is
   a different thing from a list that could not be read. */
describe("a client that is not there", () => {
  it("answers as absent, with no packs and no reason", async () => {
    const absent: PluginInstaller = {
      ...client("gone", []),
      available: async () => {
        entered += 1
        return false
      },
      held: async () => {
        throw new Error("a client that is not here is never asked what it holds")
      },
    }
    const missing = await probeInstallers([absent], tools)

    expect(
      missing[0]?.available,
      "a client that is not on this machine answers as absent"
    ).toBe(false)
    expect(missing[0]?.error, "and that is not a failure").toBeUndefined()
    expect(missing[0]?.packs, "with no packs rather than a reason").toHaveLength(0)
  })
})

/* Having failed to look is not the same as having looked and not found it, so a
   client nobody could look for is not offered as a target — and says why, rather
   than reading as one that is simply absent. */
describe("a client that could not be looked for", () => {
  it("is not offered, and says why rather than reading as absent", async () => {
    const unlooked: PluginInstaller = {
      ...client("broken", []),
      available: async () => {
        throw new Error("the bridge is not running")
      },
    }
    const unknown = await probeInstallers([unlooked], tools)

    expect(
      unknown[0]?.available,
      "a client whose presence could not be established is not offered"
    ).toBe(false)
    expect(unknown[0]?.error, "and says why rather than reading as absent").toBe(
      "the bridge is not running"
    )
  })
})

describe("nothing to ask", () => {
  it("yields no answer", async () => {
    const empty = await probeInstallers([], tools)
    expect(empty, "a registry with no installer yields no answer").toHaveLength(0)
  })
})

describe("a client holding nothing", () => {
  it("is not a failure", async () => {
    const idle = await probeInstallers([client("idle", [])], tools)
    expect(idle[0]?.available, "an answering client with no packs is not a failure").toBe(true)
    expect(idle[0]?.packs, "with none read").toHaveLength(0)
    expect(idle[0]?.error, "and no reason").toBeUndefined()
  })
})

/* A thrown value that is not an Error still has to arrive as words, because a
   plugin is somebody else's code and may throw anything at all. */
describe("a client that threw something that is not an Error", () => {
  it("still reads as its own words", async () => {
    const odd = await probeInstallers(
      [
        {
          ...client("odd", []),
          held: async () => {
            throw "a string"
          },
        },
      ],
      tools
    )
    expect(odd[0]?.error, "a thrown string still reads as its own words").toBe("a string")
  })
})
