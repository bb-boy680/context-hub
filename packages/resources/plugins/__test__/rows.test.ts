/**
 * Behaviour of the catalog rows: folding the agents' answers into one entry per
 * pack, merging them with the library's records, and which tab a row lands in.
 *
 * Everything runs on values made up here — no disk, no client, no network — so
 * this checks the page's own logic rather than any machine's state. Nothing here
 * touches a real filesystem, so there is no temporary root to clean up.
 *
 * The fixtures are shared by every case below; each case reads them and none
 * writes to them, so the order they are written in is only a reading order.
 */
import { describe, expect, it } from "vitest"

import type { ExtensionIcon } from "@context-hub/extensions"

import type { PluginClient } from "../src/library.ts"
import type { PluginHeld, PluginPlace } from "../src/provider.ts"
import type { PluginRecord } from "../src/revision.ts"
import {
  collectScanned,
  composeRows,
  rowsForTab,
  placeReached,
  placesShown,
  scopeWords,
  type ScannedAnswer,
} from "../src/rows.ts"
import type { PluginRow } from "../src/types.ts"

/** A mark stands in for an agent's own icon; a row only carries it. */
const mark: ExtensionIcon = () => null

/**
 * The locale lookup, read back as the key itself: which key a row asks for is
 * what these cases are about, not how it reads.
 */
const plain = (key: string) => key

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

/** One pack an agent holds, as that agent's own list reports it. */
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

/** What Claude Code answered: one pack, held in two of its places. */
const claudeCode: ScannedAnswer = {
  client: "hub.target.claude-code",
  label: "Claude Code",
  icon: mark,
  switches: {},
  places: [
    {
      id: "cc-user",
      label: "Claude Code",
      scope: "global",
      scopeWord: "user",
      switchable: true,
      file: ".claude/settings.json",
    },
    {
      id: "cc-project",
      label: "Claude Code",
      scope: "workspace",
      scopeWord: "project",
      switchable: true,
      file: ".claude/settings.json",
    },
  ],
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
}

/** What Codex answered: the same pack, off in this agent and on in the other. */
const codex: ScannedAnswer = {
  client: "hub.target.codex",
  label: "Codex",
  icon: mark,
  switches: {},
  places: [
    { id: "codex-user", label: "Codex", scope: "global", scopeWord: "user", switchable: false },
  ],
  packs: [
    {
      name: "hud",
      id: "hud@curated",
      version: "0.7.0",
      scope: "user",
      enabled: false,
      marketplace: "curated",
      source: { kind: "local", path: "/codex/hud" },
      pack: { name: "", version: "", description: "" },
    },
  ],
}

const answers: ScannedAnswer[] = [claudeCode, codex]
const scanned = collectScanned(answers)
const rows = composeRows([record("stored")], scanned, "en", plain)
const both = composeRows([record("hud")], scanned, "en", plain)
const catalog = composeRows([record("stored"), record("idle")], scanned, "en", plain)
const behind: PluginRecord = {
  ...record("behind"),
  checked: { at: "2026-02-01T00:00:00.000Z", latest: "def456", currentHash: "hash" },
}
const checkedCatalog = composeRows([record("stored"), behind], scanned, "en", plain)

/* A roster of its own, for the two scope tabs, so that a pack held in the
   repository and one held only machine-wide are both on it: the tabs have to tell
   them apart rather than agree because every pack happens to be in both. */
const scopePlaces = composeRows(
  [],
  collectScanned([
    {
      client: "hub.target.claude-code",
      label: "Claude Code",
      icon: mark,
      switches: {},
      places: [
        {
          id: "cc-user",
          label: "Claude Code",
          scope: "global",
          scopeWord: "user",
          switchable: true,
        },
        {
          id: "cc-project",
          label: "Claude Code",
          scope: "workspace",
          scopeWord: "project",
          switchable: true,
        },
      ],
      packs: [held("here", "project"), held("everywhere", "user")],
    },
    {
      client: "hub.target.codex",
      label: "Codex",
      icon: mark,
      switches: {},
      places: [
        { id: "codex-user", label: "Codex", scope: "global", scopeWord: "user", switchable: false },
      ],
      packs: [held("away", "user")],
    },
  ]),
  "en",
  plain
)

