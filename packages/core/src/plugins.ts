/**
 * The hub's plugin space: one directory per installed plugin under
 * `<home>/plugins`. A plugin package is a directory holding `plugin.json` (the
 * kernel manifest: identity, target API, entry module, declared permissions)
 * plus the files it ships. Media lives in the asset library and kernel state in
 * `state/`; this is where third-party code and its own files live.
 *
 * The kernel loads a plugin's entry module through whatever channel the form
 * provides, so this file owns only the layout and the names — never a transport.
 */

/** Route a form serves plugin files on, for a loader that imports them over HTTP. */
export const PLUGIN_ROUTE = "/hub/plugins"

/** Directory under the hub home that holds one directory per plugin. */
export const PLUGIN_DIR = "plugins"

/** Manifest file inside a plugin directory; its `id` must match the directory name. */
export const PLUGIN_MANIFEST = "plugin.json"

/** Bookkeeping file in the plugins root: where each installed plugin came from. */
export const PLUGIN_RECORDS = "index.json"

/** Entry module used when a manifest names none. */
export const DEFAULT_PLUGIN_ENTRY = "index.js"

/** Characters a plugin id may not carry, because it becomes a directory name. */
const RESERVED_DIR_NAMES = new Set([
  "con", "prn", "aux", "nul",
  "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
])

/**
 * Validate a plugin id: it is also the directory name, so it stays dotted,
 * lowercase, and free of separators, spaces, and reserved device names.
 *
 * @param id — the id a manifest declares.
 * @returns the same id, once it is known to be usable as a directory name.
 */
export function assertPluginId(id: string): string {
  if (id.length === 0 || id.length > 96) {
    throw new Error(`plugin id is not allowed: ${JSON.stringify(id)}`)
  }
  const segments = id.split(".")
  for (const segment of segments) {
    if (!/^[a-z0-9][A-Za-z0-9-]*$/.test(segment)) {
      throw new Error(`plugin id is not allowed: ${JSON.stringify(id)}`)
    }
    if (RESERVED_DIR_NAMES.has(segment.toLowerCase())) {
      throw new Error(`plugin id is not allowed: ${JSON.stringify(id)}`)
    }
  }
  return id
}

/** Where one installed plugin came from; the marketplace reads this to check for updates. */
export interface PluginRecord {
  /** Version the installed files carry. */
  version: string
  /** Where it was installed from: a registry spec, URL, or local path. */
  source: string
  /** ISO timestamp of the install. */
  installedAt: string
  /** Content digest recorded at install time, when the source published one. */
  integrity?: string
}

/** Read side of the plugin space: what a loader needs to import installed plugins. */
export interface PluginSource {
  /** Directory the plugins live in, for display in settings and diagnostics. */
  readonly root: string
  /** Every installed plugin id, sorted; a directory without a manifest is not one. */
  list(): Promise<string[]>
  /** Read one text file inside a plugin directory. */
  read(id: string, file: string): Promise<string>
}

/** Read and write side: what an installer needs on top of {@link PluginSource}. */
export interface PluginStore extends PluginSource {
  /** Replace one file inside a plugin directory, creating the directory as needed. */
  write(id: string, file: string, data: string | Uint8Array): Promise<void>
  /** Delete a plugin directory and its record. */
  remove(id: string): Promise<void>
  /** Install records by plugin id; a plugin with no record is absent. */
  records(): Promise<Record<string, PluginRecord>>
  /** Record what was installed and from where. */
  setRecord(id: string, record: PluginRecord): Promise<void>
}
