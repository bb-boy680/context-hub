/**
 * The hub's own bridges, as request handlers: they serve the files the hub owns
 * and keep its state documents, so a form reaches them however it is carried.
 *
 * These are not Vite plugins. A carrier mounts them — the dev server, the built
 * form's own server through `createHubServer`, a desktop child process — and
 * each is a plain `node:http` handler, so the same ones run everywhere.
 *
 * Assets are read-only: files are created and deleted through the store that
 * records them, which is what keeps a reference and its file in step. State
 * documents are read and written, because they are what a browser form cannot
 * keep anywhere else. Extension files are read-only for the same reason assets
 * are: installing is a host-side operation that writes the whole directory.
 */
import { createReadStream, promises as fs } from "node:fs"
import type { ServerResponse } from "node:http"
import path from "node:path"

import { ASSET_ROUTE } from "./src/assets.ts"
import { ABOUT_ROUTE } from "./src/about.ts"
import { NET_ROUTE } from "./src/net.ts"
import { PLACE_FILES_ROUTE, readPlaceCall } from "./src/place-files.ts"
import { parsePluginManifestYaml } from "./src/extension-manifest.ts"
import { runtimeSource } from "./src/host/extension-runtime.ts"
import {
  EXTENSION_MARKET_ROUTE,
  EXTENSION_ROUTE,
  EXTENSION_RUNTIME_DIR,
  PLUGIN_MANIFEST,
  assertPluginId,
} from "./src/plugins.ts"
import { STATE_ROUTE } from "./src/state.ts"
import { WORKSPACE_ROUTE } from "./src/workspace.ts"
import { resolveStoredFile } from "./src/host/assets-fs.ts"
import { hostFolder } from "./src/host/fs-browse.ts"
import { displayPath, resolveHubHome } from "./src/host/home.ts"
import { isPublicHostname } from "./src/host/remote-image.ts"
import {
  contentTypeOf,
  readBody,
  readJson,
  sendError,
  sendJson,
  type HubMiddleware,
} from "./src/host/http.ts"
import {
  cacheMarketIndex,
  createMarketReader,
  installExtensionFromMarket,
  removeInstalledExtension,
  type MarketReader,
} from "./src/host/extension-market.ts"
import { createFsPlaceFiles } from "./src/host/place-files.ts"
import { createFsPluginStore } from "./src/host/plugins-fs.ts"
import { createFsStateStore } from "./src/host/state-fs.ts"
import { createFsWorkspaceStore } from "./src/host/workspaces-fs.ts"
import type { StateStore } from "./src/state.ts"
import type { NetReply, NetRequest } from "./src/net.ts"
import type { WorkspaceStore } from "./src/workspace.ts"

/**
 * The path under one route, or null when this handler does not own the request.
 *
 * `""` is the route itself. Requiring the separator is what keeps a path that
 * merely starts with the same letters — `/hub/workspacesX` — from being read as
 * this route carrying an id of `X`.
 */
function under(route: string, pathname: string): string | null {
  if (pathname === route) return ""
  if (!pathname.startsWith(`${route}/`)) return null
  return pathname.slice(route.length + 1)
}

