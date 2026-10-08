/**
 * Browser-side plugin space: reads the plugin space over the host's own route,
 * so a page can list installed plugins and import their entry modules without
 * touching the disk. This is the read side only — installing a plugin writes
 * files, which is the host's job.
 */
import { PLUGIN_ROUTE } from "@workspace/core/plugins"
import type { PluginSource } from "@workspace/core/plugins"

/** Host answer for the plugin list. */
interface PluginListBody {
  ids?: unknown
}

/**
 * Build the read side over the given base path.
 *
 * @param base — origin-relative base the host serves the hub on; empty for the
 * same origin.
 * @param route — route the host serves plugin files on.
 * @returns a source a loader can read installed plugins through.
 */
export function createRemotePluginSource(base = "", route = PLUGIN_ROUTE): PluginSource {
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
