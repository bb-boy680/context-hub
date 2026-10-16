/**
 * The tools an installer is handed, over whatever channel the form provides.
 *
 * An installer never touches a disk or a process: it names the program and its
 * arguments, and this side carries that to the host. A browser form talks to the
 * dev bridge or the host's own server; a desktop form swaps this for one that
 * calls its main process.
 */
import { PLUGIN_ROUTE, type PackDescription } from "./contract.ts"
import { PluginInstallError, type PluginBridgeTools } from "./provider.ts"

/** The route the plugin library answers on. */
const ENDPOINT = PLUGIN_ROUTE

/** What one call to the bridge returns when it refuses. */
interface ErrorBody {
  error?: string
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const detail = (await response.json().catch(() => ({}))) as ErrorBody
    throw new PluginInstallError(detail.error ?? `${String(response.status)} ${response.statusText}`)
  }
  return (await response.json()) as T
}

/** Build the tools that reach the host, which owns the library and the programs. */
export function createRemotePluginTools(): PluginBridgeTools {
  return {
    async root() {
      const answer = await call<{ root: string }>({ action: "root" })
      return answer.root
    },

    async syncMarketplace() {
      await call({ action: "sync-marketplace" })
    },

    async run(program, args) {
      const answer = await call<{ output: string }>({
        action: "program",
        program,
        args: [...args],
      })
      return answer.output
    },

    async has(program) {
      const answer = await call<{ present: boolean }>({ action: "program-exists", program })
      return answer.present
    },

    async describe(directory, name) {
      return call<PackDescription>({ action: "describe", path: directory, name })
    },
  }
}
