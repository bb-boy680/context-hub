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

import { createAssetStore } from "@workspace/core"
import type { AssetSink, AssetStore } from "@workspace/core"
import { createFsAssetLibrary } from "@workspace/core/host"
import { hostFolder } from "@workspace/core/host/fs-browse"
import { resolveHubHome } from "@workspace/core/host/home"

import { createFsSkillStore } from "./src/host/skills-fs.ts"
import type { SkillOrigin, SkillPlaceRef, SkillStore } from "./src/store.ts"

/** Route prefix this bridge answers on. */
const PREFIX = "/hub/skills"

/** Origins a page may filter by; a query naming anything else reads as unfiltered. */
const ORIGINS: readonly SkillOrigin[] = ["local", "builtin", "registry"]

/**
 * The place an action names, from the scope and directory it carried. Both are
 * required: a place is a directory under one of two roots, so a call that names
 * neither has nothing to read.
 *
 * @throws when the scope is neither of the two, or no directory was sent.
 */
function placeRef(scope: unknown, dir: unknown): SkillPlaceRef {
  if (scope !== "workspace" && scope !== "global") {
    throw new Error(`not a skill scope: ${String(scope)}`)
  }
  if (typeof dir !== "string" || dir === "") {
    throw new Error("missing place directory")
  }
  return { scope, dir }
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
  })
  response.end(body)
}

function sendError(response: ServerResponse, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  sendJson(response, 400, { error: message })
}

/**
 * Vite plugin that exposes the skill library over the dev server.
 *
 * @param options.home — the hub home; skills live in `<home>/skills` and their files in `<home>/assets`.
 * @param options.folder — the folder this host works in, when it is not the one the process is started from.
 * @param options.sinks — places this form keeps assets besides the hub's own directory, such as a bucket a plugin uploads to.
 * @param options.assets — a store to use instead of one over `<home>/assets`, for a form that keeps assets its own way.
 */
