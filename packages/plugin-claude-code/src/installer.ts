/**
 * How Claude Code installs a plugin, as the extension that knows Claude Code.
 *
 * A pack reaches Claude Code through a marketplace, so this registers the hub's
 * own library root as one and then asks the client to install from it by name.
 * The directory itself is what makes the packs visible, and it is read from the
 * tools rather than assumed, because the hub decides where its library lives.
 *
 * `installed_plugins.json`, the versioned cache, and the settings that record an
 * enablement are all Claude Code's own documents, with their own history — so
 * nothing here writes them. The client's CLI already does, reports JSON, and
 * takes the scope and the enable switch as flags.
 *
 * Types only, and they come from the plugins module because that module owns the
 * contract an installer is written against. A type import is erased, so at run
 * time this extension reads nothing from that package: the registry to register
 * into and the tools to run a program with arrive through the `plugins` service.
 */
import type {
  PluginHeld,
  PluginInstaller,
  PluginPlace,
  PluginSwitches,
  PluginTools,
} from "@workspace/plugin-plugins/provider"

import {
  CLAUDE_CODE_ENABLED_KEY,
  CLAUDE_CODE_ID,
  CLAUDE_CODE_SETTINGS_FILE,
} from "./locations.ts"

/** The marketplace name the hub's library is registered under. */
const MARKETPLACE = "context-hub"

/** The client's program, and the flag that makes it report one JSON result. */
const PROGRAM = "claude"
const JSON_FLAG = "--json"

/** The client's own name, as its rows read on both pages. */
const LABEL = "Claude Code"

/**
 * The places this client keeps a pack in, in the order its own menu lists them.
 *
 * Both are switchable: each writes its own settings file, so switching one moves
 * that file and nothing beside it. Claude Code also has a `local` scope, which
 * writes a file the person keeps to themselves and this side never reads, so
 * nothing here offers it.
 */
const PLACES: readonly PluginPlace[] = [
  {
    id: "claude-code-user",
    label: LABEL,
    scope: "global",
    scopeWord: "user",
    switchable: true,
    file: CLAUDE_CODE_SETTINGS_FILE,
  },
  {
    id: "claude-code-project",
    label: LABEL,
    scope: "workspace",
    scopeWord: "project",
    switchable: true,
    file: CLAUDE_CODE_SETTINGS_FILE,
    /* The repository's file decides over the machine's, so a pack the machine
       switched on can still be switched off for one repository — which is why
       this place is offered for a pack only the machine holds. */
    overrides: ["user"],
  },
]

/**
 * What one place's settings file records about plugin enablement.
 *
 * Read where it sits rather than asked of the client: the client answers once
 * per pack, so it cannot say which of two files a pack is on in. A file that is
 * not there, or holds nothing this build can read, answers with nothing — the
 * caller then has the client's own answer left to report.
 *
 * @param tools — the tools the installer was handed, which reach the files.
 * @param place — the place whose file is read.
 */
async function switchesAt(
  tools: PluginTools,
  place: PluginPlace
): Promise<Record<string, boolean>> {
  const files = tools.files
  if (files === null || place.file === undefined) return {}
  const text = await files.read({ scope: place.scope, file: place.file }).catch(() => null)
  if (text === null) return {}
  try {
    /* A byte-order mark is a file's own business, not JSON's. */
    const document = JSON.parse(text.replace(/^\uFEFF/, "")) as Record<string, unknown>
    const recorded = document[CLAUDE_CODE_ENABLED_KEY]
    if (typeof recorded !== "object" || recorded === null) return {}
    return Object.fromEntries(
      Object.entries(recorded).filter((entry): entry is [string, boolean] => {
        return typeof entry[1] === "boolean"
      })
    )
  } catch {
    return {}
  }
}

/**
 * Register the library root as a marketplace, and report the root.
 *
 * The catalog is rewritten first: a marketplace registered around an index that
 * does not yet list a pack would leave that pack invisible, and this is the only
 * moment the two are known to be in step.
 */
async function ensureMarketplace(tools: PluginTools): Promise<string> {
  await tools.syncMarketplace()
  const root = await tools.root()
  /* Adding a marketplace that is already registered is reported as such rather
     than as a failure, so this needs no remembered state to stay idempotent. */
  await tools.run(PROGRAM, ["plugin", "marketplace", "add", root, JSON_FLAG])
  return root
}

/** Read one result line of the client's JSON report, or nothing. */
function reportOf(output: string): { installPath?: string } {
  try {
    const parsed: unknown = JSON.parse(output.trim().split("\n").at(-1) ?? "")
    return typeof parsed === "object" && parsed !== null ? (parsed as { installPath?: string }) : {}
  } catch {
    /* A client that printed prose still succeeded or failed by its exit code. */
    return {}
  }
}

