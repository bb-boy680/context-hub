/**
 * Browser-side extension space: reads the extension space over the host's own
 * route, so a page can list installed extensions and import their entry modules
 * without touching the disk. This is the read side only — installing an
 * extension writes files, which is the host's job.
 */
import { EXTENSION_MARKET_ROUTE, EXTENSION_ROUTE } from "@context-hub/core/plugins"
import type { PluginSource } from "@context-hub/core/plugins"
import type { ExtensionMarketIndex } from "@context-hub/core/extension-market"

/** What the host reports after one market install. */
export interface MarketInstallResult {
  id: string
  version: string
  enabled: boolean
  fresh: boolean
  warning?: string
}

/** The market route as the page uses it. */
export interface RemoteExtensionMarket {
  list(url: string, refresh?: boolean): Promise<ExtensionMarketIndex>
  install(url: string, id: string, version: string): Promise<MarketInstallResult>
  remove(id: string): Promise<void>
}

/** Host answer for the extension list. */
interface PluginListBody {
  ids?: unknown
}

/**
 * Build the read side over the given base path.
 *
 * @param base — origin-relative base the host serves the hub on; empty for the
 * same origin.
 * @param route — route the host serves extension files on.
 * @returns a source a loader can read installed extensions through.
 */
export function createRemotePluginSource(base = "", route = EXTENSION_ROUTE): PluginSource {
  return {
    root: "host",

    async list() {
      const response = await fetch(`${base}${route}`)
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      const body = (await response.json()) as PluginListBody
      return Array.isArray(body.ids) ? (body.ids as string[]) : []
    },

    async read(id, file) {
      const path = file.split("/").map(encodeURIComponent).join("/")
      const response = await fetch(`${base}${route}/${encodeURIComponent(id)}/${path}`)
      if (!response.ok) {
        throw new Error(`could not read "${file}" of "${id}": ${response.status}`)
      }
      return response.text()
    },
  }
}

/**
 * Build the market client over the host's own route.
 *
 * The host reads the index and installs; the page only chooses the source and
 * the entry. A failure carries the host's sentence, so a dialog can show why an
 * install did not happen.
 *
 * @param base — origin-relative base the host serves the hub on; empty for the
 * same origin.
 * @returns the market as the page uses it.
 */
export function createRemoteExtensionMarket(base = ""): RemoteExtensionMarket {
  async function call(body: unknown): Promise<unknown> {
    const response = await fetch(`${base}${EXTENSION_MARKET_ROUTE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const text = await response.text()
    let value: unknown = null
    if (text !== "") {
      try {
        value = JSON.parse(text) as unknown
      } catch {
        /* A body this build cannot read is reported by status below. */
      }
    }
    if (!response.ok) {
      const error = (value as { error?: unknown } | null)?.error
      throw new Error(
        typeof error === "string" ? error : `${String(response.status)} ${response.statusText}`
      )
    }
    return value
  }

  return {
    async list(url, refresh = false) {
      const body = (await call({ action: "list", url, refresh })) as {
        index?: ExtensionMarketIndex
      }
      if (body.index === undefined) throw new Error("the host returned no market index")
      return body.index
    },

    async install(url, id, version) {
      return (await call({ action: "install", url, id, version })) as MarketInstallResult
    },

    async remove(id) {
      await call({ action: "remove", id })
    },
  }
}
