/**
 * The MCP module's one search function.
 *
 * It reads the same rows the page draws — records and client files folded
 * together — so a server the page lists can be found even when the hub holds no
 * record for it. The note under a result is the server's own description; a
 * declaration is a command, not a sentence to read.
 */
import { ServerIcon } from "lucide-react"

import { matchesQuery, searchPath } from "@context-hub/extensions"
import type { SearchContribution, SearchResult } from "@context-hub/extensions"

import type { McpLibrary } from "./library-store.ts"
import { markImage } from "./marks.ts"
import type { McpServer } from "./types.ts"

/** The page every result opens. */
const PAGE = "/mcp-servers"

/**
 * Build the provider the palette reads.
 *
 * @param library — the module's shared read.
 * @returns the provider, whose lifetime is the module's own `apply`.
 */
export function mcpSearch(library: McpLibrary): SearchContribution {
  return {
    labelKey: "search.group.mcp",
    icon: ServerIcon,
    search(query) {
      const catalog = library.rows()
      return catalog === null ? [] : searchServers(catalog.servers, query)
    },
    subscribe: (listener) => library.subscribe(listener),
  }
}

/**
 * The servers matching one query.
 *
 * @param servers — the folded rows the page draws.
 * @param query — what the person typed.
 * @returns the matching rows, with the brand mark when the server has one.
 */
export function searchServers(
  servers: readonly McpServer[],
  query: string
): SearchResult[] {
  return servers
    .filter((server) =>
      matchesQuery(query, server.name, server.declaration, server.description)
    )
    .map((server) => {
      const avatar = markImage(server.mark)
      return {
        id: server.id,
        title: server.name,
        ...(server.description === "" ? {} : { description: server.description }),
        ...(avatar === null ? {} : { avatar }),
        path: searchPath(PAGE, query, { view: "list" }),
      }
    })
}
