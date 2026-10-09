/**
 * Web form of the kernel: the host is the hub's own directory, reached over the
 * dev server. Everything the kernel remembers is read from there before it
 * starts and written back on every change, so nothing depends on this browser
 * profile. The browser cannot read the skill library or the installed plugins
 * itself, so `startHub` offers those only when a host answers for them; the
 * skills plugin falls back to its sample data when nobody does.
 */
import { STATE_ROUTE } from "@workspace/core/state"
import { createRemoteNet } from "@workspace/core/net"
import {
  builtinExtensions,
  createHubKernel,
  createRemotePluginSource,
  discoverPlugins,
  type HubKernel,
  type PlatformHost,
  type StoragePort,
} from "@workspace/extensions"
import { simplifiedChineseLocale } from "@workspace/locale-zh-cn"
import { createRemoteSkillStore, skillsExtension } from "@workspace/plugin-skills"
import { skillsShExtension } from "@workspace/plugin-skills-sh"
import * as ui from "./ui-kit.ts"
import { createRemoteWorkspaceService } from "./workspaces.ts"

/** Path the active form serves the skill library on, when it serves one at all. */
const SKILLS_ENDPOINT = "/hub/skills"

/**
 * Where the build before the host-backed state kept each document, and how it
 * encoded the value: the state was JSON text, the locale id a bare string.
 */
const BROWSER_HELD_STATE: {
  document: string
  key: string
  decode(raw: string): unknown
}[] = [
  { document: "extensions", key: "hub/extensions/state", decode: (raw) => JSON.parse(raw) },
  { document: "locale", key: "hub/locale", decode: (raw) => raw },
]

/** Send one document to the host; a failure is reported, never thrown at a click. */
async function storeDocument(document: string, value: unknown): Promise<boolean> {
  try {
    const response = await fetch(`${STATE_ROUTE}/${encodeURIComponent(document)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    })
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    return true
  } catch (error) {
    console.warn(`context hub: could not store "${document}"`, error)
    return false
  }
}

/**
 * Read every state document, carrying over anything a previous build left in
 * this browser. A carried value is written to the host and then dropped from
 * the browser, which is where it stops being the store.
 */
async function openState(): Promise<Record<string, unknown>> {
  const state: Record<string, unknown> = {}
  try {
    const response = await fetch(STATE_ROUTE)
    if (response.ok) Object.assign(state, (await response.json()) as object)
  } catch {
    /* No host behind this origin: the kernel runs on its own defaults. */
  }
  for (const held of BROWSER_HELD_STATE) {
    const raw = window.localStorage.getItem(held.key)
    if (raw === null) continue
    if (state[held.document] !== undefined) {
      /* The host already owns this document, so the browser copy is stale. */
      window.localStorage.removeItem(held.key)
      continue
    }
    try {
      state[held.document] = held.decode(raw)
    } catch {
      /* A value this build cannot read is left behind, not guessed at. */
      continue
    }
    void storeDocument(held.document, state[held.document]).then((stored) => {
      if (stored) window.localStorage.removeItem(held.key)
    })
  }
  return state
}

/** Whether a host answers for the skill library; absence keeps the sample data. */
async function skillStoreAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${SKILLS_ENDPOINT}?limit=0`, { method: "GET" })
    return response.ok
  } catch {
    /* No host behind this origin: the plugin runs on its bundled data. */
    return false
  }
}

/**
 * Every plugin installed under `<home>/plugins`. One that cannot be loaded is
 * reported to the console and left out, so a broken download never keeps the
 * hub from starting.
 */
async function installedPlugins() {
  try {
    const found = await discoverPlugins({
      source: createRemotePluginSource(),
      /* The host serves the file; this import is the one the kernel cannot make itself. */
      importModule: async (url) => import(/* @vite-ignore */ url) as Promise<unknown>,
    })
    const extensions = []
    for (const plugin of found) {
      if (plugin.definition === undefined) {
        console.warn(`context hub: plugin "${plugin.id}" was not loaded: ${plugin.problem}`)
        continue
      }
      extensions.push(plugin.definition)
    }
    return extensions
  } catch {
    /* No host behind this origin: the hub runs on the extensions this build ships. */
    return []
  }
}

/** Compose and activate the kernel; the app renders once this settles. */
export async function startHub(): Promise<HubKernel> {
  const state = await openState()
  const storage: StoragePort = {
    read: (key) => state[key] ?? null,
    write: (key, value) => {
      state[key] = value
      void storeDocument(key, value)
    },
  }
  const webHost: PlatformHost = {
    form: "Web",
    capabilities: { code: true, filesystem: false, network: true },
    storage,
    net: createRemoteNet(),
    log: (level, message) => {
      console[level](message)
    },
  }
  const services: Record<string, unknown> = { "hub.ui": ui }
  if (await skillStoreAvailable()) {
    services["hub.skills"] = createRemoteSkillStore()
  }
  const workspaces = createRemoteWorkspaceService()
  services["hub.workspaces"] = workspaces
  void workspaces.refresh()
  const kernel = await createHubKernel({
    host: webHost,
    services,
    extensions: [
      ...builtinExtensions,
      skillsExtension,
      skillsShExtension,
      simplifiedChineseLocale,
      ...(await installedPlugins()),
    ],
  })
  await kernel.start()
  return kernel
}
