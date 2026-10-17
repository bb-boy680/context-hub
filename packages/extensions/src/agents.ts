/**
 * Which providers a person's agent choice leaves in play.
 *
 * A provider is an agent integration's own declaration of where that agent
 * keeps its files — where it reads skills from, where it takes prompts in, which
 * client file it keeps MCP servers in. The choice made in the sidebar is what
 * says which agents this hub works with at all, so a provider nobody chose is
 * not read: neither its places inside the workspace in use, nor its machine-wide
 * ones. What a module registers for itself is not an agent's place, and says so
 * with `shared` — it is read whatever is chosen.
 */
import type { Context } from "./cordis.ts"

import type { WorkspaceService } from "@context-hub/core/workspace"

/** Nothing chosen, as a stable value: a subscription must not see a new array. */
const NONE: string[] = []

/** What every provider has to say for this choice to be answerable. */
export interface ChosenProvider {
  /** The integration's id, which is also what the sidebar records. */
  id: string
  /** True for a place the hub owns rather than one an agent reads. */
  shared?: boolean
}

/**
 * The agents the sidebar chose, by integration id.
 *
 * @param workspaces — the form's workspace list, or `undefined` when it has none.
 *   A form that cannot express a choice has chosen nothing: no agent is read.
 * @returns the chosen ids, or an empty list.
 */
export function chosenAgents(workspaces: WorkspaceService | undefined): readonly string[] {
  return workspaces?.current()?.agents ?? NONE
}

/**
 * The same answer for a caller holding the context rather than the service.
 *
 * @param ctx — the kernel context, whose `hub.workspaces` may be absent.
 */
export function chosenAgentsOf(ctx: Context): readonly string[] {
  return chosenAgents(ctx.get("hub.workspaces"))
}

/**
 * The providers a choice leaves readable, in the order they were registered.
 *
 * @param providers — every provider registered right now.
 * @param chosen — {@link chosenAgents}.
 * @returns the shared ones, and the ones whose own agent was chosen.
 */
export function chosenProviders<T extends ChosenProvider>(
  providers: readonly T[],
  chosen: readonly string[]
): T[] {
  return providers.filter((provider) => provider.shared === true || chosen.includes(provider.id))
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    /**
     * The form-owned workspace list. Besides the folders, it holds which agents
     * this hub delivers to, which is what every library filters its places by.
     */
    "hub.workspaces"?: WorkspaceService
  }
}
