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
 * Exposes the prompt library.
 *
 * @param options.home — the hub home; the library is the `prompts/prompts.json` inside it.
 */
export function createPromptHandler(options: { home?: string } = {}): HubMiddleware {
  let ready: Promise<PromptStore> | null = null

  const getStore = async (): Promise<PromptStore> => {
    ready ??= Promise.resolve(createFsPromptStore({ home: options.home }))
    return ready
  }

  return async (request, response, next) => {
    const url = new URL(request.url ?? "/", "http://localhost")
    if (!url.pathname.startsWith(PROMPT_ROUTE)) {
      next()
      return
    }
    const rest = url.pathname.slice(PROMPT_ROUTE.length).replace(/^\//, "")
    const method = request.method ?? "GET"
    /* `<id>`, then the part of the row the request is about. */
    const [rawId = "", section = ""] = rest.split("/")
    const id = decodeURIComponent(rawId)

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
          name?: unknown
          description?: unknown
          prompt?: unknown
          tags?: unknown
        }
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

      /* PATCH /hub/prompts/<id> — change one prompt's name, its text, its
         description, its categories, or any of them. A field the body
         omits is left as it is. */
      if (rest !== "" && section === "" && method === "PATCH") {
        const body = JSON.parse((await readBody(request)).toString("utf8")) as {
          name?: unknown
          prompt?: unknown
          description?: unknown
          tags?: unknown
        }
        const patch: { name?: string; prompt?: string; description?: string; tags?: string[] } = {}
        for (const field of ["name", "prompt", "description"] as const) {
          if (body[field] === undefined) continue
          /* Sent and unusable is a caller that made the body up; the store
             refuses an empty field too, so this only says it sooner. */
          patch[field] = required(body[field], `prompt ${field}`)
        }
        /* An empty list is a real answer — every category taken off — so
           it is taken as sent rather than read as "nothing was said". */
        if (body.tags !== undefined) patch.tags = tagsOf(body.tags)
        if (Object.keys(patch).length === 0) {
          sendError(response, new Error("an edit needs a name, a prompt, a description, or tags"))
          return
        }
        sendJson(response, 200, await store.update(id, patch))
        return
      }

      /* POST /hub/prompts/<id>/source — record a pasted address. */
      if (section === "source" && method === "POST") {
        const body = JSON.parse((await readBody(request)).toString("utf8")) as {
          source?: unknown
        }
        sendJson(response, 200, await store.addAssetSource(id, required(body.source, "asset source")))
        return
      }

      /* POST /hub/prompts/<id>/assets?name=… — take over uploaded bytes,
         sent as the body itself rather than base64 in JSON. */
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
        sendJson(response, 200, await store.putAsset(id, file))
        return
      }

      /* DELETE /hub/prompts/<id>/assets?ref=… — drop one reference. */
      if (section === "assets" && method === "DELETE") {
        const ref = url.searchParams.get("ref")
        if (ref === null) {
          sendError(response, new Error("missing asset reference"))
          return
        }
        await store.deleteAsset(id, ref)
        sendJson(response, 200, { ok: true })
        return
      }

      /* DELETE /hub/prompts/<id> — take one out. */
      if (rest !== "" && section === "" && method === "DELETE") {
        await store.remove(id)
        sendJson(response, 200, { ok: true })
        return
      }

      sendError(response, new Error(`unknown route ${url.pathname}`))
    } catch (error) {
      sendError(response, error)
    }
  }
}
