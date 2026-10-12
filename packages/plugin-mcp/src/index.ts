/**
 * MCP servers as a plugin: the page, the records, the nav entry, the service
 * every agent extension registers its client file into, and the contract that
 * service follows.
 *
 * The module knows no client. An agent plugin publishes an `McpProvider` under
 * the `mcp` service this extension provides (see `./registry.ts`), and the page
 * reaches every client through that registry — so adding an agent is a plugin,
 * never a case in here. Without a form that can reach files, the registry is
 * still there and the page says what it cannot do.
 *
 * The definition itself lives in `./extension.ts`, which carries no JSX, and
 * the contract a client extension implements is `./contract.ts`.
 */
import type { ExtensionDefinition } from "@workspace/extensions"

import { mcpExtensionWith } from "./extension.ts"
import { McpServersPage } from "./page.tsx"

export * from "./contract.ts"
export { mcpExtensionWith } from "./extension.ts"
export { McpServersPage }
export { createMcpService } from "./registry.ts"
export { failureText, MCP_TAGS, tagList, useMcpLibrary } from "./library.ts"
export * from "./types.ts"
export {
  buildCatalog,
  placesOf,
  readRecords,
  RECORDS_KEY,
  recordOf,
  scanPlaces,
  upsert,
  type McpLog,
  type McpScan,
  type ScannedPlace,
} from "./catalog.ts"

export const mcpExtension: ExtensionDefinition = mcpExtensionWith(McpServersPage)