describe("folding the agents' answers", () => {
  it("keeps one pack as one entry", () => {
    expect(scanned, "one pack stays one entry").toHaveLength(1)
  })

  it("names every agent holding it, in the order they answered", () => {
    expect(
      scanned[0]?.held.map((one) => one.client),
      "every agent holding it is named, in the order they answered"
    ).toEqual(["hub.target.claude-code", "hub.target.codex"])
  })

  it("gathers the places one agent holds it in", () => {
    expect(
      scanned[0]?.held[0]?.places.map((one) => one.scope),
      "the places one agent holds it in are gathered"
    ).toEqual(["user", "project"])
  })

  /* The group is the agent's own declaration of the place — Claude Code's `user`
     is the machine and its `project` is the repository — rather than a word this
     hub matched the scope against, so an agent naming its scopes its own way still
     lands where it says it does. */
  it("reads each place's group from that agent's own declaration", () => {
    expect(
      scanned[0]?.held[0]?.places.map((one) => one.group),
      "each place carries the group its own client declared, not a word this hub knows"
    ).toEqual(["global", "workspace"])
  })

  it("carries each place's own record with the hold", () => {
    expect(
      scanned[0]?.held.map((one) => one.places.map((place) => place.enabled)),
      "the file each place records travels with the hold"
    ).toEqual([[true, true], [false]])
  })

  it("answers with the pack's own version where it declares one", () => {
    expect(scanned[0]?.version, "the pack's own version answers where it declares one").toBe(
      "1.0.0"
    )
  })

  /* A pack whose own manifest declares no version: the agent's reading of it is
     the only version there is. */
  it("answers with the client's own reading where the pack declares none", () => {
    const bare = collectScanned([
      {
        ...codex,
        packs: [{ ...codex.packs[0], name: "bare", id: "bare@curated", version: "0.7.0" }],
      },
    ])
    expect(
      bare[0]?.version,
      "and the client's reading of it where it declares none"
    ).toBe("0.7.0")
  })

  it("carries what the pack says about itself", () => {
    expect(scanned[0]?.description, "what the pack says about itself travels with it").toBe(
      "A statusline HUD"
    )
    expect(scanned[0]?.icon, "and the mark it ships").toBe("assets/hud-logo-3f9a2b1c.png")
  })

  it("reads the directory it sits in as a local source", () => {
    expect(scanned[0]?.source, "the directory it sits in is read as a local source").toEqual({
      kind: "local",
      path: "/cache/hud/0.8.0",
    })
  })

  it("carries the agent's own label and mark with it", () => {
    expect(scanned[0]?.held[0]?.label, "the agent's own label travels with it").toBe(
      "Claude Code"
    )
    expect(scanned[0]?.held[0]?.icon, "and its mark travels with it too").toBe(mark)
  })

  /* An agent can hold a pack this hub never delivered, and such a pack came from
     whatever marketplace supplied it. The agent's own id names that marketplace,
     and it is the only thing its own commands take back — so it has to reach the
     row, or the way out of that place cannot be built. */
  it("carries each agent's own id for the pack with its hold", () => {
    expect(
      scanned[0]?.held.map((one) => one.id),
      "each agent's own id for the pack travels with its hold"
    ).toEqual(["hud@hud", "hud@curated"])
  })
})

