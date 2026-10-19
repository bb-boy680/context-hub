/**
 * The hub's own server: the carrier that mounts a set of
 * {@link HubMiddleware} on a real `node:http` listener.
 *
 * Until this existed the only way to reach a bridge was as a Vite middleware,
 * so a built form had no backend at all and no carrier besides the dev server
 * could mount one. Now the dev server mounts the same handlers (each package's
 * `vite.ts`), this mounts them for a built form, and a desktop form mounts them
 * in the child process it spawns — one protocol and one handler set behind all
 * three, which is what the executable and desktop forms need.
 *
 * It binds loopback and refuses a wildcard address: these handlers start child
 * processes and write the files the person's own agents read, so the listener
 * is not something to expose.
 */
import { promises as fs } from "node:fs"
import { createServer } from "node:http"
import type { IncomingMessage, ServerResponse } from "node:http"
import path from "node:path"

import { contentTypeOf, sendJson, type HubMiddleware } from "./http.ts"

/** Addresses that mean "every interface", which this server never binds. */
const WILDCARD_HOSTS = new Set(["0.0.0.0", "::", "[::]", "*", "::0", "0:0:0:0:0:0:0:0"])

/** How the carrier reports what it could not do; defaults to the console. */
export type HubServerLog = (level: "warn" | "error", message: string) => void

export interface HubServerOptions {
  /** The bridges to mount, tried in order until one answers. */
  middlewares: readonly HubMiddleware[]
  /**
   * Serve this directory for anything no bridge claimed. Omit for a host that
   * answers on its routes only.
   */
  static?: { root: string; index?: string }
  /** Interface to bind. Defaults to `127.0.0.1`; a wildcard address is refused. */
  host?: string
  /** Port to bind; `0` lets the OS assign one and `listen()` reports it. */
  port?: number
  log?: HubServerLog
}

/** A listener that is up, and what it is reachable at. */
export interface HubListener {
  /** The origin this server answers on, e.g. `http://127.0.0.1:52341`. */
  readonly url: string
  /** The bound port. Meaningful when the caller asked for `0`. */
  readonly port: number
  /** Stop listening and drop the connections still open. */
  close(): Promise<void>
}

/** The default landing document a static root is served with. */
const DEFAULT_INDEX = "index.html"

/**
 * Refuse an address that would put this host on every interface.
 *
 * @throws when the host is empty or names every interface.
 */
function assertBindableHost(host: string): void {
  const trimmed = host.trim()
  if (trimmed === "") {
    throw new Error("hub server: refusing to bind every interface; name one, e.g. 127.0.0.1")
  }
  if (WILDCARD_HOSTS.has(trimmed.toLowerCase())) {
    throw new Error(`hub server: refusing to bind every interface (${trimmed})`)
  }
}

/**
 * Whether a handler has committed to answering.
 *
 * Not `writableEnded`: a handler that pipes a file resolves before the stream
 * finishes, and its headers are already out by then. Sent headers are the
 * signal that the response is spoken for.
 */
function answered(response: ServerResponse): boolean {
  return response.headersSent || response.writableEnded
}

/**
 * Run the middleware chain for one request.
 *
 * A handler either answers or calls `next()`. A handler that does neither would
 * leave the request hanging with no reader to notice, so that is answered as a
 * failure here rather than waited out.
 */
async function dispatch(
  middlewares: readonly HubMiddleware[],
  at: number,
  request: IncomingMessage,
  response: ServerResponse,
  log: HubServerLog
): Promise<void> {
  const handler = middlewares[at]
  if (handler === undefined) {
    sendJson(response, 404, { error: "no route answers this" })
    return
  }

  let advanced = false
  let rest: Promise<void> | null = null
  const next = (): void => {
    /* A handler that calls `next` twice would run the rest of the chain twice. */
    if (advanced) return
    advanced = true
    rest = dispatch(middlewares, at + 1, request, response, log)
  }

  try {
    await handler(request, response, next)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log("error", `hub server: a handler threw: ${message}`)
    if (!answered(response)) sendJson(response, 500, { error: message })
    return
  }
  if (rest !== null) {
    await rest
    return
  }
  if (!answered(response)) {
    log("error", "hub server: a handler neither answered nor passed the request on")
    sendJson(response, 500, { error: "a handler did not answer" })
  }
}

