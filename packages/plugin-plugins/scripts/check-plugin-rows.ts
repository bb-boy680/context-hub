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

import type { PluginHeld } from "../src/provider.ts"
import type { PluginRecord } from "../src/revision.ts"
import {
  collectScanned,
  composeRows,
  rowsForTab,
  scopeReached,
  scopeWords,
  type ScannedAnswer,
} from "../src/rows.ts"

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
/* An agent can hold a pack this hub never delivered, and such a pack came from
   whatever marketplace supplied it. The agent's own id names that marketplace,
   and it is the only thing its own commands take back — so it has to reach the
   row, or the way out of that place cannot be built. */
check(
  "each agent's own id for the pack travels with its hold",
  scanned[0]?.held.map((one) => one.id).join() === "hud@hud,hud@curated",
  scanned[0]?.held.map((one) => one.id)
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
/* The word above says which kind of source it is; the address is the one thing
   a person can read back and open, so the two have to be read from the same
   origin and cannot be spelled apart. */
console.log("the address a row shows for its source")
{
  const address = (source: PluginRecord["source"]) =>
    composeRows([{ ...record("one"), source }], [], "en", (key) => key)[0]?.sourceAddress
  check(
    "a repository reads back as the address it was collected from",
    address({ kind: "url", url: "https://example.com/pack.git", revision: "abc123" }) ===
      "https://example.com/pack.git",
    address({ kind: "url", url: "https://example.com/pack.git", revision: "abc123" })
  )
  check(
    "the ref it was taken at travels with it",
    address({ kind: "url", url: "https://example.com/pack.git", ref: "v2", revision: "abc123" }) ===
      "https://example.com/pack.git#v2"
  )
  check(
    "a subdirectory pack names the directory inside the repository",
    address({
      kind: "git-subdir",
      url: "https://example.com/mono.git",
      path: "tools/mono",
      revision: "abc123",
    }) === "https://example.com/mono.git/tools/mono"
  )
  check(
    "an archive reads back as its URL",
    address({ kind: "archive", url: "https://x.test/a.zip" }) === "https://x.test/a.zip"
  )
  check(
    "a folder here reads back as its path",
    address({ kind: "local", path: "/packs/copied" }) === "/packs/copied"
  )
  check(
    "a pack only an agent holds names the directory that agent reads it from",
    composeRows([], scanned, "en", (key) => key)[0]?.sourceAddress === "/cache/hud/0.8.0",
    composeRows([], scanned, "en", (key) => key)[0]?.sourceAddress
  )
  /* The files panel reads that directory, so the row has to carry it and not
     only the word a person reads. A pack the hub holds needs no path: the host
     resolves its own copy from the name. */
  check(
    "and the row carries that directory for the files panel to read",
    composeRows([], scanned, "en", (key) => key)[0]?.directory === "/cache/hud/0.8.0",
    composeRows([], scanned, "en", (key) => key)[0]?.directory
  )
  check(
    "while a pack the hub holds carries none",
    composeRows([record("stored")], [], "en", (key) => key)[0]?.directory === undefined
  )
}
/* A check is a moment, not a state: a row nobody has asked about has no age to
   print, and printing one would claim an answer that was never taken. */
console.log("how long ago the source was last asked")
{
  const age = (checked?: PluginRecord["checked"]) =>
    composeRows([{ ...record("one"), checked }], [], "en", (key) => key)[0]?.checkedAge
  check("a pack nobody asked about carries no age", age() === "")
  {
    /* Away from zero, because a check a moment ago is worded "now"; the point
       here is that the recorded moment is read, not which word it takes. */
    const threeMinutesAgo = new Date(Date.now() - 3 * 60_000).toISOString()
    const shown = age({ at: threeMinutesAgo, latest: "abc123", currentHash: "hash" })
    check("one that was asked carries how long ago", shown?.includes("minute") === true, shown)
  }
  check(
    "a pack only an agent holds has been asked about nothing",
    composeRows([], scanned, "en", (key) => key)[0]?.checkedAge === ""
  )
}
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

console.log("the words one agent's scopes wear")

/* A scope is often named by a phrase that already contains a wider one, so a
   line joining them would say the wider one twice. Claude Code is the case: its
   `project` is "this repository" and its `local` is "this repository, only me". */
{
  /* The real English words, so the check reads the way the row does. */
  const words: Record<string, string> = {
    "plugins.scope.user": "This machine",
    "plugins.scope.project": "This repository",
    "plugins.scope.local": "This repository, only me",
  }
  const t = (key: string) => words[key] ?? key

  check(
    "a wider scope a narrower one already says is not printed twice",
    scopeWords(["project", "local"], t) === "This repository, only me",
    scopeWords(["project", "local"], t)
  )
  check(
    "a scope whose word stands on its own is always shown",
    scopeWords(["project"], t) === "This repository" &&
      scopeWords(["user"], t) === "This machine"
  )
  check(
    "and two words that say different things both stay",
    scopeWords(["user", "project"], t) === "This machine · This repository",
    scopeWords(["user", "project"], t)
  )
  check(
    "a word this build has no key for is shown as the agent spelled it",
    scopeWords(["workspace"], t) === "workspace"
  )
  check("an agent holding a pack nowhere says nothing", scopeWords([], t) === "")
}

console.log("which place a group's action reaches")

/* The workspace group spans two places. Acting on both would write the
   repository's shared scope from a row that also stands for the private one. */
check(
  "the workspace group reaches the repository's shared scope, not the private one",
  scopeReached(["user", "project", "local"], "workspace") === "project",
  scopeReached(["user", "project", "local"], "workspace")
)
check(
  "a group of one reaches that one",
  scopeReached(["user", "project", "local"], "global") === "user",
  scopeReached(["user", "project", "local"], "global")
)
check(
  "an agent keeping only the private scope there still lands somewhere",
  scopeReached(["user", "local"], "workspace") === "local",
  scopeReached(["user", "local"], "workspace")
)
check(
  "an agent keeping nothing in the group reaches nothing",
  scopeReached(["user"], "workspace") === undefined &&
    scopeReached(["project", "local"], "global") === undefined
)

console.log("which tab a row lands in")

const catalog = composeRows([record("stored"), record("idle")], scanned, "en", (key) => key)
check(
  "every row is in all",
  rowsForTab(catalog, "all").length === 3,
  rowsForTab(catalog, "all").length
)
check(
  "the packs the hub holds the files of are the library tab",
  rowsForTab(catalog, "library").map((one) => one.name).join() === "stored,idle",
  rowsForTab(catalog, "library").map((one) => one.name)
)
check(
  "a pack only an agent holds is not one of them",
  !rowsForTab(catalog, "library").some((one) => one.name === "hud"),
  rowsForTab(catalog, "library").map((one) => one.name)
)
check(
  "packs only an agent holds are the unstored tab",
  rowsForTab(catalog, "unstored").map((one) => one.name).join() === "hud",
  rowsForTab(catalog, "unstored").map((one) => one.name)
)
check(
  "the two divide the catalog between them",
  rowsForTab(catalog, "library").length + rowsForTab(catalog, "unstored").length ===
    rowsForTab(catalog, "all").length,
  [rowsForTab(catalog, "library").length, rowsForTab(catalog, "unstored").length]
)
check(
  "a pack the library took in leaves the unstored tab",
  rowsForTab(both, "unstored").length === 0,
  rowsForTab(both, "unstored").length
)

console.log("which tab a row lands in, once a source has moved")

/* A record is only behind its source when a check recorded a revision to
   compare against, so only a checked pack can reach the updates tab. */
const behind = {
  ...record("behind"),
  checked: { at: "2026-02-01T00:00:00.000Z", latest: "def456", currentHash: "hash" },
}
const checkedCatalog = composeRows([record("stored"), behind], scanned, "en", (key) => key)
check(
  "a checked pack the source has moved past is the updates tab",
  rowsForTab(checkedCatalog, "updates").map((one) => one.name).join() === "behind",
  rowsForTab(checkedCatalog, "updates").map((one) => one.name)
)
check(
  "and a pack nothing checked is not",
  rowsForTab(catalog, "updates").length === 0,
  rowsForTab(catalog, "updates").length
)
check(
  "nor is one only an agent holds",
  rowsForTab(catalog, "updates").every((one) => one.stored),
  rowsForTab(catalog, "updates").map((one) => one.name)
)

console.log("which tab a row lands in, by the place it sits in")

/* A roster of its own, so that a pack held in the repository and one held only
   machine-wide are both on it: the two scope tabs have to tell them apart rather
   than agree because every pack happens to be in both. */
function held(name: string, scope: string): PluginHeld {
  return {
    name,
    id: `${name}@curated`,
    version: "1.0.0",
    scope,
    enabled: true,
    marketplace: "curated",
    pack: { name, version: "1.0.0", description: "" },
  }
}

const scopePlaces = composeRows(
  [],
  collectScanned([
    {
      client: "hub.target.claude-code",
      label: "Claude Code",
      icon: mark,
      packs: [held("here", "project"), held("everywhere", "user")],
    },
    {
      client: "hub.target.codex",
      label: "Codex",
      icon: mark,
      packs: [held("away", "user")],
    },
  ]),
  "en",
  (key) => key
)

check(
  "a pack an agent holds inside the repository is the workspace tab",
  rowsForTab(scopePlaces, "workspace").map((one) => one.name).join() === "here",
  rowsForTab(scopePlaces, "workspace").map((one) => one.name)
)
check(
  "one held only machine-wide is not, whoever holds it",
  !rowsForTab(scopePlaces, "workspace").some((one) => one.name === "away"),
  rowsForTab(scopePlaces, "workspace").map((one) => one.name)
)
check(
  "every pack an agent holds machine-wide is the global tab",
  rowsForTab(scopePlaces, "global").map((one) => one.name).join() === "everywhere,away",
  rowsForTab(scopePlaces, "global").map((one) => one.name)
)
check(
  "and one held only inside the repository is not",
  !rowsForTab(scopePlaces, "global").some((one) => one.name === "here"),
  rowsForTab(scopePlaces, "global").map((one) => one.name)
)
check(
  "narrowed to the agent that holds it here, the workspace tab keeps it",
  rowsForTab(scopePlaces, "workspace", "hub.target.claude-code")
    .map((one) => one.name)
    .join() === "here"
)
check(
  "narrowed to the one that only holds machine-wide, the workspace tab is empty",
  rowsForTab(scopePlaces, "workspace", "hub.target.codex").length === 0,
  rowsForTab(scopePlaces, "workspace", "hub.target.codex").map((one) => one.name)
)
check(
  "while the global tab narrowed to it keeps the one it does hold",
  rowsForTab(scopePlaces, "global", "hub.target.codex")
    .map((one) => one.name)
    .join() === "away"
)

console.log(`\n${failures === 0 ? "all checks passed" : `${String(failures)} failed`} (${String(checked)} checks)`)
process.exit(failures === 0 ? 0 : 1)
