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
import { NET_ROUTE } from "./src/net.ts"
import { PLUGIN_ROUTE } from "./src/plugins.ts"
import { STATE_ROUTE } from "./src/state.ts"
import { WORKSPACE_ROUTE } from "./src/workspace.ts"
import { resolveStoredFile } from "./src/host/assets-fs.ts"
import { hostFolder } from "./src/host/fs-browse.ts"
import { resolveHubHome } from "./src/host/home.ts"
import { createFsPluginStore } from "./src/host/plugins-fs.ts"
import { createFsStateStore } from "./src/host/state-fs.ts"
import { createFsWorkspaceStore } from "./src/host/workspaces-fs.ts"
import type { StateStore } from "./src/state.ts"
import type { NetReply, NetRequest } from "./src/net.ts"
import type { WorkspaceStore } from "./src/workspace.ts"

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
 * Vite plugin that performs one extension's HTTP request. A browser page
 * cannot read a cross-origin API that serves no CORS header, so this route is
 * how a plugin reaches one: the dev server holds the connection.
 *
 * It is deliberately narrow, because a route that fetches whatever it is told
 * is a request forgery waiting to happen: HTTPS only, a public host (never a
 * loopback, private, or link-local address), no redirects to follow, one GET,
 * a timeout, and a cap on the body it will read.
 */
export function netProxy() {
  return {
    name: "context-hub-net-proxy",
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
          if (!url.pathname.startsWith(NET_ROUTE)) {
            next()
            return
          }
          if ((request.method ?? "GET") !== "POST") {
            response.writeHead(405).end()
            return
          }
          let asked: NetRequest
          try {
            asked = JSON.parse((await readBody(request)).toString("utf8")) as NetRequest
          } catch {
            sendJson(response, 400, { error: "net: the request body is not JSON" })
            return
          }
          try {
            sendJson(response, 200, await fetchThroughProxy(asked))
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            sendJson(response, 400, { error: message })
          }
        }
      )
    },
  }
}

/** Longest an upstream request may take before it is abandoned. */
const NET_TIMEOUT_MS = 10_000

/** Most body bytes this route will read from an upstream response. */
const NET_MAX_BYTES = 4 * 1024 * 1024

/** Hosts a request from a plugin never reaches: this machine and its neighbours. */
function isPublicHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase()
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false
  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return false
  const parts = host.split(".")
  if (parts.length === 4 && parts.every((part) => /^\d+$/.test(part))) {
    const [a, b] = parts.map(Number)
    if (a === 10 || a === 127 || a === 0) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 192 && b === 168) return false
    if (a === 169 && b === 254) return false
    return true
  }
  /* A name with no dot resolves through search domains; refuse it rather than guess. */
  return parts.length > 1
}

/** Read one upstream response, refusing anything the rules above exclude. */
async function fetchThroughProxy(asked: NetRequest): Promise<NetReply> {
  if (typeof asked.url !== "string" || asked.url === "") {
    throw new Error("net: the request needs a url")
  }
  let target: URL
  try {
    target = new URL(asked.url)
  } catch {
    throw new Error(`net: not a URL: ${asked.url}`)
  }
  if (target.protocol !== "https:") {
    throw new Error("net: only https URLs are fetched")
  }
  if (!isPublicHost(target.hostname)) {
    throw new Error(`net: refusing to fetch ${target.hostname}`)
  }
  const upstream = await fetch(target, {
    method: "GET",
    /* A redirect could point anywhere, including back at this machine. */
    redirect: "manual",
    headers: { Accept: "*/*", ...asked.headers },
    signal: AbortSignal.timeout(NET_TIMEOUT_MS),
  })
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of upstream.body ?? []) {
    const bytes = chunk as Buffer
    size += bytes.byteLength
    if (size > NET_MAX_BYTES) throw new Error("net: the response is larger than this route reads")
    chunks.push(bytes)
  }
  return { status: upstream.status, body: Buffer.concat(chunks).toString("utf8") }
}

/**
 * Vite plugin that keeps the workspace list over the dev server. The form
 * reports the folder the person picked through the system's own dialog — its
 * name, since a page is told nothing else — and this keeps it; a product form
 * mounts the same store itself.
 */
export function workspaceList(options: { home?: string; folder?: string } = {}) {
  let ready: Promise<WorkspaceStore> | null = null

  const getStore = async (): Promise<WorkspaceStore> => {
    ready ??= (async () => {
      /* This host's own folder is a workspace by default, with no picking. */
      const folder = options.folder ?? (await hostFolder())
      return createFsWorkspaceStore(resolveHubHome(options.home), { folder })
    })()
    return ready
  }

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
            const store = await getStore()
            if (action === "" && method === "GET") {
              sendJson(response, 200, await store.page())
              return
            }
            if (action === "add" && method === "POST") {
              const body = JSON.parse((await readBody(request)).toString("utf8")) as { path?: unknown }
              if (typeof body.path !== "string" || body.path === "") {
                sendJson(response, 400, { error: "add needs the folder's path" })
                return
              }
              sendJson(response, 200, await store.add(body.path))
              return
            }
            if (action === "select" && method === "POST") {
              const body = JSON.parse((await readBody(request)).toString("utf8")) as { id?: unknown }
              if (typeof body.id !== "string" || body.id === "") {
                sendJson(response, 400, { error: "select needs a workspace id" })
                return
              }
              sendJson(response, 200, await store.select(body.id))
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
