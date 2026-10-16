/**
 * What a server's per-place state says, derived rather than stored: the row's
 * menu, the card's menu and the detail panel all ask the same questions of the
 * same installs the scan produced, so the answers live here rather than in each.
 */
import type { McpAgentPlace, McpInstall, McpScope, McpServer } from "./types.ts"

/** The scopes a place list is grouped by, in display order. */
export const MCP_SCOPES: readonly McpScope[] = ["workspace", "global"]

/** One place, paired with this server's state in it. */
export interface McpPlaceState {
  place: McpAgentPlace
  install: McpInstall | undefined
}

/**
 * Line a server's recorded states up against the catalog's places. A place the
 * server has no record for is simply not installed there.
 */
export function placesOf(
  places: readonly McpAgentPlace[],
  installs: readonly McpInstall[]
): McpPlaceState[] {
  const byPlace = new Map(installs.map((install) => [install.place, install]))
  return places.map((place) => ({ place, install: byPlace.get(place.id) }))
}

/** The places of one scope, with their state. */
export function placesInScope(
  states: readonly McpPlaceState[],
  scope: McpScope
): McpPlaceState[] {
  return states.filter((state) => state.place.scope === scope)
}

/** How many places declare this server today. */
export function installedCount(states: readonly McpPlaceState[]): number {
  return states.filter((state) => state.install?.installed === true).length
}

/**
 * Whether any client is set to connect this server. The row's off chip reads
 * this rather than a field of its own, so a switch flipped in the menu and the
 * chip beside it can never disagree.
 */
export function isEnabled(server: McpServer): boolean {
  return server.detail.installs.some((install) => install.installed && install.enabled)
}

/**
 * Whether any client holds this server's declaration at all.
 *
 * A server no file holds is not switched off — there is nothing to switch — so
 * the row's off chip asks for both facts.
 */
export function isInstalled(server: McpServer): boolean {
  return server.detail.installs.some((install) => install.installed)
}

/** How many clients hold the declaration and are set to connect, which a switch reads. */
export function onCount(installs: readonly McpInstall[]): number {
  return installs.filter((install) => install.installed && install.enabled).length
}
