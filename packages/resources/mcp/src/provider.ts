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
import type { AssetScope, PlaceFiles, PlaceRef } from "@context-hub/core/place-files"

import type { McpDeclaration } from "./declaration.ts"
import type { McpTools } from "./toolkit.ts"

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

/** What the MCP module publishes as {@link MCP_SERVICE}. */
export interface McpService {
  /** Where a client extension registers the file it reads and writes. */
  readonly registry: McpRegistry
  /**
   * What that extension reads and writes the file with: the declaration
   * helpers, the JSONC and TOML editors, and the failure shape.
   *
   * It travels here rather than only as a module export because an installed
   * plugin is a directory downloaded from somewhere — GitHub, a marketplace —
   * and it imports nothing: the package these functions live in is not on its
   * disk. A plugin built inside this repository may import them directly
   * instead; both ways hand it the same functions.
   */
  readonly tools: McpTools
}

/** Where a client extension registers the provider it wrote. */
export interface McpRegistry {
  /** Every provider registered right now, in registration order. */
  providers(): readonly McpProvider[]
  /**
   * Add one provider.
   *
   * @returns a disposer that takes it back out; a provider registered inside a
   * plugin's `inject` callback is disposed with that callback.
   */
  register(provider: McpProvider): () => void
}

/**
 * The service this module publishes, added to the kernel's map of services a
 * plugin may require.
 *
 * The module that publishes a service is the module that types it: a plugin
 * requiring `mcp` reads `plugins.mcp` with this type, and a name no module
 * declared is a name no plugin can inject.
 */
declare module "@context-hub/extensions" {
  interface ExtensionServices {
    /** This module's registry and toolkit; see {@link McpService}. */
    mcp: McpService
  }
}
