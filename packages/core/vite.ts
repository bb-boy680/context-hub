/**
 * Development bridge for the hub's own directory: it serves the files the hub
 * owns and keeps its state documents, so the browser form works against real
 * files during development. Product forms mount the same stores themselves, so
 * nothing here is a service the app depends on.
 *
 * Assets are read-only: files are created and deleted through the store that
 * records them, which is what keeps a reference and its file in step. State
 * documents are read and written, because they are what a browser form cannot
 * keep anywhere else. Plugin files are read-only for the same reason assets
 * are: installing is a host-side operation that writes the whole directory.
 */
import { createReadStream, promises as fs } from "node:fs"
import type { IncomingMessage, ServerResponse } from "node:http"

import { ASSET_ROUTE } from "./src/assets.ts"
import { PLUGIN_ROUTE } from "./src/plugins.ts"
import { STATE_ROUTE } from "./src/state.ts"
import { WORKSPACE_ROUTE } from "./src/workspace.ts"
import { resolveStoredFile } from "./src/host/assets-fs.ts"
import { resolveHubHome } from "./src/host/home.ts"
import { createFsPluginStore } from "./src/host/plugins-fs.ts"
import { createFsStateStore } from "./src/host/state-fs.ts"
import { createFsWorkspaceStore } from "./src/host/workspaces-fs.ts"
import type { StateStore } from "./src/state.ts"

/** One `Content-Type` for a stored file, from its extension. */
const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  js: "text/javascript",
  mjs: "text/javascript",
  css: "text/css",
  json: "application/json",
  map: "application/json",
}

function contentTypeOf(file: string): string {
  const extension = file.slice(file.lastIndexOf(".") + 1).toLowerCase()
  return MIME_TYPES[extension] ?? "application/octet-stream"
}