/** One path under the static root, or why it may not be served. */
async function locate(
  root: string,
  pathname: string
): Promise<{ file: string } | { refuse: 400 | 403 | 404 }> {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return { refuse: 400 }
  }
  /* A NUL byte cannot appear in a path, and some filesystems truncate on it. */
  if (decoded.includes("\0")) return { refuse: 400 }

  const target = path.resolve(root, `.${decoded}`)
  if (target !== root && !target.startsWith(root + path.sep)) return { refuse: 403 }

  const stat = await fs.stat(target).catch(() => null)
  if (stat === null) return { refuse: 404 }
  if (stat.isFile()) return { file: target }
  if (!stat.isDirectory()) return { refuse: 404 }

  const landing = path.join(target, DEFAULT_INDEX)
  const landed = await fs.stat(landing).catch(() => null)
  return landed !== null && landed.isFile() ? { file: landing } : { refuse: 404 }
}

/** Serve one file. A HEAD asks what a GET would answer, without the bytes. */
async function sendFile(
  file: string,
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  /* Read the whole file: a compiled Bun binary exposes embedded files through
     `readFile`, while `createReadStream` on the same path answers ENOENT and
     its error escapes the response. The length comes from the bytes actually
     read, because an embedded file's `stat.size` is not part of the contract. */
  const body = await fs.readFile(file).catch(() => null)
  if (body === null) {
    response.writeHead(404).end()
    return
  }
  response.writeHead(200, {
    "Content-Type": contentTypeOf(file),
    "Content-Length": body.byteLength,
    "Cache-Control": "no-store",
  })
  response.end(request.method === "HEAD" ? undefined : body)
}

/**
 * The last step of the chain when a static root is configured: the landing
 * document for a path a client router owns, and one file per path that names
 * one.
 *
 * A path with no extension is a route — the app is served by `BrowserRouter`,
 * so `/skills` has to render the landing document rather than 404. A path that
 * names a file and is missing is answered as missing, because handing back
 * markup for a missing module would fail with a parse error instead of saying
 * what happened.
 *
 * Being the last step, it always answers: falling through again would only
 * reach the chain's own 404, which is JSON, from a browser's point of view.
 */
function staticRoot(root: string, index: string): HubMiddleware {
  return async (request, response) => {
    const method = request.method ?? "GET"
    if (method !== "GET" && method !== "HEAD") {
      response.writeHead(405).end()
      return
    }
    const url = new URL(request.url ?? "/", "http://localhost")
    const found = await locate(root, url.pathname)
    if ("refuse" in found) {
      if (found.refuse !== 404 || path.posix.extname(url.pathname) !== "") {
        response.writeHead(found.refuse).end()
        return
      }
      /* A route, not a file: the client router owns this path. */
      const landing = path.join(root, index)
      const stat = await fs.stat(landing).catch(() => null)
      if (stat === null || !stat.isFile()) {
        response.writeHead(404).end()
        return
      }
      await sendFile(landing, request, response)
      return
    }
    await sendFile(found.file, request, response)
  }
}

/**
 * Mount a set of bridges on a loopback listener.
 *
 * @param options.middlewares — the bridges, in the order they are tried.
 * @param options.static — a directory to fall back to for anything unclaimed.
 * @param options.host — defaults to `127.0.0.1`; a wildcard address is refused.
 * @param options.port — `0` binds any free port; {@link HubListener.port} reports it.
 * @param options.log — where a handler's failure is reported; defaults to the console.
 * @throws when the host is a wildcard address.
 */
export function createHubServer(options: HubServerOptions): { listen(): Promise<HubListener> } {
  const host = options.host ?? "127.0.0.1"
  assertBindableHost(host)
  const port = options.port ?? 0
  const log: HubServerLog = options.log ?? ((level, message) => console[level](message))

  const chain: HubMiddleware[] = [...options.middlewares]
  if (options.static !== undefined) {
    chain.push(staticRoot(path.resolve(options.static.root), options.static.index ?? DEFAULT_INDEX))
  }

  const server = createServer((request, response) => {
    void dispatch(chain, 0, request, response, log)
  })

  return {
    async listen(): Promise<HubListener> {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error): void => {
          server.off("listening", onListening)
          reject(error)
        }
        const onListening = (): void => {
          server.off("error", onError)
          resolve()
        }
        server.once("error", onError)
        server.once("listening", onListening)
        server.listen(port, host)
      })
      const address = server.address()
      const bound = typeof address === "object" && address !== null ? address.port : port
      const shown = host.includes(":") ? `[${host}]` : host
      return {
        url: `http://${shown}:${bound}`,
        port: bound,
        close: () =>
          new Promise<void>((resolve) => {
            /* Keep-alive sockets would hold the listener open past close(). */
            server.closeAllConnections()
            server.close(() => resolve())
          }),
      }
    },
  }
}
