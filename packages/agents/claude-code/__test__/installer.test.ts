/**
 * Behaviour of the Claude Code installer's reading of `claude plugin list --json`:
 * which lines become packs, where each pack's directory is taken from, and what a
 * line this build cannot use does.
 *
 * The fixtures are the shape the client prints, with real answers cut down;
 * nothing here calls the client itself, so this runs on any machine.
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createFsPlaceFiles } from "@context-hub/core/host/place-files"

import { claudeCodeInstaller, readHeld } from "../src/installer.ts"

const LIST = JSON.stringify([
  {
    id: "claude-hud@claude-hud",
    version: "0.8.0",
    scope: "user",
    enabled: true,
    installPath: "C:\\Users\\me\\.claude\\plugins\\cache\\claude-hud\\claude-hud\\0.8.0",
    installedAt: "2026-10-11T15:33:00.269Z",
    lastUpdated: "2026-10-11T15:33:00.269Z",
    projectEnabled: false,
  },
  {
    id: "ponytail@ponytail",
    version: "5.2.0",
    scope: "user",
    enabled: true,
    installPath: "C:\\Users\\me\\.claude\\plugins\\cache\\ponytail\\ponytail\\5.2.0",
    readFromFolder: "C:\\Users\\me\\.context-hub\\plugins\\ponytail",
    folderVersion: "5.2.0",
    installedAt: "2026-10-14T09:39:54.822Z",
    lastUpdated: "2026-10-14T09:39:54.822Z",
    projectEnabled: true,
  },
  {
    id: "warp@claude-code-warp",
    version: "2.2.0",
    scope: "user",
    enabled: false,
    installPath: "C:\\Users\\me\\.claude\\plugins\\cache\\claude-code-warp\\warp\\2.2.0",
    installedAt: "2026-09-23T10:10:36.624Z",
    lastUpdated: "2026-09-23T10:10:36.624Z",
    projectEnabled: false,
  },
])

/** What the client answers for a pack the hub also holds in its own library. */
const asked: string[] = []
const tools = {
  root: async () => "/library",
  syncMarketplace: async () => undefined,
  run: async () => LIST,
  has: async () => true,
  files: null,
  describe: async (directory: string, name: string) => {
    asked.push(`${name}@${directory}`)
    return {
      name: "claude-hud",
      version: "0.8.0",
      description: "Real-time statusline HUD for Claude Code",
      icon: `assets/${name}-logo-3f9a2b1c.png`,
    }
  },
}

/* The client answers once for a pack, not once per file, so its own answer cannot
   say which of two files a pack is on in. The two files say it themselves, and
   this is that reading. */
const BOTH = JSON.stringify([
  {
    id: "ponytail@ponytail",
    version: "5.2.0",
    scope: "user",
    enabled: true,
    installPath: "C:\\Users\\me\\.claude\\plugins\\cache\\ponytail\\ponytail\\5.2.0",
  },
  {
    id: "ponytail@ponytail",
    version: "5.2.0",
    scope: "project",
    enabled: true,
    installPath: "C:\\Users\\me\\.claude\\plugins\\cache\\ponytail\\ponytail\\5.2.0",
  },
])

/* The machine has it on; the repository in use has switched it off. */
const SETTINGS: Record<string, string> = {
  global: JSON.stringify({ enabledPlugins: { "ponytail@ponytail": true } }),
  workspace: JSON.stringify({ enabledPlugins: { "ponytail@ponytail": false } }),
}
const reads: string[] = []
const bothTools = {
  ...tools,
  run: async () => BOTH,
  files: {
    read: async (place: { scope: string }) => {
      reads.push(place.scope)
      return SETTINGS[place.scope] ?? null
    },
    write: async () => undefined,
    remove: async () => undefined,
    workspace: async () => "C:\\workspace",
  },
}

