/**
 * The skill library's host half, as one request handler. The disk-backed store
 * lives in the process that owns the files; this puts it behind whichever
 * carrier is running, so a form reaches it however it is delivered. It is not a
 * Vite plugin: the dev server, the built form's own server and a desktop child
 * process all mount the same handler.
 *
 * Media files are served by the asset bridge, which owns that directory; this
 * one only records and drops the references a skill holds.
 */
import { createAssetStore } from "@context-hub/core"
import type { AssetSink, AssetStore } from "@context-hub/core"
import { createFsAssetLibrary } from "@context-hub/core/host"
import { hostFolder } from "@context-hub/core/host/fs-browse"
import { resolveHubHome } from "@context-hub/core/host/home"
import {
  readBody,
  sendError,
  sendJson,
  type HubMiddleware,
} from "@context-hub/core/host/http"

import { createFsSkillStore } from "./src/host/skills-fs.ts"
import {
  SKILL_ROUTE,
  type SkillOrigin,
  type SkillPatch,
  type SkillPlaceRef,
  type SkillStore,
} from "./src/store.ts"

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

/**
 * The path under one route, or null when this handler does not own the request.
 *
 * `""` is the route itself. Requiring the separator is what keeps a path that
 * merely starts with the same letters — `/hub/skillsXYZ` — from being read as
 * this route carrying a skill name of `XYZ`.
 */
function under(route: string, pathname: string): string | null {
  if (pathname === route) return ""
  if (!pathname.startsWith(`${route}/`)) return null
  return pathname.slice(route.length + 1)
}

/**
 * Exposes the skill library.
 *
 * @param options.home — the hub home; skills live in `<home>/skills` and their files in `<home>/assets`.
 * @param options.folder — the folder this host works in, when it is not the one the process is started from.
 * @param options.sinks — places this form keeps assets besides the hub's own directory, such as a bucket a plugin uploads to.
 * @param options.assets — a store to use instead of one over `<home>/assets`, for a form that keeps assets its own way.
 */
