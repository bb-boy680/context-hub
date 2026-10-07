/**
 * Web form of the kernel: a localStorage-backed host whose capabilities match
 * what a plain browser can do. Write plans cannot reach agent directories
 * here, so the agent target extensions report that gap instead of pretending
 * to inject.
 */
import {
  builtinExtensions,
  createHubKernel,
  type HubKernel,
  type PlatformHost,
} from "@workspace/extensions"
import { simplifiedChineseLocale } from "@workspace/locale-zh-cn"
import { skillsExtension } from "@workspace/plugin-skills"

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

/** Compose and activate the kernel; the app renders once this settles. */
export async function startHub(): Promise<HubKernel> {
  const kernel = await createHubKernel({
    host: webHost,
    extensions: [...builtinExtensions, skillsExtension, simplifiedChineseLocale],
  })
  await kernel.start()
  return kernel
}
