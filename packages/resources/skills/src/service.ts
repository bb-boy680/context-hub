/**
 * The service this module publishes as `skills`, and the only way an agent
 * extension gets its places into the page.
 *
 * The module keeps the library, the loading and the screen; a provider keeps
 * one agent's own directories. Registration is what joins them, so adding an
 * agent is a plugin.
 */
import type { SkillProvider, SkillService } from "./provider.ts"

/** The service this module hands to every agent extension. */
export function createSkillService(): SkillService {
  const providers: SkillProvider[] = []

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
