/**
 * Web form of the kernel: a localStorage-backed host whose capabilities match
 * what a plain browser can do. The browser cannot read the skill library
 * itself, so `startHub` offers the store only when a host answers for it; the
 * skills plugin falls back to its sample data when nobody does.
 */
import {
  builtinExtensions,
  createHubKernel,
  type HubKernel,
  type PlatformHost,
} from "@workspace/extensions"
import { simplifiedChineseLocale } from "@workspace/locale-zh-cn"
import { createRemoteSkillStore, skillsExtension } from "@workspace/plugin-skills"

/** Path the active form serves the skill library on, when it serves one at all. */
const SKILLS_ENDPOINT = "/hub/skills"

const webHost: PlatformHost = {
  form: "Web",
  capabilities: { code: true, filesystem: false, network: true },
  storage: {
    read: (key) => window.localStorage.getItem(key),
    write: (key, value) => window.localStorage.setItem(key, value),
  },
  log: (level, message) => {
    console[level](message)
  },
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

/** Compose and activate the kernel; the app renders once this settles. */
export async function startHub(): Promise<HubKernel> {
  const services: Record<string, unknown> = {}
  if (await skillStoreAvailable()) {
    services["hub.skills"] = createRemoteSkillStore()
  }
  const kernel = await createHubKernel({
    host: webHost,
    services,
    extensions: [...builtinExtensions, skillsExtension, simplifiedChineseLocale],
  })
  await kernel.start()
  return kernel
}
