/**
 * The one service an agent plugin publishes into when it knows how to read and
 * write an MCP client's own configuration file.
 *
 * The MCP module owns the page, the records and the catalog; it does not know a
 * single client file. Each agent extension knows exactly one client, registers
 * a provider here, and the page reaches every client through the registry — so
 * adding an agent means adding a plugin, never a case inside the MCP module.
 *
 * This is a service, not a contribution: a contribution carries data for the
 * screen to render, while a provider carries behavior another plugin calls.
 */
import { Service } from "@deepseek-ai/cordis"
import type { Context } from "@deepseek-ai/cordis"

import type { AssetScope, PlaceFiles, PlaceRef } from "@context-hub/core/place-files"

import type { McpDeclaration } from "./declaration.ts"
import { mcpTools, type McpTools } from "./toolkit.ts"

/** The service name the MCP module publishes and every agent plugin requires. */
export const MCP_SERVICE = "mcp"

/** One client file, as the extension that knows that client describes it. */
export interface McpPlace extends PlaceRef {
  /** Stable id, unique across every provider; installs are recorded against it. */
  id: string
  /** The client's name, as a menu row lists it. */
  label: string
  /**
   * Whether the hub may write this client's on/off state for this place.
   *
   * A client that keeps the state in a file of its own — or keeps it per
   * project and only this place names a project — says false wherever the state
   * cannot be written, and that place is listed as one the client manages.
   */
  switchable: boolean
}

/** One declaration a client file holds. */
export interface McpEntry {
  /** The server's name, which is its key in that file. */
  name: string
  /** The declaration, or null when the entry holds one this build cannot read. */
  declaration: McpDeclaration | null
  /** Whether that client will connect it; always true for a client with no switch. */
  enabled: boolean
}

/**
 * What one provider call may reach: the hub's files, and the kernel log.
 */
export interface McpIo {
  /** The client configuration files under this hub's roots. */
  readonly files: PlaceFiles
  /** Record one diagnostic line; a person's screen shows the key, not this. */
  log(level: "info" | "warn" | "error", message: string): void
}

/**
 * One client, as the MCP module uses it. Every method names a place by its id
 * and works on that place's file alone, so a provider never sees the catalog.
 *
 * Errors are thrown as `McpError` with a message key of the provider's own
 * namespace; a `McpError` the module cannot name is reported through the
 * fallback key of the call that failed.
 */
export interface McpProvider {
  /** Reverse-DNS style id, e.g. "hub.target.claude-code". */
  readonly id: string
  /** Every file this client keeps declarations in. */
  readonly places: readonly McpPlace[]
  /**
   * What that file holds, one entry per server.
   *
   * @param io — the roots in use and the files under them.
   * @param place — {@link McpPlace.id} to read.
   * @returns the entries; an empty list for a file that is not there.
   * @throws {McpError} when the file exists but cannot be read.
   */
  read(io: McpIo, place: string): Promise<McpEntry[]>
  /**
   * Write one declaration into that file, replacing whatever it held for that
   * name and leaving every other entry as it stands.
   */
  install(io: McpIo, place: string, name: string, declaration: McpDeclaration): Promise<void>
  /** Take that name's declaration back out, leaving the rest of the file alone. */
  uninstall(io: McpIo, place: string, name: string): Promise<void>
  /**
   * Keep the declaration but tell the client whether to connect it. A client
   * with no such field leaves this out, and its places declare themselves
   * unswitchable instead.
   *
   * @param place — {@link McpPlace.id} to switch.
   * @param scope — the root the switch is about: a client that keeps its state
   * per project writes only the scope that names a project and refuses the rest.
   * @param name — the server's name, as that file keys it.
   * @param enabled — whether the client should connect it.
   * @throws {McpError} when that scope's state is not this client's to write.
   */
  setEnabled?(
    io: McpIo,
    place: string,
    scope: AssetScope,
    name: string,
    enabled: boolean
  ): Promise<void>
  /**
   * The lines one entry occupies in that file, for a pane that reads it apart
   * from the rest. Absent, or null, when the file cannot be pointed at.
   */
  locate?(io: McpIo, place: string, name: string): Promise<[number, number] | null>
}

/**
 * The service this module publishes as {@link MCP_SERVICE}.
 *
 * The toolkit travels with it: an agent plugin is a directory downloaded from
 * somewhere — GitHub, a marketplace — and it imports nothing, so the package
 * the declaration helpers, the JSONC and TOML editors and the failure shape
 * live in is not on its disk. A plugin built inside this repository may import
 * them directly instead; both ways hand it the same functions.
 *
 * A class, not an interface with a factory, because registering has to belong to
 * whoever called it: `register` wraps itself in an effect on the context the
 * caller reached this service through. That only works while `register` is a
 * prototype method — as an arrow property it would close over this service's own
 * context, and every agent's client file would stay registered after that agent
 * was switched off.
 */
export class McpService extends Service {
  readonly tools: McpTools = mcpTools

  private readonly held: McpProvider[] = []

  constructor(ctx: Context) {
    super(ctx, MCP_SERVICE)
  }

  /** Every provider registered right now, in registration order. */
  providers(): readonly McpProvider[] {
    return this.held
  }

  /** Add one provider, for as long as the plugin that added it stays loaded. */
  register(provider: McpProvider): () => void {
    this.held.push(provider)
    return this.ctx.effect(() => () => {
      const at = this.held.indexOf(provider)
      if (at >= 0) this.held.splice(at, 1)
    })
  }
}

/**
 * The service this module publishes, added to the kernel's map of services a
 * plugin may require.
 *
 * The module that publishes a service is the module that types it: a plugin
 * requiring `mcp` reads `plugins.mcp` with this type, and a name no module
 * declared is a name no plugin can inject.
 */
/* A plugin reads this as a property of the context it is handed, so it is
   declared on `Context` — the same place `host` and `i18n` are declared, and
   what makes `ctx.mcp` resolve rather than only `ctx.get("mcp")`. */
declare module "@deepseek-ai/cordis" {
  interface Context {
    /** This module's registry and toolkit; see {@link McpService}. */
    mcp: McpService
  }
}
