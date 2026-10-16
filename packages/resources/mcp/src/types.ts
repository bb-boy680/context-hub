/**
 * The shapes the MCP pages render. Nothing here holds a component that has to
 * travel: a server's mark is a name the client resolves (see `./marks.ts`), and
 * a place's icon is the one its own extension declares.
 *
 * A place is the kernel's `McpPlace` — a client file an agent extension knows
 * how to read, and whether the hub may write that client's switch for it — plus
 * what only this module can say about it: how its path reads, and the mark of
 * the extension that registered it.
 */
import type { ExtensionIcon } from "@context-hub/extensions"
import type { McpDeclaration, McpPlace, McpTransport } from "./contract.ts"
import type { McpCacheEntry } from "./probe.ts"
import type { McpTool } from "./tools.ts"

export type { McpDeclaration, McpTransport } from "./contract.ts"

/** What the last scan made of a server: nothing wrong, or something to show. */
export type McpStatus = "ready" | "failed"

/** The scope a declaration lives under, as the row's place chips list it. */
export type McpPlaceKind = "workspace" | "global"

/** Which root a place's file sits under: the workspace, or the home directory. */
export type McpScope = McpPlaceKind

/**
 * A brand mark, named rather than drawn: the client turns `github` into the
 * image its public directory serves, and `generic` into a glyph. A component
 * could not travel over the bridge, and a file path is the client's business,
 * so the catalog carries only the name.
 */
export type McpMark = "github" | "linear" | "postgresql" | "generic"

/** One client file as the page renders it: the place, plus how it is shown. */
export interface McpAgentPlace extends McpPlace {
  /** The file as a person reads it, with the home directory abbreviated. */
  path: string
  /**
   * The extension that registered it. Every place of one client carries the
   * same id, which is what tells "this client has no switch" apart from "this
   * client has no declaration here".
   */
  client: string
  /** The mark of the extension that registered it, from its own manifest. */
  icon: ExtensionIcon
}

/** A place's file as a person reads it: `~`-prefixed outside a workspace. */
export function displayPlaceFile(place: Pick<McpPlace, "scope" | "file">): string {
  return place.scope === "global" ? `~/${place.file}` : place.file
}

/** What the add dialog hands over to become a record, and what the form may save. */
export interface McpDraft {
  /** The server's name, which is also its id and its key in every file. */
  name: string
  /** The declaration in full. */
  declaration: McpDeclaration
  /** One sentence on what the server offers. */
  description?: string
  /** Tag ids it carries. */
  tags?: string[]
}

/** The changes the detail form may save onto a record. */
export interface McpPatch {
  /** A new name, when the person renamed it. */
  name?: string
  /** A new declaration. */
  declaration?: McpDeclaration
  /** A new description. */
  description?: string
  /** The tags it carries now. */
  tags?: string[]
}

/** One server as the hub recorded it: what the person wrote, and nothing a file said. */
export interface McpRecord extends McpDraft {
  declaration: McpDeclaration
  description: string
  tags: string[]
}

/** One server's state in one place. */
export interface McpInstall {
  /** {@link McpPlace.id}. */
  place: string
  /** The declaration is written into that place's file. */
  installed: boolean
  /**
   * That client will connect the server. A separate fact from
   * {@link installed}: the declaration stays in the file while a client may be
   * told not to load it.
   */
  enabled: boolean
  /**
   * The place's file says something but not a declaration this build can read,
   * which the place row marks rather than showing as absent.
   */
  unreadable?: boolean
}

/** One configuration file a server is declared in. */
export interface McpConfigFile {
  /** {@link McpPlace.id} the file belongs to. */
  place: string
  /** The file as a person reads it, with the home directory abbreviated. */
  path: string
  /** The file's text, one entry per line. */
  content: string
  /**
   * The 1-based lines this server occupies, which read apart from the rest.
   * Null when the pane could not point at them, in which case the file is
   * shown without a pick rather than with a wrong one.
   */
  lines: [number, number] | null
}

/** Everything the detail panel shows about one server beyond its row. */
export interface McpDetail {
  /**
   * The declaration in full, which the form edits; null when no file holds one
   * this build can read, so the form opens empty instead of inventing one.
   */
  declaration: McpDeclaration | null
  /** Tag ids this server carries. */
  tags: string[]
  /** This server's state in every place the catalog lists. */
  installs: McpInstall[]
  /** The tools the last probe listed; empty until one proves what they are. */
  tools: McpTool[]
}

/** One MCP server as the list and the cards present it. */
export interface McpServer {
  /** The server's name, which is its id and its key in every client file. */
  id: string
  name: string
  transport: McpTransport
  /** The command with its arguments, or the URL, as the row shows it. */
  declaration: string
  /** What the server offers, when a record carries a sentence; empty otherwise. */
  description: string
  /**
   * How many declarations disagree about the endpoint. Absent when they agree
   * or there are none, which is also when the row shows no sync chip.
   */
  conflicts?: number
  /** How many places hold a declaration this build cannot read. */
  unreadable: number
  /** How many places declare it, which the check column and the panel count. */
  installed: number
  /**
   * The hub holds a record for it. A server only a client file declares is a
   * row too, so this is what tells the hub's own library apart from the rest.
   */
  stored: boolean
  /**
   * The row's one verdict: a declaration another file disagrees with, an entry
   * this build cannot read, or a probe that could not connect.
   */
  status: McpStatus
  /**
   * What the last probe of this server found, when one has run and the cache
   * still applies. It is kept apart from {@link status}, which is about the
   * client files rather than about reaching the server.
   */
  check?: McpCacheEntry
  mark: McpMark
  /** The primary tag id; empty when untagged. */
  tag: string
  /** Everything the detail panel needs that a row does not show. */
  detail: McpDetail
}

/** One client file the last scan could not read at all. */
export interface McpScanProblem {
  /** {@link McpPlace.id}. */
  place: string
  /** Why it could not be read, as the read reported it. */
  message: string
}

/** What the MCP pages read once: the servers, and what the scan made of them. */
export interface McpCatalog {
  servers: McpServer[]
  /** When the last scan ran, in epoch milliseconds; null before the first one. */
  scannedAt: number | null
  /** Places whose file could not be read, kept so the page can say so. */
  problems: McpScanProblem[]
}
