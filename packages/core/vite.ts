/**
 * Development bridge for the asset library: it serves the files the hub owns so
 * the browser form can show them during development. Product forms serve the
 * same files from the process that owns the disk, so nothing here is a service
 * the app depends on.
 *
 * Only reads are routed: files are created and deleted through the store that
 * records them, which is what keeps a reference and its file in step.
 */
import { createReadStream, promises as fs } from "node:fs"
import type { IncomingMessage, ServerResponse } from "node:http"

import { ASSET_ROUTE } from "./src/assets.ts"
import { resolveStoredFile } from "./src/host/assets-fs.ts"
import { resolveHubHome } from "./src/host/home.ts"

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
