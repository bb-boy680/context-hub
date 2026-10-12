/**
 * Cline's own MCP settings file, as the plugin that knows Cline reads and
 * writes it.
 *
 * Cline keeps one settings file per machine: the CLI reads
 * `~/.cline/data/settings/cline_mcp_settings.json` unless
 * `CLINE_MCP_SETTINGS_PATH` points elsewhere, and the editor extensions keep
 * the same document in their own storage. This plugin writes the file Cline's
 * CLI names, because that is the one path both the docs and the CLI agree on
 * and it is the only one that resolves under a person's home on every
 * platform. Servers live under `mcpServers`, and each entry carries a
 * `disabled` field, which is what lets the hub keep a declaration in the file
 * while switching the client off.
 *
 * Two of Cline's own conventions differ from the other JSON clients, so both
 * are handled here rather than by the shared reader: a remote entry spells
 * streamable HTTP as `type: "streamableHttp"`, and an entry with no `type` at
 * all is the legacy SSE transport rather than HTTP.
 */
/* Types only, and they come from the MCP module because that module owns the
   contract a client file is written against. A type import is erased, so at run
   time this plugin reads nothing from that package: the registry to register
   into and the editors to write with arrive through the `mcp` service, the same
   way a plugin installed as a folder gets them. */
import type {
  McpDeclaration,
  McpEntry,
  McpIo,
  McpProvider,
  McpTools,
} from "@workspace/plugin-mcp/contract"

/** The key Cline keeps its servers under. */
const SERVERS = "mcpServers"

/** The field of one entry that says whether Cline connects it. */
const DISABLED = "disabled"

/** The field that names a remote entry's transport, in Cline's spelling. */
const TYPE = "type"

/** Cline's name for streamable HTTP; the other remote spelling is `"sse"`. */
const STREAMABLE_HTTP = "streamableHttp"

/** The keys a declaration owns, which a rewrite replaces rather than merges. */
const DECLARATION_KEYS = [
  "command",
  "args",
  "env",
  "url",
  "headers",
  TYPE,
] as const

/** The one file this client reads, relative to the person's home. */
const FILE = { scope: "global", file: ".cline/data/settings/cline_mcp_settings.json" } as const

/** The id the page names this place by; the skills place uses its own name. */
const PLACE = "cline-mcp"

/**
 * Cline, as the MCP module uses it.
 *
 * @param tools — the toolkit the MCP service hands over: the JSONC reader and
 * editor, the declaration helpers, and {@link McpTools.McpError} to report a
 * failure in this extension's own words.
 */
export function createClineMcp(tools: McpTools): McpProvider {
  const { McpError, editJson, readDeclaration, readJsonObject, valueAt, writeDeclaration } = tools

  /** Cline keeps one file; a call naming another place is a caller's mistake. */
  const assertPlace = (place: string): void => {
    if (place !== PLACE) throw new McpError("cline.error.unknownPlace", { place })
  }

  /** The file's text, or an empty one when Cline has no settings yet. */
  const readFile = async (io: McpIo): Promise<string | null> => {
    try {
      return await io.files.read(FILE)
    } catch (error) {
      throw new McpError("cline.error.refused", { file: FILE.file }, messageOf(error))
    }
  }

  /** The servers a settings file holds, keyed by name. */
  const tableOf = (text: string | null): Record<string, unknown> => {
    let document: Record<string, unknown> | null
    try {
      document = readJsonObject(text)
    } catch (error) {
      throw new McpError("cline.error.parse", undefined, messageOf(error))
    }
    const held = valueAt(document, [SERVERS])
    return typeof held === "object" && held !== null && !Array.isArray(held)
      ? (held as Record<string, unknown>)
      : {}
  }

  /** One field of an entry, whichever kind of entry it is. */
  const fieldOf = (entry: unknown, field: string): unknown =>
    typeof entry === "object" && entry !== null
      ? (entry as Record<string, unknown>)[field]
      : undefined

  /**
   * The declaration one entry holds.
   *
   * The shared reader is used for the entry's own fields; Cline's default
   * transport is applied on top of it, because an entry that names no `type` is
   * a legacy SSE server here while the shared reader would call it HTTP.
   */
  const declarationOf = (entry: unknown): McpDeclaration | null => {
    const read = readDeclaration(entry)
    if (read === null || read.transport === "stdio") return read
    return fieldOf(entry, TYPE) === STREAMABLE_HTTP
      ? { ...read, transport: "http" }
      : { ...read, transport: "sse" }
  }

  /** The entry one declaration becomes, in the fields Cline reads. */
  const valuesOf = (declaration: McpDeclaration): Record<string, unknown> => {
    const values: Record<string, unknown> = { ...writeDeclaration(declaration) }
    if (declaration.transport !== "stdio") {
      /* Cline names HTTP, and takes `"sse"` either way; an entry it wrote
         always spells its transport out. */
      values[TYPE] = declaration.transport === "http" ? STREAMABLE_HTTP : "sse"
    }
    return values
  }

  /** What an entry keeps when its declaration is rewritten: everything that is
      not part of the declaration, such as the tools Cline may auto-approve. */
  const keptOf = (entry: unknown): Record<string, unknown> => {
    if (typeof entry !== "object" || entry === null) return {}
    const kept: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(entry as Record<string, unknown>)) {
      if (!(DECLARATION_KEYS as readonly string[]).includes(key)) kept[key] = value
    }
    return kept
  }

  /** Write the settings file, naming a refusal as this client's failure. */
  const write = async (io: McpIo, text: string): Promise<void> => {
    try {
      await io.files.write(FILE, text)
    } catch (error) {
      throw new McpError("cline.error.refused", { file: FILE.file }, messageOf(error))
    }
  }

  return {
    id: "hub.target.cline",
    places: [{ id: PLACE, label: "Cline", switchable: true, ...FILE }],

    async read(io, place) {
      assertPlace(place)
      const table = tableOf(await readFile(io))
      return Object.entries(table).map(
        ([name, entry]): McpEntry => ({
          name,
          declaration: declarationOf(entry),
          /* An entry that names no `disabled` field is one Cline connects. */
          enabled: fieldOf(entry, DISABLED) !== true,
        })
      )
    },

    async install(io, place, name, declaration) {
      assertPlace(place)
      const text = await readFile(io)
      const held = tableOf(text)[name]
      await write(io, editJson(text, [SERVERS, name], {
        ...keptOf(held),
        ...valuesOf(declaration),
      }))
    },

    async uninstall(io, place, name) {
      assertPlace(place)
      const text = await readFile(io)
      await write(io, editJson(text, [SERVERS, name], undefined))
    },

    /* Cline records the state on the entry itself, so the scope a caller names
       does not change what is written. */
    async setEnabled(io, place, _scope, name, enabled) {
      assertPlace(place)
      const text = await readFile(io)
      if (tableOf(text)[name] === undefined) {
        throw new McpError("cline.error.absent", { name })
      }
      await write(io, editJson(text, [SERVERS, name, DISABLED], !enabled))
    },

    async locate(io, place, name) {
      assertPlace(place)
      const text = await readFile(io)
      return text === null ? null : tools.jsonValueLines(text, [SERVERS, name])
    },
  }
}

/** The message one thrown value carries. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
