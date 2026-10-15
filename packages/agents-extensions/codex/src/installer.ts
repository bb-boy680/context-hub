/**
 * How Codex installs a plugin, as the extension that knows Codex.
 *
 * Codex reads a marketplace index from a local directory, so this registers the
 * hub's library root as one, then installs a pack from it by name. The root is
 * read from the tools rather than assumed, because the hub decides where its
 * library lives.
 *
 * `config.toml` and the versioned cache under `~/.codex/plugins` are Codex's own
 * documents, with their own history, so nothing here writes them: its CLI
 * records the marketplace and copies the pack itself.
 *
 * A pack is either present for Codex or not, and Codex has no per-plugin switch,
 * so this declares the one scope it has and leaves `setEnabled` out. That the
 * pack is fetched from the library's own root every time is what keeps it in
 * step with edits made here.
 *
 * Types only, and they come from the plugins module because that module owns the
 * contract an installer is written against. A type import is erased, so at run
 * time this extension reads nothing from that package: the registry to register
 * into and the tools to run a program with arrive through the `plugins` service.
 */
import type { PluginHeld, PluginInstaller, PluginTools } from "@workspace/plugin-plugins/provider"

/** This integration's id; the kernel matches it against the manifest. */
const CODEX_ID = "hub.target.codex"

/** The marketplace name the hub's library is registered under. */
const MARKETPLACE = "context-hub"

/** Codex's program, and the flag that makes it report JSON. */
const PROGRAM = "codex"
const JSON_FLAG = "--json"

/** Register the library root as a marketplace, and report the root. */
async function ensureMarketplace(tools: PluginTools): Promise<void> {
  await tools.syncMarketplace()
  const root = await tools.root()
  /* Registering a marketplace that is already registered is reported as such
     rather than as a failure, so this needs no remembered state. */
  await tools.run(PROGRAM, ["plugin", "marketplace", "add", root, JSON_FLAG])
}

/** Read the plugin list Codex reports, or nothing. */
function listed(output: string): { installed?: unknown } {
  try {
    const parsed: unknown = JSON.parse(output)
    return typeof parsed === "object" && parsed !== null ? (parsed as { installed?: unknown }) : {}
  } catch {
    /* A client that printed prose still succeeded or failed by its exit code. */
    return {}
  }
}

/**
 * The pack list this client prints, read into the shape this hub records one by.
 *
 * Codex reports no scope of its own — a pack is installed for the machine — so
 * every entry reads as `user`, which is the one scope this installer declares.
 *
 * What the pack itself carries is not in this answer, so `pack` reads empty
 * here; {@link PluginInstaller.held} fills it in by reading each directory.
 *
 * @param output — what `codex plugin list --json` printed.
 * @returns one entry per installed pack, in the order the client listed them.
 */
export function readHeld(output: string): PluginHeld[] {
  const { installed } = listed(output)
  if (!Array.isArray(installed)) return []
  const found: PluginHeld[] = []
  for (const value of installed) {
    if (typeof value !== "object" || value === null) continue
    const entry = value as Record<string, unknown>
    if (typeof entry.name !== "string" || entry.name === "") continue
    const source = entry.source
    const path =
      typeof source === "object" && source !== null
        ? (source as Record<string, unknown>).path
        : undefined
    found.push({
      name: entry.name,
      id: typeof entry.pluginId === "string" ? entry.pluginId : entry.name,
      version: typeof entry.version === "string" ? entry.version : "",
      scope: "user",
      enabled: entry.enabled !== false,
      marketplace: typeof entry.marketplaceName === "string" ? entry.marketplaceName : null,
      ...(typeof path === "string" && path !== "" ? { source: { kind: "local", path } } : {}),
      pack: { name: "", version: "", description: "" },
    })
  }
  return found
}

/**
 * Fill in what each pack says about itself, reading it where the pack sits.
 *
 * @param tools — the toolkit the plugins module hands over.
 * @param packs — what the client's own list reported.
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

/** Codex, as the plugins module uses it. */
export const codexInstaller: PluginInstaller = {
  id: CODEX_ID,
  label: "Codex",
  /* Codex installs a plugin for the machine, with no per-project variant, and
     keeps no switch for one — so its single place names no file and is not the
     hub's to move. */
  places: [
    {
      id: "codex-user",
      label: "Codex",
      scope: "global",
      scopeWord: "user",
      switchable: false,
    },
  ],

  available: (tools) => tools.has(PROGRAM),

  async held(tools) {
    return withPacks(tools, readHeld(await tools.run(PROGRAM, ["plugin", "list", JSON_FLAG])))
  },

  async install(id, _scope, tools) {
    await ensureMarketplace(tools)
    await tools.run(PROGRAM, ["plugin", "add", `${id}@${MARKETPLACE}`, JSON_FLAG])
    return { message: `${id} installed for Codex` }
  },

  async remove(id, _scope, tools) {
    /* The id is the client's own, and it names the marketplace the pack really
       came from: a pack this hub never delivered was installed from somewhere
       else, and this hub's own name would point at a copy that is not there. */
    await tools.run(PROGRAM, ["plugin", "remove", id, JSON_FLAG])
    return { message: `${id} removed from Codex` }
  },
}