describe("merging the library and the agents", () => {
  it("keeps the library's pack and the agent's pack as two rows", () => {
    expect(rows, "the library's pack and the agent's pack are two rows").toHaveLength(2)
  })

  it("draws the library's row as stored, under its own fields", () => {
    expect(rows[0]?.stored, "the library's row is stored").toBe(true)
    expect(rows[0]?.name, "under the name the record holds").toBe("stored")
    expect(rows[0]?.description, "and keeps its own fields").toBe("stored does things")
  })

  it("draws the agent's row as one this hub has yet to take in", () => {
    expect(rows[1]?.stored, "the agent's row is not stored").toBe(false)
    expect(rows[1]?.name, "and names the pack the agents hold").toBe("hud")
    expect(rows[1]?.held, "carrying its holders").toHaveLength(2)
  })

  it("says what the pack says about itself on the agent's row", () => {
    expect(rows[1]?.description, "and it says what the pack says about itself").toBe(
      "A statusline HUD"
    )
    expect(rows[1]?.icon, "and draws the mark as a file the hub holds").toBe(
      "/hub/files/assets/hud-logo-3f9a2b1c.png"
    )
  })

  /* A pack only an agent holds came from a directory on this machine — the very
     directory the agent reads it from — so its row says so rather than naming the
     agent in the source's place. Which agents hold it is what the marks are for. */
  it("reads a pack only an agent holds as a local one", () => {
    expect(rows[1]?.source, "a pack only an agent holds reads as a local one").toBe("local")
  })

  it("reads a pack collected from a repository as the repository", () => {
    expect(rows[0]?.source, "a pack collected from a repository reads as the repository").toBe(
      "repo"
    )
  })

  it("reads one collected from a subdirectory as a subdirectory", () => {
    const mono: PluginRecord = {
      ...record("mono"),
      source: {
        kind: "git-subdir",
        url: "https://example.com/mono.git",
        path: "tools/mono",
        revision: "abc123",
      },
    }
    expect(
      composeRows([mono], [], "en", plain)[0]?.source,
      "one collected from a subdirectory reads as one"
    ).toBe("subdir")
  })

  it("reads one collected from an archive as an archive", () => {
    const zipped: PluginRecord = {
      ...record("zipped"),
      source: { kind: "archive", url: "https://x.test/a.zip" },
    }
    expect(
      composeRows([zipped], [], "en", plain)[0]?.source,
      "one collected from an archive reads as an archive"
    ).toBe("archive")
  })

  it("reads one copied from a folder here as local", () => {
    const copied: PluginRecord = {
      ...record("copied"),
      source: { kind: "local", path: "/packs/copied" },
    }
    expect(
      composeRows([copied], [], "en", plain)[0]?.source,
      "and one copied from a folder here reads as local"
    ).toBe("local")
  })
})

/* The word above says which kind of source it is; the address is the one thing a
   person can read back and open, so the two have to be read from the same origin
   and cannot be spelled apart. */
describe("the address a row shows for its source", () => {
  const address = (source: PluginRecord["source"]): string | undefined =>
    composeRows([{ ...record("one"), source }], [], "en", plain)[0]?.sourceAddress

  it("reads a repository back as the address it was collected from", () => {
    expect(
      address({ kind: "url", url: "https://example.com/pack.git", revision: "abc123" }),
      "a repository reads back as the address it was collected from"
    ).toBe("https://example.com/pack.git")
  })

  it("carries the ref it was taken at", () => {
    expect(
      address({ kind: "url", url: "https://example.com/pack.git", ref: "v2", revision: "abc123" }),
      "the ref it was taken at travels with it"
    ).toBe("https://example.com/pack.git#v2")
  })

  it("names the directory inside the repository for a subdirectory pack", () => {
    expect(
      address({
        kind: "git-subdir",
        url: "https://example.com/mono.git",
        path: "tools/mono",
        revision: "abc123",
      }),
      "a subdirectory pack names the directory inside the repository"
    ).toBe("https://example.com/mono.git/tools/mono")
  })

  it("reads an archive back as its URL", () => {
    expect(
      address({ kind: "archive", url: "https://x.test/a.zip" }),
      "an archive reads back as its URL"
    ).toBe("https://x.test/a.zip")
  })

  it("reads a folder here back as its path", () => {
    expect(
      address({ kind: "local", path: "/packs/copied" }),
      "a folder here reads back as its path"
    ).toBe("/packs/copied")
  })

  it("names the directory an agent reads a pack from", () => {
    expect(
      composeRows([], scanned, "en", plain)[0]?.sourceAddress,
      "a pack only an agent holds names the directory that agent reads it from"
    ).toBe("/cache/hud/0.8.0")
  })

  /* The files panel reads that directory, so the row has to carry it and not only
     the word a person reads. A pack the hub holds needs no path: the host resolves
     its own copy from the name. */
  it("carries that directory for the files panel to read", () => {
    expect(
      composeRows([], scanned, "en", plain)[0]?.directory,
      "and the row carries that directory for the files panel to read"
    ).toBe("/cache/hud/0.8.0")
  })

  it("leaves a pack the hub holds without one", () => {
    expect(
      composeRows([record("stored")], [], "en", plain)[0]?.directory,
      "while a pack the hub holds carries none"
    ).toBeUndefined()
  })
})

