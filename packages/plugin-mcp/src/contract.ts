/**
 * What a client extension implements and works with: the declaration both sides
 * agree on, the JSONC and TOML editors that change one entry without touching
 * the rest of a client's file, the provider a client extension registers, and
 * the failure shape its errors travel in.
 *
 * It lives here, not in the kernel: MCP is a feature of this module, and the
 * kernel knows nothing of it. A client extension either imports these types —
 * a type import is erased, so nothing loads at run time — or, when it arrived
 * as an installed folder, takes the same functions off the `mcp` service.
 *
 * Nothing here imports a Node built-in: these files are read in the browser as
 * well as in a Node process, and the module only ever works on text.
 */
export {
  declarationLine,
  readDeclaration,
  splitArguments,
  writeDeclaration,
  type McpDeclaration,
  type McpEntryValues,
  type McpRemoteDeclaration,
  type McpStdioDeclaration,
  type McpTransport,
} from "./declaration.ts"
export { McpError, mcpFailure, type McpFailure } from "./failure.ts"
export { editJson, jsonValueLines, parseJsonc, readJsonObject, valueAt } from "./jsonc.ts"
export {
  MCP_SERVICE,
  type McpEntry,
  type McpIo,
  type McpPlace,
  type McpProvider,
  type McpRegistry,
  type McpService,
} from "./provider.ts"
export {
  mcpTools,
  type McpDeclarationTools,
  type McpFailureTools,
  type McpJsonTools,
  type McpTomlTools,
  type McpTools,
} from "./toolkit.ts"
export {
  clearTomlEntry,
  isBareKey,
  setTomlEntry,
  setTomlField,
  tomlEntryLines,
  writeTomlKey,
  writeTomlString,
  type TomlEntryValues,
} from "./toml.ts"
