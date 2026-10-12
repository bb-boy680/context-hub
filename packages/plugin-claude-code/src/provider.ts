/**
 * Claude Code's own MCP files, as the extension that knows Claude Code reads
 * and writes them.
 *
 * It declares servers in two places: `.mcp.json` at a project's root, which
 * belongs to the project and is shared with whoever opens it, and `.claude.json`
 * in the home directory, which is Claude Code's own document for everything
 * outside a project. Both are JSONC, so writes go node by node — that file also
 * holds every project's settings, and a rewrite would reflow what a person put
 * there.
 *
 * The switch is a third thing again: a project's `disabledMcpServers` list in
 * the top-level document, keyed by the project's path. Both places write it,
 * because a project can disable a server either scope declared.
 */
/* Types only, and they come from the MCP module because that module owns the
   contract a client file is written against. A type import is erased, so at run
   time this extension reads nothing from that package: the registry to register
   into and the editors to write with arrive through the `mcp` service, the same
   way a plugin installed as a folder gets them. */
import type { McpEntry, McpIo, McpProvider, McpTools } from "@workspace/plugin-mcp/contract"

import {
  CLAUDE_CODE_DISABLED_KEY,
  CLAUDE_CODE_GLOBAL_MCP_FILE,
  CLAUDE_CODE_ID,
  CLAUDE_CODE_MCP_FILE,
  CLAUDE_CODE_MCP_KEY,
} from "./locations.ts"

/** The two places Claude Code reads servers from. */
const FILES = {
  workspace: { scope: "workspace", file: CLAUDE_CODE_MCP_FILE },
  global: { scope: "global", file: CLAUDE_CODE_GLOBAL_MCP_FILE },
} as const

/** The file that records the switch, and the node it sits under. */
const STATE = { scope: "global", file: CLAUDE_CODE_GLOBAL_MCP_FILE } as const
const PROJECTS = "projects"

/**
 * Claude Code, as the MCP module uses it.
 *
 * @param tools — the toolkit the MCP service hands over: the editors that keep
 * the rest of a client file byte for byte, and {@link McpTools.McpError} to
 * report a failure in this extension's own words.
 */
export function createClaudeCodeMcp(tools: McpTools): McpProvider {
  const {
    McpError,
    editJson,
    jsonValueLines,
    readDeclaration,
    readJsonObject,
    valueAt,
    writeDeclaration,
  } = tools

  /** The file one place id names. */
  const fileOf = (place: string): { scope: "workspace" | "global"; file: string } => {
    if (place === "claude-code-global") return FILES.global
    if (place === "claude-code") return FILES.workspace
    throw new McpError("claudeCode.error.unknownPlace", { place })
  }

  /** The file's text, or an empty one when the file is not there yet. */
  const read = async (
    io: McpIo,
    place: { scope: "workspace" | "global"; file: string }
  ): Promise<string> => {
    try {
      return (await io.files.read(place)) ?? ""
    } catch (error) {
      throw new McpError("claudeCode.error.refused", undefined, messageOf(error))
    }
  }

  /** Write one file, naming a refusal as this client's failure. */
  const write = async (
    io: McpIo,
    place: { scope: "workspace" | "global"; file: string },
    text: string
  ): Promise<void> => {
    try {
      await io.files.write(place, text)
    } catch (error) {
      throw new McpError("claudeCode.error.refused", undefined, messageOf(error))
    }
  }

  /** The names this project's record lists as switched off. */
  const disabledNames = async (io: McpIo): Promise<string[]> => {
    const document = readJsonObject(await io.files.read(STATE))
    const key = await existingProjectKey(io, document)
    if (key === null) return []
    const listed = valueAt(document, [PROJECTS, key, CLAUDE_CODE_DISABLED_KEY])
    return Array.isArray(listed)
      ? listed.filter((item): item is string => typeof item === "string")
      : []
  }

  /**
   * The key this project's record already goes by, or null when Claude Code has
   * never recorded this folder.
   *
   * Claude Code spells a project's path its own way, and the hub must write the
   * record that is there rather than a second one beside it — so an existing
   * key is matched with separators and case normalized. A project with no
   * record is never invented: writing one would tell Claude Code about a folder
   * it never opened.
   */
  const existingProjectKey = async (io: McpIo, document: unknown): Promise<string | null> => {
    const workspace = await io.files.workspace()
    if (workspace === null) return null
    const projects = valueAt(document, [PROJECTS])
    if (typeof projects !== "object" || projects === null) return null
    const wanted = normalize(workspace)
    return Object.keys(projects).find((key) => normalize(key) === wanted) ?? null
  }

  return {
    id: CLAUDE_CODE_ID,
    places: [
      { id: "claude-code-global", label: "Claude Code", order: 10, ...FILES.global },
      { id: "claude-code", label: "Claude Code", order: 20, ...FILES.workspace },
    ],

    async read(io, place) {
      const text = await io.files.read(fileOf(place))
      const document = readJsonObject(text)
      const held = valueAt(document, [CLAUDE_CODE_MCP_KEY])
      if (typeof held !== "object" || held === null) return []

      const disabled = await disabledNames(io)
      return Object.entries(held as Record<string, unknown>).map(
        ([name, entry]): McpEntry => ({
          name,
          declaration: readDeclaration(entry),
          /* A name no project has disabled is one Claude Code connects. */
          enabled: !disabled.includes(name),
        })
      )
    },

    async install(io, place, name, declaration) {
      const file = fileOf(place)
      const text = await read(io, file)
      const entry: Record<string, unknown> = {
        ...writeDeclaration(declaration),
      }
      /* Claude Code names the transport of a remote server; a stdio one is the
         default and carries no `type`. */
      if (declaration.transport !== "stdio") entry.type = declaration.transport
      await write(io, file, editJson(text, [CLAUDE_CODE_MCP_KEY, name], entry))
    },

    async uninstall(io, place, name) {
      /* Only this one entry leaves, even when it was the last: a file the hub
         may have created is not the hub's to delete later, and an empty box in
         a client file is its owner's to keep. */
      const file = fileOf(place)
      const text = await read(io, file)
      await write(io, file, editJson(text, [CLAUDE_CODE_MCP_KEY, name], undefined))
    },

    async setEnabled(io, place, name, enabled) {
      /* Both places share one list: a project disables a server, whichever
         scope declared it, so the place id does not change where the switch
         lands — naming one is still how a caller says which client it means. */
      fileOf(place)
      const text = await read(io, STATE)
      const document = readJsonObject(text)
      const key = await existingProjectKey(io, document)
      if (key === null) {
        throw new McpError("claudeCode.error.noProject", {
          file: CLAUDE_CODE_GLOBAL_MCP_FILE,
        })
      }
      const path = [PROJECTS, key, CLAUDE_CODE_DISABLED_KEY]
      const listed = valueAt(document, path)
      const names = Array.isArray(listed)
        ? listed.filter((item): item is string => typeof item === "string")
        : []
      const next = enabled
        ? names.filter((item) => item !== name)
        : [...new Set([...names, name])]

      /* The list leaves with the last name it held, so a project that disables
         nothing keeps no empty array behind. */
      await write(
        io,
        STATE,
        editJson(text, path, next.length === 0 ? undefined : next)
      )
    },

    async locate(io, place, name) {
      const text = await io.files.read(fileOf(place))
      return text === null
        ? null
        : jsonValueLines(text, [CLAUDE_CODE_MCP_KEY, name])
    },
  }
}

/** A path compared the way Claude Code spells it: forward slashes, no trailing one. */
function normalize(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase()
}

/** The message one thrown value carries. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