/* A check is a moment, not a state: a row nobody has asked about has no age to
   print, and printing one would claim an answer that was never taken. */
describe("how long ago the source was last asked", () => {
  const age = (checked?: PluginRecord["checked"]): string | undefined =>
    composeRows([{ ...record("one"), checked }], [], "en", plain)[0]?.checkedAge

  it("leaves a pack nobody asked about with no age", () => {
    expect(age(), "a pack nobody asked about carries no age").toBe("")
  })

  /* Away from zero, because a check a moment ago is worded "now"; the point here
     is that the recorded moment is read, not which word it takes. */
  it("prints how long ago a pack that was asked carries", () => {
    const threeMinutesAgo = new Date(Date.now() - 3 * 60_000).toISOString()
    expect(
      age({ at: threeMinutesAgo, latest: "abc123", currentHash: "hash" }),
      "one that was asked carries how long ago"
    ).toContain("minute")
  })

  it("says a pack only an agent holds has been asked about nothing", () => {
    expect(
      composeRows([], scanned, "en", plain)[0]?.checkedAge,
      "a pack only an agent holds has been asked about nothing"
    ).toBe("")
  })
})

describe("the pictures a row draws", () => {
  /** One library row, drawn from a record carrying these fields. */
  const drawn = (extra: Partial<PluginRecord>): PluginRow | undefined =>
    composeRows([{ ...record("stored"), ...extra }], [], "en", plain)[0]

  it("draws the mark the hub copied out of the pack", () => {
    expect(
      drawn({ icon: "assets/stored-logo-3f9a2b1c.png" })?.icon,
      "a library row draws the mark the hub copied out of the pack"
    ).toBe("/hub/files/assets/stored-logo-3f9a2b1c.png")
  })

  it("draws a mark as the tile beside the name, and never as the card's cover", () => {
    expect(
      drawn({ icon: "assets/stored-logo-3f9a2b1c.png" })?.cover,
      "a mark is never the card's cover"
    ).toBeUndefined()
    expect(rows[1]?.icon, "and a pack only an agent holds draws its mark too").toBe(
      "/hub/files/assets/hud-logo-3f9a2b1c.png"
    )
    expect(rows[1]?.cover, "never as the cover either").toBeUndefined()
  })

  it("draws a picture a person added as what the card draws instead", () => {
    expect(
      drawn({ icon: "assets/stored-logo-3f9a2b1c.png", assets: ["assets/stored-shot-8d1c40aa.png"] })
        ?.cover,
      "a picture a person added is what the card draws instead"
    ).toBe("/hub/files/assets/stored-shot-8d1c40aa.png")
  })

  it("draws a video as a cover too, whatever kind it is", () => {
    expect(
      drawn({ assets: ["assets/stored-clip-2f7a1b0c.mp4", "assets/stored-shot-8d1c40aa.png"] })
        ?.cover,
      "a video is a cover too: the card plays the first picture, whatever kind it is"
    ).toBe("/hub/files/assets/stored-clip-2f7a1b0c.mp4")
  })

  it("carries every picture it has, in the order the record keeps them", () => {
    expect(
      drawn({
        assets: ["assets/a-1f7b.png", "https://elsewhere.test/b.gif", "assets/c-2c8d.mp4"],
      })?.pictures,
      "the row carries every picture it has, in the order the record keeps them"
    ).toEqual(["assets/a-1f7b.png", "https://elsewhere.test/b.gif", "assets/c-2c8d.mp4"])
  })

  it("carries none for a pack the hub does not hold", () => {
    expect(
      composeRows([], scanned, "en", plain)[0]?.pictures,
      "a pack the hub does not hold carries none"
    ).toHaveLength(0)
  })

  it("draws nothing for a pack with no picture of its own", () => {
    expect(drawn({})?.icon, "a pack with no picture of its own draws no mark").toBeUndefined()
    expect(drawn({})?.cover, "and no cover").toBeUndefined()
  })
})

