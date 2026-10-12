/**
 * Codex's own MCP client file, as the plugin that knows Codex reads and writes
 * it.
 *
 * Codex keeps one config per machine. Its MCP servers live under a snake_case
 * table — a different table name from the camelCase key the JSON clients use —
 * and each entry carries an `enabled` field, which is what lets the hub keep a
 * declaration in the file while switching the client off. Reading and writing
 * both go through the toolkit the MCP service hands over, so the rest of the
 * file keeps its comments and its layout.
 */
/* Types only, and they come from the MCP module because that module owns the
   contract a client file is written against. A type import is erased, so at run
   time this plugin reads nothing from that package: the registry to register
   into and the editors to write with arrive through the `mcp` service, the same
   way a plugin installed as a folder gets them. */
import type { McpIo, McpProvider, McpTools, TomlEntryValues } from "@workspace/plugin-mcp/contract"

/** The table Codex keeps its servers under. */
const TABLE = "mcp_servers"

/** The field of one entry that says whether Codex connects it. */
const ENABLED = "enabled"

/** The one file this client reads. */
const FILE = { scope: "global", file: ".codex/config.toml" } as const

/**
 * Codex, as the MCP module uses it.
 *
 * @param tools — the toolkit the MCP service hands over: the TOML reader and
 * editor, the declaration helpers, and {@link McpTools.McpError} to report a
 * failure in this extension's own words.
 */
export function createCodexMcp(tools: McpTools): McpProvider {
  const {
    McpError,
    clearTomlEntry,
    parseToml,
    readDeclaration,
    setTomlEntry,
    setTomlField,
    tomlEntryLines,
    writeDeclaration,
  } = tools

  /** Codex keeps one file; a call naming another place is a caller's mistake. */
  const assertPlace = (place: string): void => {
    if (place !== "codex-global") throw new McpError("codex.error.unknownPlace", { place })
  }

  /** The file's text, or an empty one when the client has no config yet. */
  const readFile = async (io: McpIo): Promise<string> => {
    try {
      return (await io.files.read(FILE)) ?? ""
    } catch (error) {
      throw new McpError("codex.error.refused", { file: FILE.file }, messageOf(error))
    }
  }

  /** The servers a file's text holds, or none when it holds no such table yet. */
  const tableOf = (text: string): Record<string, unknown> => {
    if (text.trim() === "") return {}
    let document: Record<string, unknown>
    try {
      document = parseToml(text)
    } catch (error) {
      throw new McpError("codex.error.parse", undefined, messageOf(error))
    }
    const held = document[TABLE]
    if (typeof held !== "object" || held === null) return {}
    return held as Record<string, unknown>
  }

  /** One edit, with the editor's refusal named as this client's failure. */
  const edit = (change: () => string): string => {
    try {
      return change()
    } catch (error) {
      throw new McpError("codex.error.refused", { file: FILE.file }, messageOf(error))
    }
  }

  return {
    id: "hub.target.codex",
    places: [{ id: "codex-global", label: "Codex", switchable: true, ...FILE }],

    async read(io, place) {
      assertPlace(place)
      const text = await readFile(io)
      return Object.entries(tableOf(text)).map(([name, entry]) => ({
        name,
        declaration: readDeclaration(entry),
        /* An entry that names no `enabled` field is one Codex connects. */
        enabled: fieldOf(entry, ENABLED) !== false,
      }))
    },

    async install(io, place, name, declaration) {
      assertPlace(place)
      const text = await readFile(io)
      const values: TomlEntryValues = { ...writeDeclaration(declaration) }
      /* Writing a declaration is not a reason to connect a server the client was
         told to leave alone. */
      if (fieldOf(tableOf(text)[name], ENABLED) === false) values[ENABLED] = false
      await io.files.write(FILE, edit(() => setTomlEntry(text, TABLE, name, values)))
    },

    async uninstall(io, place, name) {
      assertPlace(place)
      const text = await readFile(io)
      await io.files.write(FILE, edit(() => clearTomlEntry(text, TABLE, name)))
    },

    /* Codex records the state on the entry itself rather than under a root, so
       the scope the caller names does not change what is written. */
    async setEnabled(io, place, _scope, name, enabled) {
      assertPlace(place)
      const text = await readFile(io)
      await io.files.write(FILE, edit(() => setTomlField(text, TABLE, name, ENABLED, enabled)))
    },

    async locate(io, place, name) {
      assertPlace(place)
      const text = await io.files.read(FILE)
      return text === null ? null : tomlEntryLines(text, TABLE, name)
    },
  }
}

/** One entry's field, whichever kind of entry it is. */
function fieldOf(entry: unknown, field: string): unknown {
  if (typeof entry !== "object" || entry === null) return undefined
  return (entry as Record<string, unknown>)[field]
}

/** The message one thrown value carries. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
