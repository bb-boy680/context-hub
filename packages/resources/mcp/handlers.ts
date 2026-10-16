/**
 * The MCP module's host half, as one request handler.
 *
 * A probe starts child processes and reaches the network, and the records file
 * lives under the hub home, so both belong to the process that owns the
 * machine — whichever carrier is running. This is not a Vite plugin: the carrier
 * mounts it (the dev server, the built form's own server, a desktop child
 * process), and `createHubServer` is what a non-dev form mounts it on.
 */
import {
  readBody,
  sendError,
  sendJson,
  type HubMiddleware,
} from "@context-hub/core/host/http"
import { hostFolder } from "@context-hub/core/host/fs-browse"
import { resolveHubHome } from "@context-hub/core/host/home"
import { createFsWorkspaceStore } from "@context-hub/core/host/workspaces"

import { cacheEntryOf, createProbeCache } from "./src/host/cache.ts"
import { probeDeclaration } from "./src/host/probe.ts"
import { createRecordStore } from "./src/host/records.ts"
import { MCP_ROUTE, readMcpCall, readMcpQuery } from "./src/probe.ts"

/** The handler that serves MCP probes and their cache. */
export function createMcpHandler(options: { home?: string } = {}): HubMiddleware {
  const home = resolveHubHome(options.home)
  const cache = createProbeCache({ home })
  const records = createRecordStore({ home })
  let store: ReturnType<typeof createFsWorkspaceStore> | null = null

  /**
   * The folder a stdio server starts in: the workspace in use, else the
   * folder this host runs in. An agent starts a project's servers there, so a
   * probe that starts somewhere else would answer about another project.
   */
  const startFolder = async (): Promise<string> => {
    store ??= createFsWorkspaceStore(home, { folder: await hostFolder() })
    const page = await store.page()
    const current = page.folders.find((folder) => folder.id === page.current)
    return current?.path ?? (await hostFolder())
  }

  return async (request, response, next) => {
    const url = new URL(request.url ?? "/", "http://localhost")
    if (url.pathname !== MCP_ROUTE) {
      next()
      return
    }
    const method = request.method ?? "GET"

    try {
      /* GET /hub/mcp — a read names its action in the query, and no action at
         all is the bare question the page asks before offering probes. It
         answers that one without reading anything, because a records file that
         cannot be read is not the same as no host answering. */
      if (method === "GET") {
        const read = readMcpQuery(url.searchParams)
        if (read === null) {
          sendJson(response, 200, { ok: true })
          return
        }
        if (read.action === "records") {
          sendJson(response, 200, { value: await records.read(), file: records.file })
          return
        }
        /* An answer is asked for by name; nothing else decides whether it is there. */
        sendJson(response, 200, { entries: await cache.compare(read.names) })
        return
      }

      if (method !== "POST") {
        sendError(response, new Error(`unsupported method ${method}`), 405)
        return
      }

      const body = JSON.parse((await readBody(request)).toString("utf8")) as unknown
      const call = readMcpCall(body)

      if (call.action === "save-records") {
        await records.save(call.records)
        sendJson(response, 200, { ok: true })
        return
      }

      /* The folder a stdio server starts in is what a probe itself needs. */
      const cwd = await startFolder()
      const report = await probeDeclaration({
        declaration: call.declaration,
        cwd,
        ...(call.timeoutMs === undefined ? {} : { timeoutMs: call.timeoutMs }),
      })
      const entry = cacheEntryOf(
        { declaration: call.declaration, scope: call.scope },
        report,
        Date.now()
      )
      /* A tryout from the add dialog carries no name and leaves no trace. */
      if (call.save !== false && call.name !== undefined) {
        await cache.record(call.name, entry, call.names ?? [call.name])
      }
      sendJson(response, 200, { entry })
    } catch (error) {
      sendError(response, error)
    }
  }
}