/* A pack both sides know is one row, and the library's record is what it draws:
   that side holds the files, the description and the checks, and the agent's
   answer only adds the places it is held in. */
describe("a pack both sides know", () => {
  it("is one row, the library's, which still names the agents holding it", () => {
    expect(both, "a pack both sides know is one row").toHaveLength(1)
    expect(both[0]?.stored, "and it is the library's row").toBe(true)
    expect(both[0]?.description, "which draws the record's own description").toBe("hud does things")
    expect(both[0]?.held, "and still names the agents holding it").toHaveLength(2)
  })
})

describe("the words one agent's scopes wear", () => {
  /* The real English words, so the check reads the way the row does. */
  const words: Record<string, string> = {
    "plugins.scope.user": "This machine",
    "plugins.scope.project": "This repository",
  }
  const t = (key: string) => words[key] ?? key

  it("always shows a scope whose word stands on its own", () => {
    expect(
      scopeWords(["project"], t),
      "a scope whose word stands on its own is always shown"
    ).toBe("This repository")
    expect(scopeWords(["user"], t), "whichever scope it is").toBe("This machine")
  })

  it("keeps two words that say different things", () => {
    expect(
      scopeWords(["user", "project"], t),
      "and two words that say different things both stay"
    ).toBe("This machine · This repository")
  })

  it("shows a word this build has no key for as the agent spelled it", () => {
    expect(
      scopeWords(["workspace"], t),
      "a word this build has no key for is shown as the agent spelled it"
    ).toBe("workspace")
  })

  it("says nothing for an agent holding a pack nowhere", () => {
    expect(scopeWords([], t), "an agent holding a pack nowhere says nothing").toBe("")
  })
})

/* One scope per group: no agent can hold a pack in two places at once, and a click
   that wrote both would be a click that wrote a place nobody chose. */
describe("which place a group's action reaches", () => {
  const ccPlaces: PluginPlace[] = [
    { id: "cc-user", label: "Claude Code", scope: "global", scopeWord: "user", switchable: true },
    {
      id: "cc-project",
      label: "Claude Code",
      scope: "workspace",
      scopeWord: "project",
      switchable: true,
    },
  ]
  const onlyUser: PluginPlace[] = [ccPlaces[0] as PluginPlace]

  it("reaches the repository's place from the workspace group", () => {
    expect(
      placeReached(ccPlaces, "workspace")?.scopeWord,
      "the workspace group reaches the repository's place"
    ).toBe("project")
  })

  it("reaches the machine-wide place from the global group", () => {
    expect(
      placeReached(ccPlaces, "global")?.scopeWord,
      "the global group reaches the machine-wide one"
    ).toBe("user")
  })

  it("reaches nothing for an agent keeping nothing in the group", () => {
    expect(
      placeReached(onlyUser, "workspace"),
      "an agent keeping nothing in the group reaches nothing"
    ).toBeUndefined()
  })

  it("takes the agent's own answer where a place's file is silent", () => {
    const answer: ScannedAnswer = {
      client: "hub.target.claude-code",
      label: "Claude Code",
      icon: mark,
      switches: { project: { "hud@hud": false } },
      places: [
        {
          id: "cc-project",
          label: "Claude Code",
          scope: "workspace",
          scopeWord: "project",
          switchable: true,
        },
      ],
      packs: [
        {
          name: "hud",
          id: "hud@hud",
          version: "0.8.0",
          scope: "project",
          enabled: true,
          marketplace: "hud",
          pack: { name: "", version: "", description: "" },
        },
      ],
    }
    expect(
      collectScanned([answer])[0]?.held[0]?.places[0]?.enabled,
      "the file said off, so the place reads off even though the agent's answer is on"
    ).toBe(false)
  })
})

