/**
 * What this host answers over HTTP, in one place: the handler shape every
 * bridge is written against, the pipeline each of them repeats, and the one
 * content-type table a response is labelled from.
 *
 * The handler shape is deliberately plain `node:http`. A bridge used to be
 * reachable only as a Vite middleware, which meant a built form had no backend
 * at all and no carrier other than the dev server could mount one. Nothing here
 * mentions Vite: see {@link file://./server.ts} for the carrier and the
 * `vite.ts` of each package for the dev-server shell.
 */
import type { IncomingMessage, ServerResponse } from "node:http"

/**
 * One request handler: the shape `node:http` and connect-style middleware both
 * already use, so a handler written here mounts anywhere.
 *
 * A handler either answers the request or calls `next()` to pass it on. Calling
 * both, or neither, is a bug the carrier reports rather than swallowing.
 */
export type HubMiddleware = (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void
) => void | Promise<void>

/** One `Content-Type` per extension, for everything this host serves over HTTP. */
const MIME_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json",
  map: "application/json",
  webmanifest: "application/manifest+json",
  txt: "text/plain; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  ico: "image/x-icon",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  wasm: "application/wasm",
  /* Served as its own bytes, never as a `Content-Encoding`: a reader that
     inflates the body itself would otherwise be handed an already-decoded one. */
  gz: "application/gzip",
}

/**
 * One `Content-Type` for a file, from its extension.
 *
 * One table for the whole host: a second one would drift into answering
 * differently for the same extension, and a stored file's type is the same
 * question wherever it is served from.
 */
export function contentTypeOf(file: string): string {
  const extension = file.slice(file.lastIndexOf(".") + 1).toLowerCase()
  return MIME_TYPES[extension] ?? "application/octet-stream"
}

/** Read a whole request body into one buffer. */
export async function readBody(request: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

/**
 * Read one request body as JSON.
 *
 * @returns the value it holds, or `{}` when the body is empty — a call that
 *   carries nothing is the common case for an action that names itself in the
 *   query.
 * @throws when the body is not JSON. A caller turns that into the 400 below.
 */
export async function readJson(request: NodeJS.ReadableStream): Promise<Record<string, unknown>> {
  const text = (await readBody(request)).toString("utf8")
  if (text.trim() === "") return {}
  const parsed: unknown = JSON.parse(text)
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("the request body is not a JSON object")
  }
  return parsed as Record<string, unknown>
}

/** Answer with a value. `no-store` because every one of these answers is live. */
export function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    /* A cached manifest would describe a plugin whose files just changed. */
    "Cache-Control": "no-store",
  })
  response.end(body)
}

/**
 * Answer with a failure, as this host's convention writes one: a 4xx carrying
 * `{ error }`. A caller that catches its own throw turns it into this, so a
 * bridge never leaves a request unanswered.
 */
export function sendError(response: ServerResponse, error: unknown, status = 400): void {
  const message = error instanceof Error ? error.message : String(error)
  sendJson(response, status, { error: message })
}