export function skillLibrary(
  options: {
    home?: string
    folder?: string
    sinks?: readonly AssetSink[]
    assets?: AssetStore
  } = {}
) {
  let ready: Promise<SkillStore> | null = null

  const getStore = async (): Promise<SkillStore> => {
    ready ??= (async () => {
      /* This host's own folder is a workspace by default, with no picking. */
      const folder = options.folder ?? (await hostFolder())
      const assets =
        options.assets ??
        createAssetStore(
          createFsAssetLibrary(resolveHubHome(options.home)),
          options.sinks ?? []
        )
      return createFsSkillStore({ home: options.home, folder, assets })
    })()
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
          /* A read names the place in its query; a write names it in its body,
             because the id it acts on travels there too. */
          const queryRef = () =>
            placeRef(url.searchParams.get("scope"), url.searchParams.get("dir"))
          const bodyRef = (body: { scope?: unknown; dir?: unknown }) =>
            placeRef(body.scope, body.dir)
          try {
            const api = await getStore()
            const method = request.method ?? "GET"

            /* GET /hub/skills?action=place&scope=&dir= — what one place holds */
            if (
              rest === "" &&
              method === "GET" &&
              url.searchParams.get("action") === "place"
            ) {
              sendJson(response, 200, await api.placeSkills(queryRef()))
              return
            }

            /* GET /hub/skills?action=place-skill&id=… — one, read in place */
            if (
              rest === "" &&
              method === "GET" &&
              url.searchParams.get("action") === "place-skill"
            ) {
              const skill = url.searchParams.get("id")
              if (skill === null || skill === "") {
                sendError(response, new Error("missing skill id"))
                return
              }
              sendJson(response, 200, await api.placeSkill(skill, queryRef()))
              return
            }

            /* GET /hub/skills?action=place-file&id=…&path=… — one file, read in place */
            if (
              rest === "" &&
              method === "GET" &&
              url.searchParams.get("action") === "place-file"
            ) {
              const skill = url.searchParams.get("id")
              const file = url.searchParams.get("path")
              if (skill === null || skill === "" || file === null || file === "") {
                sendError(response, new Error("missing place file"))
                return
              }
              sendJson(response, 200, {
                text: await api.placeFile(skill, file, queryRef()),
              })
              return
            }

            /* POST /hub/skills?action=install-place — link one skill into it */
            if (
              rest === "" &&
              method === "POST" &&
              url.searchParams.get("action") === "install-place"
            ) {
              const body = JSON.parse((await readBody(request)).toString("utf8")) as {
                id?: unknown
                scope?: unknown
                dir?: unknown
              }
              if (typeof body.id !== "string" || body.id === "") {
                sendError(response, new Error("missing skill id"))
                return
              }
              sendJson(response, 200, {
                mode: await api.installInto(body.id, bodyRef(body)),
              })
              return
            }

            /* POST /hub/skills?action=adopt-place — link one into the library */
            if (
              rest === "" &&
              method === "POST" &&
              url.searchParams.get("action") === "adopt-place"
            ) {
              const body = JSON.parse((await readBody(request)).toString("utf8")) as {
                id?: unknown
                scope?: unknown
                dir?: unknown
              }
              if (typeof body.id !== "string" || body.id === "") {
                sendError(response, new Error("missing skill id"))
                return
              }
              sendJson(response, 200, {
                mode: await api.adoptFrom(body.id, bodyRef(body)),
              })
              return
            }

            /* POST /hub/skills?action=delete-place — delete its directory */
            if (
              rest === "" &&
              method === "POST" &&
              url.searchParams.get("action") === "delete-place"
            ) {
              const body = JSON.parse((await readBody(request)).toString("utf8")) as {
                id?: unknown
                scope?: unknown
                dir?: unknown
              }
              if (typeof body.id !== "string" || body.id === "") {
                sendError(response, new Error("missing skill id"))
                return
              }
              await api.deleteInPlace(body.id, bodyRef(body))
              sendJson(response, 200, { ok: true })
              return
            }

            /* POST /hub/skills?action=remove-place — take one back out */
            if (
              rest === "" &&
              method === "POST" &&
              url.searchParams.get("action") === "remove-place"
            ) {
              const body = JSON.parse((await readBody(request)).toString("utf8")) as {
                id?: unknown
                scope?: unknown
                dir?: unknown
              }
              if (typeof body.id !== "string" || body.id === "") {
                sendError(response, new Error("missing skill id"))
                return
              }
              await api.removeFrom(body.id, bodyRef(body))
              sendJson(response, 200, { ok: true })
              return
            }

            /* GET /hub/skills?action=tags — every category in use */
            if (
              rest === "" &&
              method === "GET" &&
              url.searchParams.get("action") === "tags"
            ) {
              sendJson(response, 200, await api.tags())
              return
            }

            /* GET /hub/skills?action=package&source=… — what a package offers */
            if (
              rest === "" &&
              method === "GET" &&
              url.searchParams.get("action") === "package"
            ) {
              const source = url.searchParams.get("source")
              if (source === null || source.trim() === "") {
                sendError(response, new Error("missing package source"))
                return
              }
              sendJson(response, 200, await api.listPackage(source))
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

            /* POST /hub/skills?action=check-updates — ask every recorded source */
            if (
              rest === "" &&
              method === "POST" &&
              url.searchParams.get("action") === "check-updates"
            ) {
              sendJson(response, 200, await api.checkUpdates())
              return
            }

            /* POST /hub/skills?action=install — download from a package */
            if (
              rest === "" &&
              method === "POST" &&
              url.searchParams.get("action") === "install"
            ) {
              const body = JSON.parse((await readBody(request)).toString("utf8")) as {
                source?: unknown
                skills?: unknown
              }
              if (typeof body.source !== "string" || body.source.trim() === "") {
                sendError(response, new Error("missing package source"))
                return
              }
              const skills = Array.isArray(body.skills)
                ? body.skills.filter((item): item is string => typeof item === "string")
                : []
              sendJson(response, 200, await api.installPackage(body.source, skills))
              return
            }

            /* POST /hub/skills?action=import — take over the skills a folder read */
            if (
              rest === "" &&
              method === "POST" &&
              url.searchParams.get("action") === "import"
            ) {
              const body = JSON.parse((await readBody(request)).toString("utf8")) as {
                skills?: unknown
              }
              if (!Array.isArray(body.skills)) {
                sendError(response, new Error("missing folder skills"))
                return
              }
              const skills = body.skills.filter(
                (item): item is { name: string; files: { path: string; base64: string }[] } =>
                  typeof item === "object" &&
                  item !== null &&
                  typeof (item as { name?: unknown }).name === "string" &&
                  Array.isArray((item as { files?: unknown }).files) &&
                  ((item as { files: unknown[] }).files as unknown[]).every(
                    (file) =>
                      typeof file === "object" &&
                      file !== null &&
                      typeof (file as { path?: unknown }).path === "string" &&
                      typeof (file as { base64?: unknown }).base64 === "string"
                  )
              )
              sendJson(response, 200, await api.importFolder(skills))
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

            /* /hub/skills/<id>/update — read the upstream, or install it over this copy */
            if (section === "update") {
              if (method === "GET") {
                sendJson(response, 200, await api.checkUpdate(id))
              } else if (method === "POST") {
                await api.updateFromUpstream(id)
                sendJson(response, 200, { ok: true })
              } else {
                sendError(response, new Error(`unsupported method ${method}`))
              }
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