describe("reading the client's list", () => {
  const packs = readHeld(LIST)
  const hud = packs.find((one) => one.name === "claude-hud")
  const pony = packs.find((one) => one.name === "ponytail")

  it("makes every line one pack, splitting the id into its two halves", () => {
    expect(packs).toHaveLength(3)
    expect(hud?.name).toBe("claude-hud")
    expect(hud?.id).toBe("claude-hud@claude-hud")
    expect(hud?.marketplace).toBe("claude-hud")
  })

  it("keeps the version and scope the client gave, and its switched-on state", () => {
    expect(hud?.version).toBe("0.8.0")
    expect(hud?.scope).toBe("user")
    expect(hud?.enabled).toBe(true)
  })

  it("takes the client's own copy as the directory when no folder was read in place", () => {
    expect(hud?.source?.path).toBe(
      "C:\\Users\\me\\.claude\\plugins\\cache\\claude-hud\\claude-hud\\0.8.0"
    )
  })

  it("names the folder read in place rather than the copy", () => {
    expect(pony?.source?.path).toBe("C:\\Users\\me\\.context-hub\\plugins\\ponytail")
  })

  it("reads a switched-off pack as switched off, with nothing said about what it carries", () => {
    const warp = packs.find((one) => one.name === "warp")
    expect(warp?.enabled).toBe(false)
    expect(packs.filter((one) => one.pack.description !== "" || one.pack.icon !== undefined)).toEqual(
      []
    )
  })
})

describe("reading what each pack says about itself", () => {
  it("reads every pack's directory, under the name its client lists it by", async () => {
    await claudeCodeInstaller.held(tools)
    expect(asked).toHaveLength(3)
    expect(asked).toContain("ponytail@C:\\Users\\me\\.context-hub\\plugins\\ponytail")
  })

  it("carries what the pack says onto the entry, as a reference into the hub's library", async () => {
    const enriched = await claudeCodeInstaller.held(tools)
    expect(enriched[0]?.pack.description).toBe("Real-time statusline HUD for Claude Code")
    expect(enriched[0]?.pack.icon).toBe("assets/claude-hud-logo-3f9a2b1c.png")
    expect(enriched.every((one) => (one.pack.icon ?? "").startsWith("assets/"))).toBe(true)
    expect(enriched[1]?.name, "the client's own fields").toBe("ponytail")
  })

  it("leaves empty fields rather than failing the scan when a directory cannot be read", async () => {
    const unreadable = await claudeCodeInstaller.held({
      ...tools,
      describe: async () => {
        throw new Error("no host")
      },
    })
    expect(unreadable).toHaveLength(3)
    expect(unreadable[0]?.pack.description).toBe("")
  })
})

describe("the places this client keeps a pack in", () => {
  it("declares the machine's and the repository's, each switchable and filed under its own root", () => {
    expect(claudeCodeInstaller.places.map((one) => one.scopeWord)).toEqual(["user", "project"])
    expect(claudeCodeInstaller.places.every((one) => one.switchable && one.file !== undefined)).toBe(
      true
    )
    expect(claudeCodeInstaller.places.map((one) => one.scope)).toEqual(["global", "workspace"])
  })

  it("lets the repository's file decide over the machine's", () => {
    const project = claudeCodeInstaller.places.find((one) => one.scopeWord === "project")
    expect(project?.overrides).toEqual(["user"])
  })
})

describe("the switch each place's own file records", () => {
  it("reads both files, and each answers for its own place", async () => {
    const bothFiles = await claudeCodeInstaller.switches?.(bothTools)
    expect(reads.sort()).toEqual(["global", "workspace"])
    expect(bothFiles?.["user"]?.["ponytail@ponytail"]).toBe(true)
    expect(bothFiles?.["project"]?.["ponytail@ponytail"]).toBe(false)
  })

  it("shows why the client's single answer cannot stand in for them", async () => {
    const held = await claudeCodeInstaller.held(bothTools)
    expect(held.every((one) => one.enabled === true)).toBe(true)
  })

  /* A file that names no key for a pack has not spoken about it, and the place
     then has no entry rather than a false one — the caller reads the client's own
     answer instead of inventing a switch nobody recorded. */
  it("leaves a pack a file does not name unrecorded", async () => {
    const quiet = await claudeCodeInstaller.switches?.({
      ...bothTools,
      files: {
        ...bothTools.files,
        read: async () => JSON.stringify({ enabledPlugins: { "other@x": true } }),
      },
    })
    expect(quiet?.["user"]?.["ponytail@ponytail"]).toBeUndefined()
  })

  it("records nothing at any place for a form that reaches no host", async () => {
    const none = await claudeCodeInstaller.switches?.({ ...bothTools, files: null })
    expect(Object.values(none ?? {}).every((one) => Object.keys(one).length === 0)).toBe(true)
  })
})

/* The stub above proves the reading; this proves the two paths are the two files,
   in a throwaway tree, which is the part a stub cannot say. */