/** The first value that is a non-empty string, or nothing. */
function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value !== "") return value
  }
  return undefined
}

/**
 * The pack list this client prints, read into the shape this hub records one by.
 *
 * A line this build cannot use is dropped rather than guessed at, and an answer
 * that is not a list yields nothing: a client that printed prose still exited
 * with its own code, and inventing packs out of prose would be worse than
 * reporting none.
 *
 * An id reads `<pack>@<marketplace>` — including the client's own words for a
 * pack that came from no marketplace, such as `skills-dir`. The directory is the
 * client's own answer to where it loads the pack from: a pack it reads in place
 * names that folder, and one it copied names the copy.
 *
 * What the pack itself carries is not in this answer, so `pack` reads empty
 * here; {@link PluginInstaller.held} fills it in by reading each directory.
 *
 * @param output — what `claude plugin list --json` printed.
 * @returns one entry per installed pack, in the order the client listed them.
 */
export function readHeld(output: string): PluginHeld[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(output)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const found: PluginHeld[] = []
  for (const value of parsed) {
    if (typeof value !== "object" || value === null) continue
    const entry = value as Record<string, unknown>
    if (typeof entry.id !== "string" || typeof entry.scope !== "string") continue
    const at = entry.id.lastIndexOf("@")
    if (at <= 0 || at === entry.id.length - 1) continue
    const path = firstString(entry.readFromFolder, entry.installPath)
    found.push({
      name: entry.id.slice(0, at),
      id: entry.id,
      version: typeof entry.version === "string" ? entry.version : "",
      scope: entry.scope,
      enabled: entry.enabled === true,
      marketplace: entry.id.slice(at + 1),
      ...(path === undefined ? {} : { source: { kind: "local", path } }),
      pack: { name: "", version: "", description: "" },
    })
  }
  return found
}

/**
 * Fill in what each pack says about itself, reading it where the pack sits.
 *
 * The client's own list names packs and directories and nothing more, so the
 * reading happens here rather than in that answer. A pack whose directory the
 * client did not name keeps the empty fields it was read with: there is nothing
 * to read, and saying so is better than failing the whole scan.
 */
async function withPacks(tools: PluginTools, packs: PluginHeld[]): Promise<PluginHeld[]> {
  return Promise.all(
    packs.map(async (pack) =>
      pack.source === undefined
        ? pack
        : { ...pack, pack: await tools.describe(pack.source.path, pack.name).catch(() => pack.pack) }
    )
  )
}

/** Claude Code, as the plugins module uses it. */
export const claudeCodeInstaller: PluginInstaller = {
  id: CLAUDE_CODE_ID,
  label: LABEL,
  places: PLACES,

  available: (tools) => tools.has(PROGRAM),

  async held(tools) {
    return withPacks(tools, readHeld(await tools.run(PROGRAM, ["plugin", "list", JSON_FLAG])))
  },

  async switches(tools) {
    /* Each place's file, read once and answered for every pack in it. */
    const recorded: PluginSwitches = {}
    for (const place of PLACES) {
      recorded[place.scopeWord] = await switchesAt(tools, place)
    }
    return recorded
  },

  async install(id, scope, tools) {
    await ensureMarketplace(tools)
    const report = reportOf(
      await tools.run(PROGRAM, [
        "plugin",
        "install",
        `${id}@${MARKETPLACE}`,
        "--scope",
        scope,
        JSON_FLAG,
        "-y",
      ])
    )
    return {
      message: `${id} installed for Claude Code at ${scope} scope`,
      location: report.installPath,
    }
  },

  async remove(id, scope, tools) {
    /* The id is the client's own, and it names the marketplace the pack really
       came from: a pack this hub never delivered was installed from somewhere
       else, and this hub's own name would point at a copy that is not there. */
    await tools.run(PROGRAM, [
      "plugin",
      "uninstall",
      id,
      "--scope",
      scope,
      JSON_FLAG,
    ])
    return { message: `${id} removed from Claude Code at ${scope} scope` }
  },

  async setEnabled(id, scope, on, tools) {
    /* The id is the client's own, for the reason `remove` gives: only the id the
       agent itself listed names the copy it will find. */
    await tools.run(PROGRAM, [
      "plugin",
      on ? "enable" : "disable",
      id,
      "--scope",
      scope,
      JSON_FLAG,
    ])
    return { message: `${id} ${on ? "enabled" : "disabled"} for Claude Code at ${scope} scope` }
  },
}
