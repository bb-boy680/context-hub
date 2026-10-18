/**
 * The variable library's host half, as one request handler. The disk-backed
 * store lives in the process that owns the files; this puts it behind whichever
 * carrier is running, so the page reaches it the same way in development and in
 * a built form.
 *
 * One route, and nothing is addressed by a path: every action names itself in
 * the body. A name that merely starts with the route's letters is not this
 * route (see `under`).
 */
import {
  readBody,
  sendError,
  sendJson,
  type HubMiddleware,
} from "@context-hub/core/host/http"

import { createFsVariableStore } from "./src/host/variables-fs.ts"
import {
  VARIABLE_ROUTE,
  type VariableDraft,
  type VariablePatch,
  type VariableStore,
} from "./src/store.ts"

/** A string the body carries, refused when it is missing or empty. */
function required(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`missing ${what}`)
  }
  return value.trim()
}

/** The path under one route, or null when this handler does not own the request. */
function under(route: string, pathname: string): string | null {
  if (pathname === route) return ""
  if (!pathname.startsWith(`${route}/`)) return null
  return pathname.slice(route.length + 1)
}

/** The entries a batch create carries, with each one's own fields checked. */
function draftsOf(value: unknown): VariableDraft[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("a create needs at least one variable")
  }
  return value.map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new Error(`variable ${index + 1} is not an object`)
    }
    const row = item as Record<string, unknown>
    return {
      name: required(row.name, `variable ${index + 1} name`),
      ...(row.group === undefined ? {} : { group: String(row.group) }),
      value: typeof row.value === "string" ? row.value : "",
    }
  })
}

/** The patch an update carries; the store performs the real validation. */
function patchOf(value: unknown): VariablePatch {
  if (typeof value !== "object" || value === null) {
    throw new Error("an edit needs a patch")
  }
  const body = value as Record<string, unknown>
  const patch: VariablePatch = {}
  if (body.name !== undefined) patch.name = required(body.name, "variable name")
  if (body.group !== undefined) patch.group = required(body.group, "group")
  if (body.value !== undefined) {
    if (typeof body.value !== "string") throw new Error("variable value must be a string")
    patch.value = body.value
  }
  if (Object.keys(patch).length === 0) {
    throw new Error("an edit needs a name, a group, or a value")
  }
  return patch
}

/**
 * Exposes the variable library.
 *
 * @param options.home — the hub home; the library is the `variables` directory
 *   inside it.
 */
export function createVariableHandler(
  options: { home?: string } = {}
): HubMiddleware {
  let ready: Promise<VariableStore> | null = null

  const getStore = async (): Promise<VariableStore> => {
    ready ??= Promise.resolve(createFsVariableStore({ home: options.home }))
    return ready
  }

  return async (request, response, next) => {
    const url = new URL(request.url ?? "/", "http://localhost")
    if (under(VARIABLE_ROUTE, url.pathname) !== "") {
      next()
      return
    }

    const method = request.method ?? "GET"
    try {
      const store = await getStore()

      if (method === "GET") {
        sendJson(response, 200, await store.read())
        return
      }
      if (method !== "POST") {
        sendError(response, new Error(`unsupported method ${method}`), 405)
        return
      }

      const body = JSON.parse(
        (await readBody(request)).toString("utf8")
      ) as Record<string, unknown>

      switch (body.action) {
        case "create":
          sendJson(response, 200, await store.create(draftsOf(body.entries)))
          return
        case "update":
          sendJson(
            response,
            200,
            await store.update(required(body.name, "variable name"), patchOf(body.patch))
          )
          return
        case "remove":
          sendJson(response, 200, await store.remove(required(body.name, "variable name")))
          return
        case "create-group":
          sendJson(response, 200, await store.createGroup(required(body.group, "group name")))
          return
        default:
          throw new Error(`unknown action: ${String(body.action)}`)
      }
    } catch (error) {
      sendError(response, error)
    }
  }
}