describe("reading both files off a disk", () => {
  let root: string

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(tmpdir(), "hub-plugin-switches-"))
    const userHome = path.join(root, "home")
    const workspace = path.join(root, "repo")
    await fs.mkdir(path.join(userHome, ".claude"), { recursive: true })
    await fs.mkdir(path.join(workspace, ".claude"), { recursive: true })
    await fs.writeFile(
      path.join(userHome, ".claude", "settings.json"),
      JSON.stringify({ enabledPlugins: { "ponytail@ponytail": true } })
    )
    await fs.writeFile(
      path.join(workspace, ".claude", "settings.json"),
      JSON.stringify({ enabledPlugins: { "ponytail@ponytail": false } })
    )
  })

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it("reads the machine's file and the repository's", async () => {
    const recorded = await claudeCodeInstaller.switches?.({
      ...bothTools,
      files: createFsPlaceFiles({
        home: path.join(root, "hub"),
        folder: path.join(root, "repo"),
        userHome: path.join(root, "home"),
      }),
    })
    expect(recorded?.["user"]?.["ponytail@ponytail"]).toBe(true)
    expect(recorded?.["project"]?.["ponytail@ponytail"]).toBe(false)
  })
})

describe("reading lines this build cannot use", () => {
  const mixed = readHeld(
    JSON.stringify([
      { id: "good@market", scope: "user" },
      { id: "no-market", scope: "user" },
      { id: "trailing@", scope: "user" },
      { id: 7, scope: "user" },
      { id: "no-scope@market" },
      "a string",
      null,
    ])
  )

  it("drops the unusable line and keeps the rest, reading it empty and off", () => {
    expect(mixed).toHaveLength(1)
    expect(mixed[0]?.name).toBe("good")
    expect(mixed[0]?.version).toBe("")
    expect(mixed[0]?.enabled).toBe(false)
    expect(mixed[0]?.source, "no directory rather than an empty one").toBeUndefined()
  })

  it("yields nothing for anything that is not a list", () => {
    expect(readHeld('{"installed":[]}')).toEqual([])
    expect(readHeld("No plugins installed.")).toEqual([])
    expect(readHeld("[]")).toEqual([])
  })
})

/* The shape the client prints for a pack installed at project scope, in the
   folder it was installed for and in the one beside it. */
describe("reading one repository's records", () => {
  const PROJECTS = JSON.stringify([
    {
      id: "ponytail@ponytail",
      version: "5.2.0",
      scope: "project",
      enabled: true,
      projectPath: "D:\\work\\hub",
      projectEnabled: true,
      installPath: "C:\\Users\\me\\.claude\\plugins\\cache\\ponytail\\ponytail\\5.2.0",
    },
    {
      id: "ponytail@ponytail",
      version: "5.2.0",
      scope: "user",
      enabled: true,
      projectEnabled: false,
      installPath: "C:\\Users\\me\\.claude\\plugins\\cache\\ponytail\\ponytail\\5.2.0",
    },
  ])

  it("keeps a record that names this folder, however it is spelt", () => {
    const here = readHeld(PROJECTS, "D:/work/hub/")
    expect(here).toHaveLength(2)
    expect(here.some((one) => one.scope === "project")).toBe(true)
  })

  it("leaves out a record naming another folder, keeping the machine-wide one", () => {
    const beside = readHeld(PROJECTS, "D:\\work\\other")
    expect(beside).toHaveLength(1)
    expect(beside[0]?.scope).toBe("user")
  })

  it("keeps every record when there is no folder to compare against", () => {
    expect(readHeld(PROJECTS)).toHaveLength(2)
    expect(readHeld(PROJECTS, null)).toHaveLength(2)
  })
})

/* The command line is the whole of this action's behaviour, and nothing above
   reaches it. It carries the client's own id rather than one this side builds: a
   hub that appended its own marketplace would address a copy that is not there,
   for every pack that came from somewhere else. */
describe("turning a pack on and off", () => {
  const ran: { program: string; args: string[] }[] = []
  const seen = {
    ...tools,
    run: (program: string, args: string[]) => {
      ran.push({ program, args })
      return Promise.resolve("{}")
    },
  }

  it("names the client's own id, unchanged, at the scope asked for", async () => {
    await claudeCodeInstaller.setEnabled?.("ponytail@ponytail", "project", false, seen)
    expect(ran[0]?.program).toBe("claude")
    expect(ran[0]?.args.join(" ")).toBe("plugin disable ponytail@ponytail --scope project --json")
  })

  it("switches on with the same line and the other verb", async () => {
    ran.length = 0
    await claudeCodeInstaller.setEnabled?.("ponytail@ponytail", "user", true, seen)
    expect(ran[0]?.args.join(" ")).toBe("plugin enable ponytail@ponytail --scope user --json")
  })
})
