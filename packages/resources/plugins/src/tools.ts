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

/**
 * One call to this route, answered as JSON.
 *
 * @param url — the whole address, query and all.
 * @param init — what the call is; the method is what says read or write.
 * @throws {PluginInstallError} when the host refused it, with the reason it gave.
 */
async function ask<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) {
    /* The route refuses with `{ error }`, and that sentence is the only one
       that says what went wrong; the status alone reads as a transport fault. */
    const detail = (await response.json().catch(() => ({}))) as ErrorBody
    throw new PluginInstallError(detail.error ?? `${String(response.status)} ${response.statusText}`)
  }
  return (await response.json()) as T
}

/** One read, named by its action in the query. */
function callGet<T>(base: string, query: string): Promise<T> {
  return ask<T>(`${base}${ENDPOINT}${query}`, { method: "GET" })
}

/** One write, named by its action in the body. */
function call<T>(base: string, body: Record<string, unknown>): Promise<T> {
  return ask<T>(`${base}${ENDPOINT}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

/**
 * Build the tools that reach the host, which owns the library and the programs.
 *
 * @param base — the origin the route is reached on; empty means this one.
 */
export function createRemotePluginTools(base = ""): PluginBridgeTools {
  return {
    async root() {
      const answer = await callGet<{ root: string }>(base, "?action=root")
      return answer.root
    },

    async syncMarketplace() {
      await call(base, { action: "sync-marketplace" })
    },

    async run(program, args) {
      const answer = await call<{ output: string }>(base, {
        action: "program",
        program,
        args: [...args],
      })
      return answer.output
    },

    async has(program) {
      const answer = await callGet<{ present: boolean }>(
        base,
        `?action=program-exists&program=${encodeURIComponent(program)}`
      )
      return answer.present
    },

    async describe(directory, name) {
      return call<PackDescription>(base, { action: "describe", path: directory, name })
    },
  }
}
