/**
 * Behaviour check for the catalog rows: folding the agents' answers into one
 * entry per pack, merging them with the library's records, and which tab a row
 * lands in.
 *
 * Everything runs on values made up here — no disk, no client, no network — so
 * this checks the page's own logic rather than any machine's state.
 *
 * Run from the package: `node scripts/check-plugin-rows.ts`
 */
import type { ExtensionIcon } from "@workspace/extensions"

import type { PluginRecord } from "../src/revision.ts"
import { collectScanned, composeRows, rowsForTab, type ScannedAnswer } from "../src/rows.ts"

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

/** A mark stands in for an agent's own icon; a row only carries it. */
const mark: ExtensionIcon = () => null

/** A library record with only what a row reads. */
function record(name: string): PluginRecord {
  return {
    name,
    version: "1.0.0",
    description: `${name} does things`,
    tags: [],
    source: { kind: "url", url: "https://example.com/pack.git", revision: "abc123" },
    hash: "hash",
    icon: "",
    assets: [],
    installedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: new Date().toISOString(),
  }
}

const answers: ScannedAnswer[] = [
  {
    client: "hub.target.claude-code",
    label: "Claude Code",
    icon: mark,
    packs: [
      {
        name: "hud",
        id: "hud@hud",
        version: "0.8.0",
        scope: "user",
        enabled: true,
        marketplace: "hud",
        source: { kind: "local", path: "/cache/hud/0.8.0" },
        pack: {
          name: "claude-hud",
          version: "1.0.0",
          description: "A statusline HUD",
          icon: "assets/hud-logo-3f9a2b1c.png",
        },
      },
      {
        name: "hud",
        id: "hud@hud",
        version: "0.8.0",
        scope: "project",
        enabled: true,
        marketplace: "hud",
        source: { kind: "local", path: "/cache/hud/0.8.0" },
        pack: {
          name: "claude-hud",
          version: "1.0.0",
          description: "A statusline HUD",
          icon: "assets/hud-logo-3f9a2b1c.png",
        },
      },
    ],
  },
  {
    client: "hub.target.codex",
    label: "Codex",
    icon: mark,
    packs: [
      {
        name: "hud",
        id: "hud@curated",
        version: "0.7.0",
        scope: "user",
        enabled: true,
        marketplace: "curated",
        source: { kind: "local", path: "/codex/hud" },
        pack: { name: "", version: "", description: "" },
      },
    ],
  },
]

console.log("folding the agents' answers")

const scanned = collectScanned(answers)
check("one pack stays one entry", scanned.length === 1, scanned.map((one) => one.name))
check(
  "every agent holding it is named, in the order they answered",
  scanned[0]?.held.map((one) => one.client).join() === "hub.target.claude-code,hub.target.codex",
  scanned[0]?.held.map((one) => one.client)
)
check(
  "the scopes one agent holds it in are gathered",
  scanned[0]?.held[0]?.scopes.join() === "user,project",
  scanned[0]?.held[0]?.scopes
)
check(
  "the pack's own version answers where it declares one",
  scanned[0]?.version === "1.0.0",
  scanned[0]?.version
)
check(
  "and the client's reading of it where it declares none",
  collectScanned([
    {
      client: "hub.target.codex",
      label: "Codex",
      icon: mark,
      packs: [
        {
          name: "bare",
          id: "bare@curated",
          version: "0.7.0",
          scope: "user",
          enabled: true,
          marketplace: "curated",
          pack: { name: "", version: "", description: "" },
        },
      ],
    },
  ])[0]?.version === "0.7.0"
)
check(
  "what the pack says about itself travels with it",
  scanned[0]?.description === "A statusline HUD" && scanned[0]?.icon === "assets/hud-logo-3f9a2b1c.png",
  scanned[0]
)
check(
  "the directory it sits in is read as a local source",
  scanned[0]?.source?.kind === "local" && scanned[0].source.path === "/cache/hud/0.8.0",
  scanned[0]?.source
)
check(
  "the agent's own label and mark travel with it",
  scanned[0]?.held[0]?.label === "Claude Code" && scanned[0]?.held[0]?.icon === mark,
  scanned[0]?.held[0]
)

console.log("merging the library and the agents")