export function createSkillHandler(
  options: {
    home?: string
    folder?: string
    sinks?: readonly AssetSink[]
    assets?: AssetStore
  } = {}
): HubMiddleware {
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

  return async (request, response, next) => {
    const url = new URL(request.url ?? "/", "http://localhost")
    const rest = under(SKILL_ROUTE, url.pathname)
    if (rest === null) {
      next()
      return
    }
    const method = request.method ?? "GET"
    /* A read names the place in its query; a write names it in its body,
       because the name it acts on travels there too. */
    const queryRef = () =>
      placeRef(url.searchParams.get("scope"), url.searchParams.get("dir"))
    const bodyRef = (body: { scope?: unknown; dir?: unknown }) =>
      placeRef(body.scope, body.dir)
    const asked = url.searchParams.get("action")

    try {
      const api = await getStore()

      /* Two addresses, and only two: the route itself, and one skill by name. A
         path is where a thing is, not what to do with it, so everything else
         names its action — in the query for a read, in the body for a write. */
      if (rest.includes("/")) throw new Error(`unknown route ${url.pathname}`)
      const name = rest === "" ? "" : decodeURIComponent(rest)

      if (method === "GET") {
        if (name !== "") {
          sendJson(response, 200, await api.get(name))
          return
        }

        switch (asked) {
          /* No action at all is the catalog page, which is what a page draws
             when it opens. */
          case null: {
            const enabled = url.searchParams.get("enabled")
            const wanted = url.searchParams.get("source")
            sendJson(
              response,
              200,
              await api.list({
                offset: Number(url.searchParams.get("offset") ?? 0),
                limit:
                  url.searchParams.get("limit") === null
                    ? undefined
                    : Number(url.searchParams.get("limit")),
                q: url.searchParams.get("q") ?? undefined,
                tag: url.searchParams.get("tag") ?? undefined,
                enabled: enabled === null ? undefined : enabled === "true",
                source: ORIGINS.find((origin) => origin === wanted),
                sort: url.searchParams.get("sort") === "name" ? "name" : "updated",
              })
            )
            return
          }

          /* What one place holds. */
          case "place":
            sendJson(response, 200, await api.placeSkills(queryRef()))
            return

          /* One skill, read in place rather than out of the library. */
          case "place-skill":
            sendJson(
              response,
              200,
              await api.placeSkill(requiredText(url.searchParams.get("name"), "skill name"), queryRef())
            )
            return

          case "place-file": {
            const skill = requiredText(url.searchParams.get("name"), "place file")
            const file = requiredText(url.searchParams.get("path"), "place file")
            sendJson(response, 200, { text: await api.placeFile(skill, file, queryRef()) })
            return
          }

          /* One file of a skill the library holds. Which skill and which file
             are named rather than addressed, so a name with a slash in it — or
             a space, or a `#` — is simply encoded. */
          case "file": {
            const skill = requiredText(url.searchParams.get("name"), "skill name")
            const file = requiredText(url.searchParams.get("path"), "skill file")
            sendJson(response, 200, { text: await api.readFile(skill, file) })
            return
          }

          /* Every category in use, for the filter row. */
          case "tags":
            sendJson(response, 200, await api.tags())
            return

          /* What a package offers, before anything is written to disk. */
          case "package":
            sendJson(
              response,
              200,
              await api.listPackage(requiredText(url.searchParams.get("source"), "package source"))
            )
            return

          default:
            throw new Error(`unknown action: ${asked}`)
        }
      }

      if (method !== "POST") {
        sendError(response, new Error(`unsupported method ${method}`), 405)
        return
      }

      /* Uploaded bytes are the body itself rather than base64 in JSON, so this
         is the one call that cannot name its action in the body. */
      if (asked === "put-asset") {
        const skill = requiredText(url.searchParams.get("name"), "skill name")
        /* The uploaded file's own name rides under its own key: `name` already
           means the skill the bytes belong to. */
        const fileName = requiredText(url.searchParams.get("file"), "asset file name")
        const bytes = await readBody(request)
        const part = new Uint8Array(bytes.byteLength)
        part.set(bytes)
        const file = new File([part], fileName, { type: request.headers["content-type"] ?? "" })
        sendJson(response, 200, await api.putAsset(skill, file))
        return
      }

      const body = JSON.parse((await readBody(request)).toString("utf8")) as Record<string, unknown>

      switch (body.action) {
        /* Rebuild the catalog from disk, which is the one read that has to be
           asked for again rather than served from what is held. */
        case "refresh":
          await api.refresh()
          sendJson(response, 200, { ok: true })
          return

        /* Ask every recorded source. */
        case "check-updates":
          sendJson(response, 200, await api.checkUpdates())
          return

        /* One skill's source, asked on its own. This one writes: the answer is
           recorded on the row, so asking changes what the next page reads. */
        case "check-update":
          sendJson(response, 200, await api.checkUpdate(requiredText(body.name, "skill name")))
          return

        /* Download from a package, and take over the skills a folder read. */
        case "install":
          sendJson(
            response,
            200,
            await api.installPackage(
              requiredText(body.source, "package source"),
              stringsOf(body.skills)
            )
          )
          return

        case "import":
          sendJson(response, 200, await api.importFolder(folderSkills(body.skills)))
          return

        case "create":
          sendJson(
            response,
            200,
            await api.create({
              name: requiredText(body.name, "skill name"),
              description: requiredText(body.description, "skill description"),
              tags: stringsOf(body.tags),
            })
          )
          return

        /* A field the body omits is left as it is. */
        case "update": {
          const patch: SkillPatch = {}
          if (body.description !== undefined) {
            patch.description = requiredText(body.description, "skill description")
          }
          if (body.tags !== undefined) patch.tags = stringsOf(body.tags)
          if (typeof body.enabled === "boolean") patch.enabled = body.enabled
          sendJson(response, 200, await api.update(requiredText(body.name, "skill name"), patch))
          return
        }

        case "remove":
          await api.remove(requiredText(body.name, "skill name"))
          sendJson(response, 200, { ok: true })
          return

        /* Install what the source holds now over the copy here. */
        case "update-from-upstream":
          await api.updateFromUpstream(requiredText(body.name, "skill name"))
          sendJson(response, 200, { ok: true })
          return

        /* Record a pasted address, as opposed to uploaded bytes. */
        case "add-asset-source":
          sendJson(
            response,
            200,
            await api.addAssetSource(
              requiredText(body.name, "skill name"),
              requiredText(body.source, "source")
            )
          )
          return

        case "delete-asset":
          await api.deleteAsset(
            requiredText(body.name, "skill name"),
            requiredText(body.ref, "asset reference")
          )
          sendJson(response, 200, { ok: true })
          return

        /* Write one file inside a skill. */
        case "write-file":
          await api.writeFile(
            requiredText(body.name, "skill name"),
            requiredText(body.path, "skill file"),
            typeof body.text === "string" ? body.text : ""
          )
          sendJson(response, 200, { ok: true })
          return

        /* Link one library skill into a place, or adopt one out of it. */
        case "install-place":
          sendJson(response, 200, {
            mode: await api.installInto(requiredText(body.name, "skill name"), bodyRef(body)),
          })
          return

        case "adopt-place":
          sendJson(response, 200, {
            mode: await api.adoptFrom(requiredText(body.name, "skill name"), bodyRef(body)),
          })
          return

        case "delete-place":
          await api.deleteInPlace(requiredText(body.name, "skill name"), bodyRef(body))
          sendJson(response, 200, { ok: true })
          return

        case "remove-place":
          await api.removeFrom(requiredText(body.name, "skill name"), bodyRef(body))
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

/** A field a body carries, refused when it is missing or not a string. */
function requiredText(value: unknown, what: string): string {
  if (typeof value !== "string" || value === "") throw new Error(`missing ${what}`)
  return value
}

/** The strings a body carries, with anything that is not one dropped. */
function stringsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string")
}

/** The skills a folder read produced; a list this route cannot read is refused. */
function folderSkills(value: unknown): { name: string; files: { path: string; base64: string }[] }[] {
  if (!Array.isArray(value)) throw new Error("missing folder skills")
  return value.filter(
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
}
