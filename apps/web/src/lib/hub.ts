/**
 * Web form of the kernel: the host is the hub's own directory, reached over the
 * dev server. Everything the kernel remembers is read from there before it
 * starts and written back on every change, so nothing depends on this browser
 * profile. The browser cannot read the skill library or the installed plugins
 * itself, so `startHub` offers those only when a host answers for them; without
 * a host the skills page has no catalog and says so.
 */
import { claudeCodeExtension } from "@context-hub/claude-code"
import { STATE_ROUTE } from "@context-hub/core/state"
import { createRemoteNet } from "@context-hub/core/net"
import {
  builtinExtensions,
  createHubKernel,
  createRemotePluginSource,
  discoverPlugins,
  type HubKernel,
  type PlatformHost,
  type StoragePort,
} from "@context-hub/extensions"
import { simplifiedChineseLocale } from "@context-hub/zh-cn"
import { mcpExtension } from "@context-hub/mcp"
import { pluginsExtension } from "@context-hub/plugins"
import { PROMPT_ROUTE, createRemotePromptStore, promptsExtension } from "@context-hub/prompts"
import { SKILL_ROUTE, createRemoteSkillStore, skillsExtension } from "@context-hub/skills"
import { skillsShExtension } from "@context-hub/skills-sh"
import { variablesExtension } from "@context-hub/variables"
import * as ui from "./ui-kit.ts"
import { createRemotePlaceFiles, placeFilesAvailable } from "./place-files.ts"
import { preloadCatalogs } from "./preload.ts"
import { createRemoteWorkspaceService } from "./workspaces.ts"

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

/** Whether a host answers for the skill library; without one the page has none. */
async function skillStoreAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${SKILL_ROUTE}?limit=0`, { method: "GET" })
    return response.ok
  } catch {
    /* No host behind this origin: the plugin offers no library. */
    return false
  }
}

/** The same question for the prompt library, asked at its own route. */
async function promptStoreAvailable(): Promise<boolean> {
  try {
    const response = await fetch(PROMPT_ROUTE, { method: "GET" })
    return response.ok
  } catch {
    /* No host behind this origin: the page says it has no library. */
    return false
  }
}

/**
 * Every extension installed under `<home>/extensions`. One that cannot be loaded
 * is reported to the console and left out, so a broken download never keeps the
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
      if (plugin.module === undefined) {
        console.warn(`context hub: plugin "${plugin.id}" was not loaded: ${plugin.problem}`)
        continue
      }
      extensions.push(plugin.module)
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
    files: (await placeFilesAvailable()) ? createRemotePlaceFiles() : null,
    log: (level, message) => {
      console[level](message)
    },
  }
  const services: Record<string, unknown> = { "hub.ui": ui }
  if (await promptStoreAvailable()) {
    services["hub.prompts"] = createRemotePromptStore(PROMPT_ROUTE)
  }
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
      promptsExtension,
      mcpExtension,
      pluginsExtension,
      variablesExtension,
      /* Only the agent integrations this build is being tried against. The
         others are still written and still shipped; they are left out here so
         the page's module graph is small enough to boot quickly while the
         carrier is worked on. Add them back to the list to bring them in. */
      claudeCodeExtension,
      skillsShExtension,
      simplifiedChineseLocale,
      ...(await installedPlugins()),
    ],
  })
  await kernel.start()
  /* Every shared read, started now rather than when a page that needs it is
     opened. Not awaited: rendering waits for the kernel, not for the libraries
     — a page draws what it has until an answer lands. */
  void preloadCatalogs(kernel)
  return kernel
}