/* The agent's answer is one value with its whole file chain resolved, so it cannot
   say what a narrower place answers: the row's line and the switch beside it have
   to read the place's own file, or a place just switched off reads as still on. */
describe("what each place's switch shows", () => {
  const clients: PluginClient[] = [
    {
      id: "hub.target.claude-code",
      label: "Claude Code",
      icon: mark,
      places: [
        {
          id: "cc-user",
          label: "Claude Code",
          scope: "global",
          scopeWord: "user",
          switchable: true,
        },
        {
          id: "cc-project",
          label: "Claude Code",
          scope: "workspace",
          scopeWord: "project",
          switchable: true,
          overrides: ["user"],
        },
      ],
      switches: { user: { "hud@curated": false }, project: { "hud@curated": true } },
      available: true,
    },
  ]
  const row = composeRows(
    [],
    collectScanned([
      {
        client: "hub.target.claude-code",
        label: "Claude Code",
        icon: mark,
        places: clients[0]?.places ?? [],
        switches: clients[0]?.switches ?? {},
        packs: [held("hud", "user")],
      },
    ]),
    "en",
    plain
  )[0] as PluginRow
  const shown = placesShown(row, clients)

  it("offers the machine's place, showing what its own file says", () => {
    expect(
      shown.find((one) => one.declared.scopeWord === "user")?.on,
      "a pack the machine holds offers the machine's place, showing its own file"
    ).toBe(false)
  })

  it("offers the repository's place too, because its file decides over that one", () => {
    expect(
      shown.map((one) => one.declared.scopeWord),
      "and the repository's place too, because its file decides over that one"
    ).toEqual(["user", "project"])
  })

  it("shows the place's own file rather than the agent's resolved answer", () => {
    expect(
      shown.find((one) => one.declared.scopeWord === "user")?.on,
      "the machine's place shows what its own file says, not the agent's resolved answer"
    ).toBe(false)
    expect(row.held[0]?.enabled, "while the agent's own answer for the pack is still on").toBe(
      true
    )
  })

  it("shows the agent's answer for a place whose file is silent", () => {
    const quiet = [{ ...clients[0], switches: {} } as PluginClient]
    expect(
      placesShown(row, quiet).map((one) => one.on),
      "a place whose file is silent shows the agent's answer instead"
    ).toEqual([true, true])
  })

  it("offers no machine-wide place for a repository-only pack", () => {
    const only = composeRows(
      [],
      collectScanned([
        {
          client: "hub.target.claude-code",
          label: "Claude Code",
          icon: mark,
          places: clients[0]?.places ?? [],
          switches: clients[0]?.switches ?? {},
          packs: [held("hud", "project")],
        },
      ]),
      "en",
      plain
    )[0] as PluginRow
    expect(
      placesShown(only, clients).map((one) => one.declared.scopeWord),
      "a repository-only pack offers no machine-wide place, since that file cannot overrule it"
    ).toEqual(["project"])
  })
})

