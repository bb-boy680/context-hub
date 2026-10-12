/**
 * Development bridge for MCP probes. A probe starts child processes and
 * reaches the network, so it belongs to the process that owns the machine —
 * here the dev server, the same way the skill library does. The cache lives
 * under the hub home, so the browser form and a product host keep one cache.
 *
 * Product forms mount the same modules themselves; nothing here is a service
 * the app depends on.
 */
import type { IncomingMessage, ServerResponse } from "node:http"

import { hostFolder } from "@workspace/core/host/fs-browse"
import { resolveHubHome } from "@workspace/core/host/home"
import { createFsWorkspaceStore } from "@workspace/core/host/workspaces"

import type { AssetScope } from "@workspace/core/place-files"

import type { McpDeclaration } from "./src/declaration.ts"
import { cacheEntryOf, createProbeCache } from "./src/host/cache.ts"
import { probeDeclaration } from "./src/host/probe.ts"
import { MCP_ROUTE, readMcpCall } from "./src/probe.ts"

/** Read a whole request body into one buffer. */
async function readBody(request: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

function sendJson(response: ServerResponse, status: number, value: unknown) {
  const body = JSON.stringify(value)
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  })
  response.end(body)
}

function sendError(response: ServerResponse, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  sendJson(response, 400, { error: message })
}

/** Vite plugin that serves MCP probes and their cache over the dev server. */
export function mcpProbe(options: { home?: string } = {}) {
  const home = resolveHubHome(options.home)
  const cache = createProbeCache({ home })
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

  return {
    name: "context-hub-mcp-probe",
    configureServer(server: {
      middlewares: { use: (handler: unknown) => void }
    }) {
      server.middlewares.use(
        async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
          const url = new URL(request.url ?? "/", "http://localhost")
          if (url.pathname !== MCP_ROUTE) {
            next()
            return
          }
          /* The browser asks whether a host answers before it offers probes. */
          if (request.method === "GET") {
            sendJson(response, 200, { ok: true })
            return
          }
          if (request.method !== "POST") {
            response.statusCode = 405
            response.end()
            return
          }

          try {
            const body = JSON.parse((await readBody(request)).toString("utf8")) as unknown
            const call = readMcpCall(body)
            const cwd = await startFolder()
            const subjectOf = (query: { declaration: McpDeclaration; scope: AssetScope }) => ({
              declaration: query.declaration,
              scope: query.scope,
              cwd,
            })

            if (call.action === "cache") {
              const targets = call.servers.map((query) => ({ name: query.name, ...subjectOf(query) }))
              sendJson(response, 200, { entries: await cache.compare(targets) })
              return
            }

            const report = await probeDeclaration({
              declaration: call.declaration,
              cwd,
              ...(call.timeoutMs === undefined ? {} : { timeoutMs: call.timeoutMs }),
            })
            const entry = cacheEntryOf(subjectOf(call), report, Date.now())
            /* A tryout from the add dialog carries no name and leaves no trace. */
            if (call.save !== false && call.name !== undefined) {
              await cache.record(call.name, entry, call.names ?? [call.name])
            }
            sendJson(response, 200, { entry })
          } catch (error) {
            sendError(response, error)
          }
        }
      )
    },
  }
}
