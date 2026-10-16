/**
 * Browser-side extension space: reads the extension space over the host's own
 * route, so a page can list installed extensions and import their entry modules
 * without touching the disk. This is the read side only — installing an
 * extension writes files, which is the host's job.
 */
import { EXTENSION_ROUTE } from "@context-hub/core/plugins"
import type { PluginSource } from "@context-hub/core/plugins"

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
