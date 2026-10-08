/**
 * Development bridge for the skill library. The disk-backed store lives in the
 * process that owns the files; this Vite plugin puts it behind the dev server so
 * the browser form can use it during development. Product forms mount the same
 * store themselves — the desktop app in its main process, the executable in its
 * host — so nothing here is a service the app depends on.
 *
 * Media files are served by the asset bridge, which owns that directory; this
 * one only records and drops the references a skill holds.
 */
import type { IncomingMessage, ServerResponse } from "node:http"

import { createFsSkillStore } from "./src/host/skills-fs.ts"
import type { SkillOrigin, SkillStore } from "./src/store.ts"

/** Route prefix this bridge answers on. */
const PREFIX = "/hub/skills"

/** Origins a page may filter by; a query naming anything else reads as unfiltered. */
const ORIGINS: readonly SkillOrigin[] = ["local", "builtin", "registry"]

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

/** Vite plugin that exposes the skill library over the dev server. */
export function skillLibrary(options: { home?: string } = {}) {
  let ready: Promise<SkillStore> | null = null

  const getStore = async (): Promise<SkillStore> => {
    ready ??= createFsSkillStore({ home: options.home })
    return ready
  }

  return {
    name: "context-hub-skill-library",
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
          if (!url.pathname.startsWith(PREFIX)) {
            next()
            return
          }
          const rest = url.pathname.slice(PREFIX.length).replace(/^\//, "")
          const [id, section, ...tail] = rest.split("/").map(decodeURIComponent)
          try {
            const api = await getStore()
            const method = request.method ?? "GET"

            /* GET /hub/skills?action=tags — every category in use */
            if (
              rest === "" &&
              method === "GET" &&
              url.searchParams.get("action") === "tags"
            ) {
              sendJson(response, 200, await api.tags())
              return
            }

            /* GET /hub/skills — the catalog page */
            if (rest === "" && method === "GET") {
              const enabled = url.searchParams.get("enabled")
              const wanted = url.searchParams.get("source")
              const page = await api.list({
                offset: Number(url.searchParams.get("offset") ?? 0),
                limit:
                  url.searchParams.get("limit") === null
                    ? undefined
                    : Number(url.searchParams.get("limit")),
                q: url.searchParams.get("q") ?? undefined,
                tag: url.searchParams.get("tag") ?? undefined,
                enabled: enabled === null ? undefined : enabled === "true",
                source: ORIGINS.find((origin) => origin === wanted),
                sort:
                  url.searchParams.get("sort") === "name" ? "name" : "updated",
              })
              sendJson(response, 200, page)
              return
            }

            /* POST /hub/skills?action=refresh — rebuild the catalog from disk */
            if (
              rest === "" &&
              method === "POST" &&
              url.searchParams.get("action") === "refresh"
            ) {
              await api.refresh()
              sendJson(response, 200, { ok: true })
              return
            }

            /* POST /hub/skills — create */
            if (rest === "" && method === "POST") {
              const body = JSON.parse(
                (await readBody(request)).toString("utf8")
              )
              sendJson(response, 200, await api.create(body))
              return
            }

            if (id === undefined || id === "") {
              sendError(response, new Error("missing skill id"))
              return
            }

            /* /hub/skills/<id> */
            if (section === undefined) {
              if (method === "GET") sendJson(response, 200, await api.get(id))
              else if (method === "PATCH") {
                const body = JSON.parse(
                  (await readBody(request)).toString("utf8")
                )
                sendJson(response, 200, await api.update(id, body))
              } else if (method === "DELETE") {
                await api.remove(id)
                sendJson(response, 200, { ok: true })
              } else
                sendError(response, new Error(`unsupported method ${method}`))
              return
            }

            /* POST /hub/skills/<id>/source — record a pasted source */
            if (section === "source" && method === "POST") {
              const body = JSON.parse(
                (await readBody(request)).toString("utf8")
              ) as { source?: string }
              if (typeof body.source !== "string") {
                sendError(response, new Error("missing source"))
                return
              }
              sendJson(response, 200, await api.addAssetSource(id, body.source))
              return
            }

            /* /hub/skills/<id>/assets?ref=… — drop a reference */
            if (section === "assets" && method === "DELETE") {
              const ref = url.searchParams.get("ref")
              if (ref === null) {
                sendError(response, new Error("missing asset reference"))
                return
              }
              await api.deleteAsset(id, ref)
              sendJson(response, 200, { ok: true })
              return
            }

            /* POST /hub/skills/<id>/assets?name=… — take over uploaded bytes */
            if (section === "assets" && method === "POST") {
              const name = url.searchParams.get("name")
              if (name === null) {
                sendError(response, new Error("missing asset name"))
                return
              }
              const bytes = await readBody(request)
              const part = new Uint8Array(bytes.byteLength)
              part.set(bytes)
              const file = new File([part], name, {
                type: request.headers["content-type"] ?? "",
              })
              sendJson(response, 200, await api.putAsset(id, file))
              return
            }

            /* /hub/skills/<id>/files/<path> */
            if (section === "files" && tail.length > 0) {
              const file = tail.join("/")
              if (method === "GET") {
                sendJson(response, 200, { text: await api.readFile(id, file) })
              } else if (method === "PUT") {
                await api.writeFile(
                  id,
                  file,
                  (await readBody(request)).toString("utf8")
                )
                sendJson(response, 200, { ok: true })
              } else
                sendError(response, new Error(`unsupported method ${method}`))
              return
            }

            sendError(response, new Error(`unknown route ${url.pathname}`))
          } catch (error) {
            sendError(response, error)
          }
        }
      )
    },
  }
}