describe("which tab a row lands in", () => {
  it("puts every row in all", () => {
    expect(rowsForTab(catalog, "all"), "every row is in all").toHaveLength(3)
  })

  it("puts the packs the hub holds the files of in the library tab", () => {
    expect(
      rowsForTab(catalog, "library").map((one) => one.name),
      "the packs the hub holds the files of are the library tab"
    ).toEqual(["stored", "idle"])
  })

  it("leaves a pack only an agent holds out of the library tab", () => {
    expect(
      rowsForTab(catalog, "library").map((one) => one.name),
      "a pack only an agent holds is not one of them"
    ).not.toContain("hud")
  })

  it("puts packs only an agent holds in the unstored tab", () => {
    expect(
      rowsForTab(catalog, "unstored").map((one) => one.name),
      "packs only an agent holds are the unstored tab"
    ).toEqual(["hud"])
  })

  it("divides the catalog between the two tabs", () => {
    expect(
      rowsForTab(catalog, "library").length + rowsForTab(catalog, "unstored").length,
      "the two divide the catalog between them"
    ).toBe(rowsForTab(catalog, "all").length)
  })

  it("takes a pack the library took in out of the unstored tab", () => {
    expect(
      rowsForTab(both, "unstored"),
      "a pack the library took in leaves the unstored tab"
    ).toHaveLength(0)
  })
})

/* A record is only behind its source when a check recorded a revision to compare
   against, so only a checked pack can reach the updates tab. */
describe("which tab a row lands in, once a source has moved", () => {
  it("puts a checked pack the source has moved past in the updates tab", () => {
    expect(
      rowsForTab(checkedCatalog, "updates").map((one) => one.name),
      "a checked pack the source has moved past is the updates tab"
    ).toEqual(["behind"])
  })

  it("leaves a pack nothing checked out of it", () => {
    expect(rowsForTab(catalog, "updates"), "and a pack nothing checked is not").toHaveLength(0)
  })

  it("leaves a pack only an agent holds out of it too", () => {
    expect(
      rowsForTab(catalog, "updates").filter((one) => !one.stored),
      "nor is one only an agent holds"
    ).toHaveLength(0)
  })
})

describe("which tab a row lands in, by the place it sits in", () => {
  it("puts a pack an agent holds inside the repository in the workspace tab", () => {
    expect(
      rowsForTab(scopePlaces, "workspace").map((one) => one.name),
      "a pack an agent holds inside the repository is the workspace tab"
    ).toEqual(["here"])
  })

  it("leaves a pack held only machine-wide out of the workspace tab", () => {
    expect(
      rowsForTab(scopePlaces, "workspace").map((one) => one.name),
      "one held only machine-wide is not, whoever holds it"
    ).not.toContain("away")
  })

  it("puts every pack an agent holds machine-wide in the global tab", () => {
    expect(
      rowsForTab(scopePlaces, "global").map((one) => one.name),
      "every pack an agent holds machine-wide is the global tab"
    ).toEqual(["everywhere", "away"])
  })

  it("leaves a pack held only inside the repository out of the global tab", () => {
    expect(
      rowsForTab(scopePlaces, "global").map((one) => one.name),
      "and one held only inside the repository is not"
    ).not.toContain("here")
  })

  it("keeps a pack for the tab narrowed to the agent that holds it there", () => {
    expect(
      rowsForTab(scopePlaces, "workspace", "hub.target.claude-code").map((one) => one.name),
      "narrowed to the agent that holds it here, the workspace tab keeps it"
    ).toEqual(["here"])
  })

  it("empties the workspace tab for a narrowing to an agent that holds nothing there", () => {
    expect(
      rowsForTab(scopePlaces, "workspace", "hub.target.codex"),
      "narrowed to the one that only holds machine-wide, the workspace tab is empty"
    ).toHaveLength(0)
  })

  it("keeps the pack the global tab does hold when narrowed to that agent", () => {
    expect(
      rowsForTab(scopePlaces, "global", "hub.target.codex").map((one) => one.name),
      "while the global tab narrowed to it keeps the one it does hold"
    ).toEqual(["away"])
  })
})