/** A field a body carries, refused when it is missing or not a string. */
function required(value: unknown, said: string): string {
  if (typeof value !== "string" || value === "") throw new Error(said)
  return value
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
    sendError(response, new Error("no such file"), 404)
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

/** Serves the hub's stored assets. */
export function createAssetHandler(options: { home?: string } = {}): HubMiddleware {
  const home = resolveHubHome(options.home)

  return async (request, response, next) => {
    const url = new URL(request.url ?? "/", "http://localhost")
    if (!url.pathname.startsWith(`${ASSET_ROUTE}/`)) {
      next()
      return
    }
    if ((request.method ?? "GET") !== "GET") {
      sendError(response, new Error(`unsupported method ${request.method ?? "GET"}`), 405)
      return
    }
    const relative = decodeURIComponent(
      url.pathname.slice(ASSET_ROUTE.length + 1)
    )
    try {
      await sendFile(home, relative, request.headers.range, response)
    } catch {
      sendError(response, new Error("no such file"), 404)
    }
  }
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

/** Keeps the hub's state documents. */
export function createStateHandler(
  options: { home?: string; log?: (message: string) => void } = {}
): HubMiddleware {
  const store = createFsStateStore(resolveHubHome(options.home))
  /* A malformed document is skipped rather than failing the read, so it has to
     be said somewhere; the carrier decides where that is. */
  const warn = options.log ?? ((message: string) => console.warn(message))

  return async (request, response, next) => {
    const url = new URL(request.url ?? "/", "http://localhost")
    const name = under(STATE_ROUTE, url.pathname)
    if (name === null) {
      next()
      return
    }
    const method = request.method ?? "GET"
    try {
      if (name === "" && method === "GET") {
        sendJson(response, 200, await readDocuments(store, warn))
        return
      }
      if (name !== "" && method === "PUT") {
        const body = (await readBody(request)).toString("utf8")
        await store.write(decodeURIComponent(name), JSON.parse(body) as unknown)
        sendJson(response, 200, { ok: true })
        return
      }
      sendError(response, new Error(`unsupported method ${method}`), 405)
    } catch (error) {
      sendError(response, error)
    }
  }
}

/** Says which build this is and where this machine keeps its files. */
export function createAboutHandler(options: {
  version: string
  home?: string
}): HubMiddleware {
  return async (request, response, next) => {
    const url = new URL(request.url ?? "/", "http://localhost")
    if (under(ABOUT_ROUTE, url.pathname) !== "") {
      next()
      return
    }
    if ((request.method ?? "GET") !== "GET") {
      sendError(response, new Error(`unsupported method ${request.method ?? "GET"}`), 405)
      return
    }
    sendJson(response, 200, {
      version: options.version,
      home: displayPath(resolveHubHome(options.home)),
    })
  }
}

/**
 * Reads and writes the client configuration files a hub
 * consumer names, so a browser form can reach the files its agent plugins own.
 * The workspace in use is the one the workspace list holds, so switching
 * workspace switches the files, and a product form mounts the same reader
 * itself.
 */
export function createPlaceFileHandler(options: { home?: string; folder?: string } = {}): HubMiddleware {
  const files = createFsPlaceFiles({
    ...(options.home === undefined ? {} : { home: options.home }),
    ...(options.folder === undefined ? {} : { folder: options.folder }),
  })

  return async (request, response, next) => {
    const url = new URL(request.url ?? "/", "http://localhost")
    /* One route, and the call names its own action in the body. */
    if (under(PLACE_FILES_ROUTE, url.pathname) !== "") {
      next()
      return
    }
    if ((request.method ?? "GET") !== "POST") {
      sendError(response, new Error(`unsupported method ${request.method ?? "GET"}`), 405)
      return
    }
    try {
      const call = readPlaceCall(JSON.parse((await readBody(request)).toString("utf8")))
      if (call.action === "workspace") {
        sendJson(response, 200, { workspace: await files.workspace() })
        return
      }
      if (call.ref === undefined) throw new Error("a call needs a place")
      if (call.action === "read") {
        sendJson(response, 200, { text: await files.read(call.ref) })
        return
      }
      if (call.action === "write") {
        await files.write(call.ref, call.text ?? "")
        sendJson(response, 200, { ok: true })
        return
      }
      await files.remove(call.ref)
      sendJson(response, 200, { ok: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      sendJson(response, 400, { error: message })
    }
  }
}

/**
/**
 * Send one file from the extension space. Every response is `no-store`: an
 * installed extension's files change on update, and a cached module would run
 * the old code in the page.
 */
async function sendExtensionFile(
  root: string,
  id: string,
  file: string,
  response: ServerResponse
): Promise<void> {
  const target = resolveStoredFile(path.join(root, id), file)
  const stat = await fs.stat(target).catch(() => null)
  if (stat === null || !stat.isFile()) {
    sendError(response, new Error("no such file"), 404)
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
 * Serves the extension space: the installed
 * ids, and every file inside an extension directory, so a browser form can import
 * an installed extension's entry module.
 */
export function createExtensionHandler(options: { home?: string } = {}): HubMiddleware {
  const store = createFsPluginStore(resolveHubHome(options.home))

  return async (request, response, next) => {
    const url = new URL(request.url ?? "/", "http://localhost")
    const rest = under(EXTENSION_ROUTE, url.pathname)
    if (rest === null) {
      next()
      return
    }
    if ((request.method ?? "GET") !== "GET") {
      sendError(response, new Error(`unsupported method ${request.method ?? "GET"}`), 405)
      return
    }
    try {
      if (rest === "") {
        sendJson(response, 200, { ids: await store.list() })
        return
      }
      /* `_runtime` is not a legal plugin id, so this branch cannot shadow one. */
      if (rest === EXTENSION_RUNTIME_DIR || rest.startsWith(`${EXTENSION_RUNTIME_DIR}/`)) {
        const name =
          rest === EXTENSION_RUNTIME_DIR
            ? ""
            : rest.slice(EXTENSION_RUNTIME_DIR.length + 1)
        const source = runtimeSource(name)
        if (source === undefined) {
          sendError(response, new Error("no such runtime file"), 404)
          return
        }
        response.writeHead(200, {
          "Content-Type": "text/javascript; charset=utf-8",
          "Cache-Control": "no-store",
        })
        response.end(source)
        return
      }
      const slash = rest.indexOf("/")
      const id = decodeURIComponent(slash === -1 ? rest : rest.slice(0, slash))
      assertPluginId(id)
      if (slash === -1) {
        sendJson(
          response,
          200,
          parsePluginManifestYaml(await store.read(id, PLUGIN_MANIFEST), id)
        )
        return
      }
      await sendExtensionFile(store.root, id, rest.slice(slash + 1), response)
    } catch {
      sendError(response, new Error("no such file"), 404)
    }
  }
}

/**
 * The extension market: read one configured index, install one listed version,
 * or remove one installed extension.
 *
 * The page sends the index URL and the plugin id and version. The handler reads
 * the index itself, so a page cannot point the installer at a source the index
 * did not publish.
 */
export function createExtensionMarketHandler(
  options: { home?: string; reader?: MarketReader; version?: string } = {}
): HubMiddleware {
  const home = resolveHubHome(options.home)
  const store = createFsPluginStore(home)
  const state = createFsStateStore(home)
  const reader = options.reader ?? createMarketReader()
  const hubVersion = options.version ?? "0.0.0"
  let tail: Promise<void> = Promise.resolve()

  const run = <T>(task: () => Promise<T>): Promise<T> => {
    const next = tail.then(task, task)
    tail = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  return async (request, response, next) => {
    const url = new URL(request.url ?? "/", "http://localhost")
    if (under(EXTENSION_MARKET_ROUTE, url.pathname) !== "") {
      next()
      return
    }
    if ((request.method ?? "GET") !== "POST") {
      sendError(response, new Error(`unsupported method ${request.method ?? "GET"}`), 405)
      return
    }
    try {
      const body = (await readJson(request)) as Record<string, unknown>
      const action = required(body.action, "missing action")
      if (action === "list") {
        const index = await reader.read(required(body.url, "missing url"), body.refresh === true)
        /* Keep the listing beside the installed extensions. Metadata only: the
           page can draw the market from this file, and install still clones. */
        await cacheMarketIndex(store.root, index).catch(() => undefined)
        sendJson(response, 200, { index })
        return
      }
      if (action === "install") {
        const source = required(body.url, "missing url")
        const id = required(body.id, "missing id")
        const version = required(body.version, "missing version")
        const result = await run(async () => {
          const index = await reader.read(source)
          const plugin = index.plugins.find((entry) => entry.id === id)
          if (plugin === undefined) throw new Error(`the market does not list "${id}"`)
          const chosen = plugin.versions.find((entry) => entry.version === version)
          if (chosen === undefined) {
            throw new Error(`the market does not list "${id}" version "${version}"`)
          }
          return installExtensionFromMarket({
            store,
            state,
            plugin,
            version: chosen,
            hubVersion,
          })
        })
        sendJson(response, 200, result)
        return
      }
      if (action === "remove") {
        const id = required(body.id, "missing id")
        await run(async () => {
          await removeInstalledExtension({ store, state, id })
        })
        sendJson(response, 200, { ok: true })
        return
      }
      throw new Error(`unknown action "${action}"`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      sendError(response, new Error(message), 400)
    }
  }
}

/**
 * Performs one extension's HTTP request. A browser page
 * cannot read a cross-origin API that serves no CORS header, so this route is
 * how a plugin reaches one: the host holds the connection.
 *
 * It is deliberately narrow, because a route that fetches whatever it is told
 * is a request forgery waiting to happen: HTTPS only, a public host (never a
 * loopback, private, or link-local address), no redirects to follow, one GET,
 * a timeout, and a cap on the body it will read.
 */
export function createNetHandler(): HubMiddleware {
  return async (request, response, next) => {
    const url = new URL(request.url ?? "/", "http://localhost")
    /* One route, and the call names its own action in the body. */
    if (under(NET_ROUTE, url.pathname) !== "") {
      next()
      return
    }
    if ((request.method ?? "GET") !== "POST") {
      sendError(response, new Error(`unsupported method ${request.method ?? "GET"}`), 405)
      return
    }
    try {
      let asked: NetRequest
      try {
        asked = JSON.parse((await readBody(request)).toString("utf8")) as NetRequest
      } catch {
        /* The parser's own message names a character offset, which says nothing
           to whoever sent the body. */
        throw new Error("net: the request body is not JSON")
      }
      /* The one action this route has, named like every other call in the hub. */
      if ((asked as { action?: unknown }).action !== "fetch") {
        throw new Error(`net: unknown action: ${String((asked as { action?: unknown }).action)}`)
      }
      sendJson(response, 200, await fetchThroughProxy(asked))
    } catch (error) {
      sendError(response, error)
    }
  }
}

/** Longest an upstream request may take before it is abandoned. */
const NET_TIMEOUT_MS = 10_000

/** Most body bytes this route will read from an upstream response. */
const NET_MAX_BYTES = 4 * 1024 * 1024

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
  if (!isPublicHostname(target.hostname)) {
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
 * Keeps the workspace list. The form
 * reports the folder the person picked through the system's own dialog — its
 * name, since a page is told nothing else — and this keeps it; a product form
 * mounts the same store itself.
 */
export function createWorkspaceHandler(options: { home?: string; folder?: string } = {}): HubMiddleware {
  let ready: Promise<WorkspaceStore> | null = null

  const getStore = async (): Promise<WorkspaceStore> => {
    ready ??= (async () => {
      /* This host's own folder is a workspace by default, with no picking. */
      const folder = options.folder ?? (await hostFolder())
      return createFsWorkspaceStore(resolveHubHome(options.home), { folder })
    })()
    return ready
  }

  return async (request, response, next) => {
    const url = new URL(request.url ?? "/", "http://localhost")
    /* One route, and the call names its own action in the body. */
    if (under(WORKSPACE_ROUTE, url.pathname) !== "") {
      next()
      return
    }
    const method = request.method ?? "GET"
    try {
      const store = await getStore()

      if (method === "GET") {
        sendJson(response, 200, await store.page())
        return
      }
      if (method !== "POST") {
        sendError(response, new Error(`unsupported method ${method}`), 405)
        return
      }

      const body = JSON.parse((await readBody(request)).toString("utf8")) as Record<string, unknown>

      switch (body.action) {
        case "add": {
          const path = required(body.path, "add needs the folder's path")
          sendJson(response, 200, await store.add(path))
          return
        }

        case "select":
          sendJson(response, 200, await store.select(required(body.id, "select needs a workspace id")))
          return

        /* Both halves are required: an agent is chosen or given up, and a call
           naming only one of them would have to guess the other. */
        case "agent": {
          const id = required(body.id, "agent needs an id")
          if (typeof body.on !== "boolean") throw new Error("agent needs whether it is chosen")
          sendJson(response, 200, await store.setAgent(id, body.on))
          return
        }

        case "rename": {
          const id = required(body.id, "rename needs a workspace id")
          const name = required(body.name, "rename needs the name to give it")
          sendJson(response, 200, await store.rename(id, name))
          return
        }

        case "remove":
          sendJson(response, 200, await store.remove(required(body.id, "remove needs a workspace id")))
          return

        default:
          throw new Error(`unknown action: ${String(body.action)}`)
      }
    } catch (error) {
      sendError(response, error)
    }
  }
}
