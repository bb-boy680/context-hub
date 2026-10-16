/**
 * The service this module publishes as `prompts`, and the only way an agent
 * extension gets its places onto the page.
 *
 * The module keeps the library, the page and the four delivery actions; a
 * provider keeps one agent's own directories. Registration is what joins them,
 * so adding an agent is a plugin.
 */
import type { PromptProvider, PromptService } from "./provider.ts"

/** The service this module hands to every agent extension. */
export function createPromptService(): PromptService {
  const providers: PromptProvider[] = []

  return {
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