const rows = composeRows([record("stored")], scanned, "en", (key) => key)
check("the library's pack and the agent's pack are two rows", rows.length === 2, rows.length)
check(
  "the library's row is stored and keeps its own fields",
  rows[0]?.stored === true && rows[0]?.name === "stored" && rows[0]?.description === "stored does things",
  rows[0]
)
check(
  "the agent's row is not stored and carries its holders",
  rows[1]?.stored === false && rows[1]?.name === "hud" && rows[1]?.held.length === 2,
  rows[1]
)
check(
  "and it says what the pack says about itself",
  rows[1]?.description === "A statusline HUD" && rows[1]?.icon === "/hub/files/assets/hud-logo-3f9a2b1c.png",
  rows[1]
)
/* A pack only an agent holds came from a directory on this machine — the very
   directory the agent reads it from — so its row says so rather than naming the
   agent in the source's place. Which agents hold it is what the marks are for. */
check("a pack only an agent holds reads as a local one", rows[1]?.source === "local", rows[1]?.source)
check(
  "a pack collected from a repository reads as the repository",
  rows[0]?.source === "repo",
  rows[0]?.source
)
check(
  "one collected from a subdirectory reads as one",
  composeRows(
    [
      {
        ...record("mono"),
        source: {
          kind: "git-subdir",
          url: "https://example.com/mono.git",
          path: "tools/mono",
          revision: "abc123",
        },
      },
    ],
    [],
    "en",
    (key) => key
  )[0]?.source === "subdir"
)
check(
  "one collected from an archive reads as an archive",
  composeRows(
    [{ ...record("zipped"), source: { kind: "archive", url: "https://x.test/a.zip" } }],
    [],
    "en",
    (key) => key
  )[0]?.source === "archive"
)
check(
  "and one copied from a folder here reads as local",
  composeRows(
    [{ ...record("copied"), source: { kind: "local", path: "/packs/copied" } }],
    [],
    "en",
    (key) => key
  )[0]?.source === "local"
)
check(
  "a library row draws the mark the hub copied out of the pack",
  composeRows([{ ...record("stored"), icon: "assets/stored-logo-3f9a2b1c.png" }], [], "en", (key) => key)[0]?.icon ===
    "/hub/files/assets/stored-logo-3f9a2b1c.png",
  composeRows([{ ...record("stored"), icon: "assets/stored-logo-3f9a2b1c.png" }], [], "en", (key) => key)[0]?.icon
)
check(
  "and the mark also fills the card until a picture is added",
  composeRows([{ ...record("stored"), icon: "assets/stored-logo-3f9a2b1c.png" }], [], "en", (key) => key)[0]?.cover ===
    "/hub/files/assets/stored-logo-3f9a2b1c.png"
)
check(
  "a picture a person added is what the card draws instead",
  composeRows(
    [{ ...record("stored"), icon: "assets/stored-logo-3f9a2b1c.png", assets: ["assets/stored-shot-8d1c40aa.png"] }],
    [],
    "en",
    (key) => key
  )[0]?.cover === "/hub/files/assets/stored-shot-8d1c40aa.png"
)
check(
  "a pack with no picture of its own draws none",
  composeRows([record("stored")], [], "en", (key) => key)[0]?.icon === undefined &&
    composeRows([record("stored")], [], "en", (key) => key)[0]?.cover === undefined
)

const both = composeRows([record("hud")], scanned, "en", (key) => key)
check("a pack both sides know is one row", both.length === 1, both.length)
check(
  "and it is the library's row",
  both[0]?.stored === true && both[0]?.description === "hud does things",
  both[0]
)
check(
  "which still names the agents holding it",
  both[0]?.held.length === 2,
  both[0]?.held.length
)

console.log("which tab a row lands in")

const catalog = composeRows([record("stored"), record("idle")], scanned, "en", (key) => key)
const delivered = ["stored"]
check(
  "every row is in all",
  rowsForTab(catalog, "all", delivered).length === 3,
  rowsForTab(catalog, "all", delivered).length
)
check(
  "delivered packs are the installed tab",
  rowsForTab(catalog, "installed", delivered).map((one) => one.name).join() === "stored",
  rowsForTab(catalog, "installed", delivered).map((one) => one.name)
)
check(
  "library packs nothing delivered are the available tab",
  rowsForTab(catalog, "available", delivered).map((one) => one.name).join() === "idle",
  rowsForTab(catalog, "available", delivered).map((one) => one.name)
)
check(
  "packs only an agent holds are the unstored tab",
  rowsForTab(catalog, "unstored", delivered).map((one) => one.name).join() === "hud",
  rowsForTab(catalog, "unstored", delivered).map((one) => one.name)
)
check(
  "a pack the library took in leaves the unstored tab",
  rowsForTab(both, "unstored", []).length === 0,
  rowsForTab(both, "unstored", []).length
)

console.log(`\n${failures === 0 ? "all checks passed" : `${String(failures)} failed`} (${String(checked)} checks)`)
process.exit(failures === 0 ? 0 : 1)
