/**
 * The prompt library's host half, as one request handler. The disk-backed store
 * lives in the process that owns the files; this puts it behind whichever
 * carrier is running, so a form reaches it however it is delivered. It is not a
 * Vite plugin: the dev server, the built form's own server and a desktop child
 * process all mount the same handler.
 *
 * Delivering a prompt to an agent's directory is *not* here: that goes through
 * the place files bridge, which owns both roots, and works the same for every
 * module that writes a client's own files.
 */
import { type IncomingMessage } from "node:http"

import {
  readBody,
  sendError,
  sendJson,
  type HubMiddleware,
} from "@context-hub/core/host/http"

import { createFsPromptStore } from "./src/host/prompts-fs.ts"
import { PROMPT_ROUTE } from "./src/store.ts"
import type { PromptStore } from "./src/store.ts"

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
 * The path under one route, or null when this handler does not own the request.
 *
 * `""` is the route itself. Requiring the separator is what keeps a path that
 * merely starts with the same letters — `/hub/promptsX` — from being read as
 * this route carrying a row id of `X`.
 */
function under(route: string, pathname: string): string | null {
  if (pathname === route) return ""
  if (!pathname.startsWith(`${route}/`)) return null
  return pathname.slice(route.length + 1)
}

/**
 * Exposes the prompt library.
 *
 * @param options.home — the hub home; the library is the `prompts` directory inside it.
 */
export function createPromptHandler(options: { home?: string } = {}): HubMiddleware {
  let ready: Promise<PromptStore> | null = null

  const getStore = async (): Promise<PromptStore> => {
    ready ??= Promise.resolve(createFsPromptStore({ home: options.home }))
    return ready
  }

  return async (request, response, next) => {
    const url = new URL(request.url ?? "/", "http://localhost")
    /* One route, and nothing is addressed by a path: every action names itself,
       and a call that carries a file names it in the query because the body is
       the file. */
    if (under(PROMPT_ROUTE, url.pathname) !== "") {
      next()
      return
    }
    const method = request.method ?? "GET"

    try {
      const store = await getStore()

      /* GET /hub/prompts — the whole library, which is what a page draws. */
      if (method === "GET") {
        sendJson(response, 200, await store.list())
        return
      }

      if (method !== "POST") {
        sendError(response, new Error(`unsupported method ${method}`), 405)
        return
      }

      /* Uploaded bytes are the body itself rather than base64 in JSON, so this
         is the one call that cannot carry its action in the body. */
      if (url.searchParams.get("action") === "put-asset") {
        sendJson(response, 200, await putAsset(store, url, request))
        return
      }

      const body = JSON.parse((await readBody(request)).toString("utf8")) as Record<string, unknown>

      switch (body.action) {
        case "create": {
          const name = required(body.name, "prompt name")
          const description = required(body.description, "prompt description")
          sendJson(
            response,
            200,
            await store.create({
              name,
              description,
              /* The dialog refuses an empty prompt, so an empty one here is
                 a caller that made the body up; the store refuses it too. */
              prompt: typeof body.prompt === "string" ? body.prompt : "",
              tags: tagsOf(body.tags),
            })
          )
          return
        }

        /* A field the body omits is left as it is; an empty list of tags is a
           real answer — every category taken off — so it is taken as sent
           rather than read as "nothing was said". */
        case "update": {
          const patch: { name?: string; prompt?: string; description?: string; tags?: string[] } = {}
          for (const field of ["name", "prompt", "description"] as const) {
            if (body[field] === undefined) continue
            /* Sent and unusable is a caller that made the body up; the store
               refuses an empty field too, so this only says it sooner. */
            patch[field] = required(body[field], `prompt ${field}`)
          }
          if (body.tags !== undefined) patch.tags = tagsOf(body.tags)
          if (Object.keys(patch).length === 0) {
            throw new Error("an edit needs a name, a prompt, a description, or tags")
          }
          sendJson(response, 200, await store.update(required(body.id, "prompt id"), patch))
          return
        }

        case "remove":
          await store.remove(required(body.id, "prompt id"))
          sendJson(response, 200, { ok: true })
          return

        /* A pasted address, as opposed to uploaded bytes. */
        case "add-asset-source":
          sendJson(
            response,
            200,
            await store.addAssetSource(
              required(body.id, "prompt id"),
              required(body.source, "asset source")
            )
          )
          return

        case "delete-asset":
          await store.deleteAsset(
            required(body.id, "prompt id"),
            required(body.ref, "asset reference")
          )
          sendJson(response, 200, { ok: true })
          return

        default:
          throw new Error(`unknown action: ${String(body.action)}`)
      }
    } catch (error) {
      sendError(response, error)
    }
  }
}

/** Take over uploaded bytes, named by the caller and typed by its own header. */
async function putAsset(
  store: PromptStore,
  url: URL,
  request: IncomingMessage
): Promise<unknown> {
  const id = required(url.searchParams.get("id"), "prompt id")
  const name = required(url.searchParams.get("name"), "asset name")
  const bytes = await readBody(request)
  const part = new Uint8Array(bytes.byteLength)
  part.set(bytes)
  const file = new File([part], name, { type: request.headers["content-type"] ?? "" })
  return store.putAsset(id, file)
}
