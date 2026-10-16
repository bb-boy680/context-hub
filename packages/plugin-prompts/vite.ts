/**
 * Development bridge for the prompt library. The disk-backed store lives in the
 * process that owns the files; this Vite plugin puts it behind the dev server
 * so the browser form can use it during development. Product forms mount the
 * same store themselves — the desktop app in its main process, the executable
 * in its host — so nothing here is a service the app depends on.
 *
 * Delivering a prompt to an agent's directory is *not* here: that goes through
 * the place files bridge, which owns both roots, and works the same for every
 * module that writes a client's own files.
 */
import type { IncomingMessage, ServerResponse } from "node:http"

import { createFsPromptStore } from "./src/host/prompts-fs.ts"
import type { PromptStore } from "./src/store.ts"

/** Route prefix this bridge answers on. */
const PREFIX = "/hub/prompts"

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

/** A string the body carries, refused when it is missing or empty. */
function required(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`missing ${what}`)
  }
  return value
}

/** The categories a write carries; anything that is not a list of strings is dropped. */
function tagsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

/**
 * Vite plugin that exposes the prompt library over the dev server.
 *
 * @param options.home — the hub home; the library is the `prompts/prompts.json` inside it.
 */
export function promptLibrary(options: { home?: string } = {}) {
  let ready: Promise<PromptStore> | null = null

  const getStore = async (): Promise<PromptStore> => {
    ready ??= Promise.resolve(createFsPromptStore({ home: options.home }))
    return ready
  }

  return {
    name: "context-hub-prompt-library",

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
          const method = request.method ?? "GET"

          try {
            const store = await getStore()

            /* GET /hub/prompts — the whole library, which is what a page draws. */
            if (rest === "" && method === "GET") {
              sendJson(response, 200, await store.list())
              return
            }

            /* POST /hub/prompts — add one. */
            if (rest === "" && method === "POST") {
              const body = JSON.parse((await readBody(request)).toString("utf8")) as {
                description?: unknown
                prompt?: unknown
                tags?: unknown
              }
              const description = required(body.description, "prompt description")
              sendJson(
                response,
                200,
                await store.create({
                  description,
                  /* The dialog refuses an empty prompt, so an empty one here is
                     a caller that made the body up; the store refuses it too. */
                  prompt: typeof body.prompt === "string" ? body.prompt : "",
                  tags: tagsOf(body.tags),
                })
              )
              return
            }

            /* DELETE /hub/prompts/<id> — take one out, file and row together. */
            if (rest !== "" && method === "DELETE" && !rest.includes("/")) {
              await store.remove(decodeURIComponent(rest))
              sendJson(response, 200, { ok: true })
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
