/**
 * The plugin library's list, as this page reads it.
 *
 * Installation goes through the same route, but only the install dialog needs
 * it; the page itself asks one question — what is already here?
 */
import { PLUGIN_ROUTE, type PackContents, type PluginRecord } from "@context-hub/plugins"
import { call, type PluginCollected } from "@context-hub/plugins/library"
import type { MarketInstallSource } from "@context-hub/plugins/market-install"

interface ListAnswer {
  plugins: PluginRecord[]
}

/** Every pack the hub has collected. */
export async function listLibraryRecords(): Promise<PluginRecord[]> {
  const answer = await call<ListAnswer>(`${PLUGIN_ROUTE}?action=list`)
  return answer.plugins
}

/**
 * Collect one market entry into the library.
 *
 * The address is the one the index published, commit included. The library
 * answers with the record it now holds; delivering it to an agent is the
 * library's own install, not this call.
 */
export async function collectMarketInstall(
  spec: MarketInstallSource
): Promise<PluginCollected> {
  return call<PluginCollected>(PLUGIN_ROUTE, { action: "market-install", spec })
}

/** What one market entry carries, read before the library holds it. */
export interface MarketPreview {
  readme: string | null
  contents: PackContents
}

/**
 * Read one market entry's own files without collecting it.
 *
 * The host fetches into a staging directory the library never sees, so this
 * leaves the library and every agent exactly as they were.
 */
export async function previewMarketEntry(
  spec: MarketInstallSource
): Promise<MarketPreview> {
  return call<MarketPreview>(PLUGIN_ROUTE, { action: "market-preview", spec })
}
