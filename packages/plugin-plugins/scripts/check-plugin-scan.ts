/**
 * Behaviour check for asking every client what it holds: that they are asked at
 * once rather than in turn, that the answers keep the order they were asked in,
 * and that one client failing is one answer rather than the whole scan.
 *
 * Everything runs on stubs — no disk, no client, no network — so this checks the
 * scan's own behaviour rather than any machine's state. The stubs count their
 * own entrances, which is what makes "at once" checkable without timing anything.
 *
 * Run from the package: `node scripts/check-plugin-scan.ts`
 */
import type { PluginHeld, PluginInstaller, PluginTools } from "../src/provider.ts"
import { probeInstallers } from "../src/scan.ts"

let failures = 0
let checked = 0

function check(what: string, ok: boolean, detail?: unknown) {
  checked += 1
  if (ok) {
    console.log(`  ok   ${what}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${what}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`)
}

/** A toolkit no stub reads: every one here answers without reaching a machine. */
const tools = {
  root: async () => "/library",
  syncMarketplace: async () => undefined,
  run: async () => "",
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
    scopes: ["user"],
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

console.log("asking every client at once")

entered = 0
const clients = [
  client("one", [pack("hud", "one")]),
  client("two", [pack("spell", "two")]),
  client("three", [pack("lint", "three")]),
]
/* Each stub counts its entrance synchronously, so `entered` reads how many were
   reached before the first of them answered. A scan that awaited one client
   before calling the next would leave this at one. */
const running = probeInstallers(clients, tools)
check("every client is asked before any of them answers", entered === 3, entered)
const probes = await running

check("one answer per client", probes.length === 3, probes.length)
check(
  "the answers keep the order they were asked in",
  probes.map((one) => one.installer.id).join() === "one,two,three",
  probes.map((one) => one.installer.id)
)
check(
  "an answering client carries what it holds and no reason",
  probes[1]?.packs.map((one) => one.name).join() === "spell" && probes[1]?.error === undefined,
  probes[1]
)
check("an answering client reads available", probes.every((one) => one.available))
check("and the installer itself travels back", probes[0]?.installer.label === "one", probes[0]?.installer)

console.log("one client failing")

const mixed = await probeInstallers(
  [
    client("one", [pack("hud", "one")]),
    client("two", new Error("two exited with 1: no such command")),
    client("three", [pack("lint", "three")]),
  ],
  tools
)

check("the failing client is still one of the answers", mixed.length === 3, mixed.length)
check(
  "and keeps its place among them",
  mixed.map((one) => one.installer.id).join() === "one,two,three",
  mixed.map((one) => one.installer.id)
)
check(
  "its own words are carried back",
  mixed[1]?.error === "two exited with 1: no such command",
  mixed[1]?.error
)
check(
  "it reads unavailable to act on, since its list is unknown",
  mixed[1]?.available === true && mixed[1]?.packs.length === 0,
  mixed[1]
)
check(
  "the clients that answered are untouched by it",
  mixed[0]?.packs.map((one) => one.name).join() === "hud" &&
    mixed[2]?.packs.map((one) => one.name).join() === "lint" &&
    mixed[0]?.error === undefined &&
    mixed[2]?.error === undefined,
  [mixed[0], mixed[2]]
)

console.log("a client that is not there, and one that could not be looked for")

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
check("a client that is not on this machine answers as absent", missing[0]?.available === false, missing[0])
check("and that is not a failure", missing[0]?.error === undefined, missing[0]?.error)
check("with no packs rather than a reason", missing[0]?.packs.length === 0, missing[0])

const unlooked: PluginInstaller = {
  ...client("broken", []),
  available: async () => {
    throw new Error("the bridge is not running")
  },
}
const unknown = await probeInstallers([unlooked], tools)
check(
  "a client whose presence could not be established is not offered",
  unknown[0]?.available === false,
  unknown[0]
)
check(
  "and says why rather than reading as absent",
  unknown[0]?.error === "the bridge is not running",
  unknown[0]?.error
)

console.log("nothing to ask")

const empty = await probeInstallers([], tools)
check("a registry with no installer yields no answer", empty.length === 0, empty.length)

console.log("a client holding nothing")

const idle = await probeInstallers([client("idle", [])], tools)
check(
  "an answering client with no packs is not a failure",
  idle[0]?.available === true && idle[0]?.packs.length === 0 && idle[0]?.error === undefined,
  idle[0]
)

/* A thrown value that is not an Error still has to arrive as words, because a
   plugin is somebody else's code and may throw anything at all. */
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
check("a thrown string still reads as its own words", odd[0]?.error === "a string", odd[0]?.error)

console.log(`\n${failures === 0 ? "all checks passed" : `${String(failures)} failed`} (${String(checked)} checks)`)
process.exit(failures === 0 ? 0 : 1)
