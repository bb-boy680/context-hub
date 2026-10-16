/**
 * The service this module publishes as `mcp`, and the only way an agent
 * extension gets its client file into the page.
 *
 * The module keeps the records, the catalog and the screen; a provider keeps
 * one client's own file. Registration is what joins them, so adding an agent is
 * a plugin — the page has no list of clients to keep in step.
 *
 * The toolkit travels with the registry: an agent plugin is a directory that
 * imports nothing, so the editors it writes its client's file with have to
 * arrive the same way the registration does.
 */
import { mcpTools, type McpProvider, type McpService } from "./contract.ts"

/** The service this module hands to every agent extension. */
export function createMcpService(): McpService {
  const providers: McpProvider[] = []

  return {
    tools: mcpTools,

    registry: {
      providers: () => providers,

      register(provider) {
        providers.push(provider)
        return () => {
          const at = providers.indexOf(provider)
          if (at >= 0) providers.splice(at, 1)
        }
      },
    },
  }
}
