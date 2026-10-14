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
import type { PluginInstaller, PluginTools } from "@workspace/plugin-plugins/provider"

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

/** Codex, as the plugins module uses it. */
export const codexInstaller: PluginInstaller = {
  id: CODEX_ID,
  label: "Codex",
  /* Codex installs a plugin for the machine, with no per-project variant. */
  scopes: ["user"],

  available: (tools) => tools.has(PROGRAM),

  async delivered(tools) {
    const { installed } = listed(await tools.run(PROGRAM, ["plugin", "list", JSON_FLAG]))
    if (!Array.isArray(installed)) return {}
    const held: Record<string, ("user")[]> = {}
    for (const value of installed) {
      if (typeof value !== "object" || value === null) continue
      const entry = value as { name?: unknown; marketplaceName?: unknown }
      if (typeof entry.name !== "string" || entry.marketplaceName !== MARKETPLACE) continue
      held[entry.name] = ["user"]
    }
    return held
  },

  async install(id, _scope, tools) {
    await ensureMarketplace(tools)
    await tools.run(PROGRAM, ["plugin", "add", `${id}@${MARKETPLACE}`, JSON_FLAG])
    return { message: `${id} installed for Codex` }
  },

  async remove(id, _scope, tools) {
    await tools.run(PROGRAM, ["plugin", "remove", `${id}@${MARKETPLACE}`, JSON_FLAG])
    return { message: `${id} removed from Codex` }
  },
}
