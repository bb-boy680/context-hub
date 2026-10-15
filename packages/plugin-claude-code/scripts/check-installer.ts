/**
 * Behaviour check for the Claude Code installer's reading of
 * `claude plugin list --json`: which lines become packs, where each pack's
 * directory is taken from, and what a line this build cannot use does.
 *
 * The fixtures are the shape the client prints, with real answers cut down;
 * nothing here calls the client itself, so this runs on any machine.
 *
 * Run from the package: `node scripts/check-installer.ts`
 */
import { claudeCodeInstaller, readHeld } from "../src/installer.ts"

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

console.log("reading the client's list")

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

const packs = readHeld(LIST)
check("every line becomes one pack", packs.length === 3, packs.length)

const hud = packs.find((one) => one.name === "claude-hud")
check(
  "the name and the marketplace are the two halves of the id",
  hud?.name === "claude-hud" && hud.id === "claude-hud@claude-hud" && hud.marketplace === "claude-hud",
  hud
)
check(
  "the version and the scope are kept as the client gave them",
  hud?.version === "0.8.0" && hud.scope === "user",
  hud
)
check("a switched-on pack reads switched on", hud?.enabled === true, hud)
check(
  "with no folder read in place, the client's copy is the directory",
  hud?.source?.path === "C:\\Users\\me\\.claude\\plugins\\cache\\claude-hud\\claude-hud\\0.8.0",
  hud?.source
)

const pony = packs.find((one) => one.name === "ponytail")
check(
  "a pack read in place names that folder rather than the copy",
  pony?.source?.path === "C:\\Users\\me\\.context-hub\\plugins\\ponytail",
  pony?.source
)
check(
  "the repository's own switch is read beside the client's",
  pony?.workspaceEnabled === true && hud?.workspaceEnabled === false,
  [pony?.workspaceEnabled, hud?.workspaceEnabled]
)

const warp = packs.find((one) => one.name === "warp")
check("a switched-off pack reads switched off", warp?.enabled === false, warp)
check(
  "the client's list says nothing about what a pack carries",
  packs.every((one) => one.pack.description === "" && one.pack.icon === undefined)
)

console.log("reading what each pack says about itself")

const asked: string[] = []
const tools = {
  root: async () => "/library",
  syncMarketplace: async () => undefined,
  run: async () => LIST,
  has: async () => true,
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

const enriched = await claudeCodeInstaller.held(tools)
check(
  "every pack's directory is read, under the name its client lists it by",
  asked.length === 3 &&
    asked.includes("ponytail@C:\\Users\\me\\.context-hub\\plugins\\ponytail"),
  asked
)
check(
  "and what it says is carried on the entry",
  enriched[0]?.pack.description === "Real-time statusline HUD for Claude Code" &&
    enriched[0]?.pack.icon === "assets/claude-hud-logo-3f9a2b1c.png",
  enriched[0]?.pack
)
check(
  "the picture it reports is a reference into the hub's own library",
  enriched.every((one) => (one.pack.icon ?? "").startsWith("assets/")),
  enriched.map((one) => one.pack.icon)
)
check("the client's own fields are untouched by the reading", enriched[1]?.name === "ponytail", enriched[1])

const unreadable = await claudeCodeInstaller.held({
  ...tools,
  describe: async () => {
    throw new Error("no host")
  },
})
check(
  "a directory that cannot be read leaves empty fields rather than failing the scan",
  unreadable.length === 3 && unreadable[0]?.pack.description === "",
  unreadable[0]
)

console.log("reading lines this build cannot use")

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
check(
  "a line this build cannot use is dropped and the rest kept",
  mixed.length === 1 && mixed[0]?.name === "good",
  mixed
)
check(
  "a pack the client does not describe reads empty and off",
  mixed[0]?.version === "" && mixed[0]?.enabled === false,
  mixed[0]
)
check("and carries no directory rather than an empty one", mixed[0]?.source === undefined, mixed[0])

check("an answer that is not a list yields nothing", readHeld('{"installed":[]}').length === 0)
check("prose yields nothing", readHeld("No plugins installed.").length === 0)
check("an empty list yields nothing", readHeld("[]").length === 0)

console.log("turning a pack on and off")

/* The command line is the whole of this action's behaviour, and nothing above
   reaches it. It carries the client's own id rather than one this side builds:
   a hub that appended its own marketplace would address a copy that is not
   there, for every pack that came from somewhere else. */
const ran: { program: string; args: string[] }[] = []
const seen = {
  ...tools,
  run: (program: string, args: string[]) => {
    ran.push({ program, args })
    return Promise.resolve("{}")
  },
}

await claudeCodeInstaller.setEnabled?.("ponytail@ponytail", "project", false, seen)
check(
  "switching off names the client's own id, unchanged, at the scope asked for",
  ran[0]?.program === "claude" &&
    ran[0]?.args.join(" ") === "plugin disable ponytail@ponytail --scope project --json",
  ran[0]
)

ran.length = 0
await claudeCodeInstaller.setEnabled?.("ponytail@ponytail", "user", true, seen)
check(
  "and switching on is the same line with the other verb",
  ran[0]?.args.join(" ") === "plugin enable ponytail@ponytail --scope user --json",
  ran[0]?.args
)

console.log(`\n${failures === 0 ? "all checks passed" : `${String(failures)} failed`} (${String(checked)} checks)`)
process.exit(failures === 0 ? 0 : 1)