/** Serve one file, honouring `Range` so media players can seek. */
async function sendFile(
  home: string,
  relative: string,
  range: string | undefined,
  response: ServerResponse
): Promise<void> {
  const target = resolveStoredFile(home, relative)
  const stat = await fs.stat(target).catch(() => null)
  if (stat === null || !stat.isFile()) {
    response.writeHead(404).end()
    return
  }
  const type = contentTypeOf(target)
  const start = range === undefined ? 0 : Number(/bytes=(\d+)-/.exec(range)?.[1] ?? 0)
  if (start > 0) {
    if (start >= stat.size) {
      response
        .writeHead(416, { "Content-Range": `bytes */${stat.size}` })
        .end()
      return
    }
    response.writeHead(206, {
      "Content-Type": type,
      "Content-Range": `bytes ${start}-${stat.size - 1}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": stat.size - start,
    })
    createReadStream(target, { start }).pipe(response)
    return
  }
  response.writeHead(200, {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Content-Length": stat.size,
    "Cache-Control": "no-cache",
  })
  createReadStream(target).pipe(response)
}

/** Vite plugin that serves the hub's stored assets over the dev server. */
export function assetLibrary(options: { home?: string } = {}) {
  const home = resolveHubHome(options.home)

  return {
    name: "context-hub-asset-library",
    configureServer(server: {
      middlewares: { use: (handler: unknown) => void }
    }) {
      server.middlewares.use(
        async (
          request: IncomingMessage,
          response: ServerResponse,
          next: () => void
        ) => {
          const url = new URL(request.url ?? "/", "http://localhost")
          if (!url.pathname.startsWith(`${ASSET_ROUTE}/`)) {
            next()
            return
          }
          if ((request.method ?? "GET") !== "GET") {
            response.writeHead(405).end()
            return
          }
          const relative = decodeURIComponent(
            url.pathname.slice(ASSET_ROUTE.length + 1)
          )
          try {
            await sendFile(home, relative, request.headers.range, response)
          } catch {
            response.writeHead(404).end()
          }
        }
      )
    },
  }
}

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
    /* A stale manifest would describe a plugin whose files just changed. */
    "Cache-Control": "no-store",
  })
  response.end(body)
}

/** Every stored document, keyed by name; a file that is not JSON is reported and skipped. */
async function readDocuments(
  store: StateStore,
  warn: (message: string) => void
): Promise<Record<string, unknown>> {
  const documents: Record<string, unknown> = {}
  for (const name of await store.names()) {
    try {
      documents[name] = await store.read(name)
    } catch (error) {
      warn(`context hub: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return documents
}

/** Vite plugin that keeps the hub's state documents over the dev server. */
export function stateStore(options: { home?: string } = {}) {
  const store = createFsStateStore(resolveHubHome(options.home))

  return {
    name: "context-hub-state-store",
    configureServer(server: {
      middlewares: { use: (handler: unknown) => void }
      config: { logger: { warn: (message: string) => void } }
    }) {
      server.middlewares.use(
        async (
          request: IncomingMessage,
          response: ServerResponse,
          next: () => void
        ) => {
          const url = new URL(request.url ?? "/", "http://localhost")
          if (!url.pathname.startsWith(STATE_ROUTE)) {
            next()
            return
          }
          const name = url.pathname.slice(STATE_ROUTE.length).replace(/^\//, "")
          const method = request.method ?? "GET"
          try {
            if (name === "" && method === "GET") {
              sendJson(response, 200, await readDocuments(store, server.config.logger.warn))
              return
            }
            if (name !== "" && method === "PUT") {
              const body = (await readBody(request)).toString("utf8")
              await store.write(decodeURIComponent(name), JSON.parse(body) as unknown)
              sendJson(response, 200, { ok: true })
              return
            }
            response.writeHead(405).end()
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            sendJson(response, 400, { error: message })
          }
        }
      )
    },
  }
}

/**
 * Send one file from the plugin space. Every response is `no-store`: an
 * installed plugin's files change on update, and a cached module would run the
 * old code in the page.
 */
async function sendPluginFile(
  root: string,
  id: string,
  file: string,
  response: ServerResponse
): Promise<void> {
  const target = resolveStoredFile(root, `${id}/${file}`)
  const stat = await fs.stat(target).catch(() => null)
  if (stat === null || !stat.isFile()) {
    response.writeHead(404).end()
    return
  }
  response.writeHead(200, {
    "Content-Type": contentTypeOf(target),
    "Content-Length": stat.size,
    "Cache-Control": "no-store",
  })
  createReadStream(target).pipe(response)
}

/**
 * Vite plugin that serves the plugin space over the dev server: the installed
 * ids, and every file inside a plugin directory, so a browser form can import
 * an installed plugin's entry module.
 */
export function pluginFiles(options: { home?: string } = {}) {
  const store = createFsPluginStore(resolveHubHome(options.home))

  return {
    name: "context-hub-plugin-files",
    configureServer(server: {
      middlewares: { use: (handler: unknown) => void }
    }) {
      server.middlewares.use(
        async (
          request: IncomingMessage,
          response: ServerResponse,
          next: () => void
        ) => {
          const url = new URL(request.url ?? "/", "http://localhost")
          if (!url.pathname.startsWith(PLUGIN_ROUTE)) {
            next()
            return
          }
          if ((request.method ?? "GET") !== "GET") {
            response.writeHead(405).end()
            return
          }
          const rest = url.pathname.slice(PLUGIN_ROUTE.length).replace(/^\//, "")
          try {
            if (rest === "") {
              sendJson(response, 200, { ids: await store.list() })
              return
            }
            const slash = rest.indexOf("/")
            const id = decodeURIComponent(slash === -1 ? rest : rest.slice(0, slash))
            if (slash === -1) {
              sendJson(response, 200, JSON.parse(await store.read(id, "plugin.json")) as unknown)
              return
            }
            await sendPluginFile(store.root, id, rest.slice(slash + 1), response)
          } catch {
            response.writeHead(404).end()
          }
        }
      )
    },
  }
}

/**
 * Vite plugin that keeps the workspace list over the dev server. Picking opens
 * a folder dialog on this machine and holds the request for as long as the
 * dialog is up, so the browser form shows the folder only once somebody chose
 * one. A product form mounts the same store itself.
 */
export function workspaceList(options: { home?: string } = {}) {
  const store = createFsWorkspaceStore(resolveHubHome(options.home))

  return {
    name: "context-hub-workspace-list",
    configureServer(server: {
      middlewares: { use: (handler: unknown) => void }
    }) {
      server.middlewares.use(
        async (
          request: IncomingMessage,
          response: ServerResponse,
          next: () => void
        ) => {
          const url = new URL(request.url ?? "/", "http://localhost")
          if (!url.pathname.startsWith(WORKSPACE_ROUTE)) {
            next()
            return
          }
          const action = url.pathname.slice(WORKSPACE_ROUTE.length).replace(/^\//, "")
          const method = request.method ?? "GET"
          try {
            if (action === "" && method === "GET") {
              sendJson(response, 200, await store.page())
              return
            }
            if (action === "select" && method === "POST") {
              const body = JSON.parse((await readBody(request)).toString("utf8")) as { path?: unknown }
              if (typeof body.path !== "string") {
                sendJson(response, 400, { error: "select needs a folder path" })
                return
              }
              sendJson(response, 200, await store.select(body.path))
              return
            }
            if (action === "pick" && method === "POST") {
              const body = JSON.parse((await readBody(request)).toString("utf8")) as { prompt?: unknown }
              if (typeof body.prompt !== "string" || body.prompt === "") {
                sendJson(response, 400, { error: "pick needs the dialog prompt" })
                return
              }
              sendJson(response, 200, await store.pick(body.prompt))
              return
            }
            response.writeHead(405).end()
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            sendJson(response, 400, { error: message })
          }
        }
      )
    },
  }
}
