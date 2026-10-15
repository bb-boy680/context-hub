/**
 * Development bridge for the plugin library. The disk-backed library lives in
 * the process that owns the files; this Vite plugin puts it behind the dev
 * server so the browser form can use it during development. Product forms mount
 * the same library themselves — the desktop app in its main process, the
 * executable in its host — so nothing here is a service the app depends on.
 *
 * One route carries everything, because the actions are read-modify-write of the
 * same library and splitting them across routes would only spread that out:
 * reads name their target in the query, writes carry it in the body.
 *
 * Every answer is `no-store`. A pack's files change on update, and a cached
 * module would show the version that was replaced.
 */
import type { IncomingMessage, ServerResponse } from "node:http"

import { createAssetStore, type AssetSink, type AssetStore } from "@workspace/core"
import { createFsAssetLibrary } from "@workspace/core/host"
import { hostFolder } from "@workspace/core/host/fs-browse"
import { resolveHubHome } from "@workspace/core/host/home"
import { createFsWorkspaceStore } from "@workspace/core/host/workspaces"
import { contentTypeOf } from "@workspace/core/vite"

import { createPluginCollector, type PackUpload } from "./src/host/collect.ts"
import { readPackContents } from "./src/host/contents.ts"
import { describePack } from "./src/host/describe.ts"
import {
  createFsPluginLibrary,
  listDirectory,
  readBytesInDirectory,
  readInDirectory,
} from "./src/host/library.ts"
import { writeMarketplaceIndex } from "./src/host/marketplace.ts"
import { hasProgram, runProgram } from "./src/host/program.ts"
import { createPluginProbe } from "./src/host/probe.ts"
import { createPluginUpdater } from "./src/host/update.ts"

/** Route prefix this bridge answers on. */
const PREFIX = "/hub/plugins"

async function readBody(request: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  })
  response.end(body)
}

/** One file's bytes, with the type its extension names and no cache. */
function sendBytes(response: ServerResponse, bytes: Buffer, file: string): void {
  response.writeHead(200, {
    "Content-Type": contentTypeOf(file),
    "Content-Length": bytes.byteLength,
    "Cache-Control": "no-store",
  })
  response.end(bytes)
}

/** One request body read as an object, or an empty one. */
function bodyOf(raw: Buffer): Record<string, unknown> {
  if (raw.length === 0) return {}
  try {
    const parsed: unknown = JSON.parse(raw.toString("utf8"))
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value === "") throw new Error(`missing ${field}`)
  return value
}

/**
 * Vite plugin that exposes the plugin library over the dev server.
 *
 * Every action here serves the library itself: what it holds, what is in it, and
 * the two things an installer needs from a machine — where the library is, and
 * running a program. Which program, and with which arguments, belongs to the
 * agent plugins; nothing in this file names an agent.
 *
 * @param options.home — the hub home; the library is `<home>/plugins`.
 * @param options.sinks — places this form keeps assets besides the hub's own directory, such as a bucket a plugin uploads to.
 * @param options.assets — a store to use instead of one over `<home>/assets`, for a form that keeps assets its own way.
 */
export function pluginLibrary(
  options: { home?: string; sinks?: readonly AssetSink[]; assets?: AssetStore } = {}
) {
  const assets =
    options.assets ??
    createAssetStore(createFsAssetLibrary(resolveHubHome(options.home)), options.sinks ?? [])
  const home = resolveHubHome(options.home)
  const library = createFsPluginLibrary(options.home, assets)
  const collector = createPluginCollector(library)
  const probe = createPluginProbe(library)
  const updater = createPluginUpdater(library)
  let store: ReturnType<typeof createFsWorkspaceStore> | null = null

  /**
   * The folder a client's own commands run in: the workspace in use, else the
   * folder this host runs in.
   *
   * A client resolves its project files against the working directory — Claude
   * Code writes `.claude/settings.json` where it was started — so an install
   * into a workspace has to be started in that workspace. Started here instead,
   * the dev server's own package becomes the project, and the pack lands in
   * `apps/web` rather than in the folder a person picked.
   */
  const startFolder = async (): Promise<string> => {
    store ??= createFsWorkspaceStore(home, { folder: await hostFolder() })
    const page = await store.page()
    const current = page.folders.find((folder) => folder.id === page.current)
    return current?.path ?? (await hostFolder())
  }

  return {
    name: "context-hub-plugin-library",
    configureServer(server: { middlewares: { use: (handler: unknown) => void } }) {
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
          const method = request.method ?? "GET"
          try {
            /* A read names its action in the query; a write names it in the body,
               because the target it acts on travels there too. */
            const sent = method === "GET" ? undefined : bodyOf(await readBody(request))
            const action = method === "GET" ? url.searchParams.get("action") : ((sent?.action as string | undefined) ?? null)

            /* GET /hub/plugins?action=list — every collected pack, and which of
               them have no files: the index is what says a pack was here, so a
               record whose folder is gone is worth fetching again rather than
               dropping. */
            if (method === "GET" && (action === "list" || action === null)) {
              sendJson(response, 200, {
                root: library.root,
                plugins: await library.list(),
                missing: await library.missing(),
              })
              return
            }

            /* One pack's files. `name` reads a pack this hub holds, `dir` reads
               one an agent keeps in place — a pack the hub never collected is
               still a directory with files in it, and its panel reads that. */
            if (method === "GET" && action === "files") {
              const dir = url.searchParams.get("dir")
              sendJson(
                response,
                200,
                dir === null
                  ? await library.files(requiredString(url.searchParams.get("name"), "name"))
                  : await listDirectory(dir)
              )
              return
            }

            /* One file's text, from whichever of the two the caller named. */
            if (method === "GET" && action === "file") {
              const dir = url.searchParams.get("dir")
              const file = requiredString(url.searchParams.get("path"), "path")
              sendJson(response, 200, {
                text:
                  dir === null
                    ? await library.read(requiredString(url.searchParams.get("name"), "name"), file)
                    : await readInDirectory(dir, file),
              })
              return
            }

            /* One file of a pack as it is written, for a document that points at
               the pictures beside it: the same pair of places `file` reads text
               from, answered as the file itself, because an `<img>` needs the
               bytes and the type its extension names. */
            if (method === "GET" && action === "raw") {
              const dir = url.searchParams.get("dir")
              const file = requiredString(url.searchParams.get("path"), "path")
              sendBytes(
                response,
                dir === null
                  ? await library.readBytes(
                      requiredString(url.searchParams.get("name"), "name"),
                      file
                    )
                  : await readBytesInDirectory(dir, file),
                file
              )
              return
            }

            /* What a pack carries inside it: the skills, the commands and the
               MCP servers its own directory holds. A pack the hub collected and
               one an agent keeps in place are read the same way, as its files
               are; none of this is recorded, so the directory is what answers. */
            if (method === "GET" && action === "contents") {
              const dir = url.searchParams.get("dir")
              sendJson(
                response,
                200,
                await readPackContents(
                  dir === null
                    ? library.packDir(requiredString(url.searchParams.get("name"), "name"))
                    : dir
                )
              )
              return
            }

            if (method !== "POST") {
              response.writeHead(405).end()
              return
            }

            const body = sent ?? {}
            switch (action) {
              case "add":
                sendJson(response, 200, await collector.add(requiredString(body.source, "source")))
                return
              /* A folder a person chose, as the files in it. A page cannot name a
                 directory on this machine, so this is the only way a pack that
                 only exists on this machine reaches the library. */
              case "add-folder":
                sendJson(
                  response,
                  200,
                  await collector.addFolder(
                    requiredString(body.name, "name"),
                    uploadsOf(body.files)
                  )
                )
                return
              case "remove":
                await library.remove(requiredString(body.name, "name"))
                sendJson(response, 200, { root: library.root, plugins: await library.list() })
                return
              /* One pack whose files are gone, fetched again from the address
                 its record carries. One pack per request, so a page can run
                 several at once and stop asking about each as it lands. */
              case "restore":
                sendJson(response, 200, await collector.restore(requiredString(body.name, "name")))
                return
              case "tags":
                await library.setTags(
                  requiredString(body.name, "name"),
                  Array.isArray(body.tags) ? body.tags.filter((tag): tag is string => typeof tag === "string") : []
                )
                sendJson(response, 200, { root: library.root, plugins: await library.list() })
                return
              case "check-updates":
                sendJson(response, 200, await probe.checkAll(await library.list()))
                return
              /* One pack, for the panel that is looking at that one. */
              case "check-update":
                sendJson(
                  response,
                  200,
                  await probe.checkOne(await library.list(), requiredString(body.name, "name"))
                )
                return
              case "update":
                sendJson(response, 200, await updater.update(requiredString(body.name, "name")))
                return
              /* Where the library is, for an installer that has to register it. */
              case "root":
                sendJson(response, 200, { root: library.root })
                return
              /* The indexes a client reads, written from the library as it stands. */
              case "sync-marketplace":
                await writeMarketplaceIndex(library.root, await library.list())
                sendJson(response, 200, { root: library.root })
                return
              /* One program an installer asked for, started in the workspace in
                 use. The arguments are a list, so nothing here re-parses them;
                 an exit code other than zero is the program's own answer,
                 reported with what it printed. */
              case "program": {
                const program = requiredString(body.program, "program")
                const args = Array.isArray(body.args)
                  ? body.args.filter((arg): arg is string => typeof arg === "string")
                  : []
                const result = await runProgram(program, args, { cwd: await startFolder() })
                if (result.exitCode !== 0) {
                  sendJson(response, 502, {
                    error: `${program} exited with ${String(result.exitCode)}: ${result.output}`,
                  })
                  return
                }
                sendJson(response, 200, { output: result.output })
                return
              }
              case "program-exists":
                sendJson(response, 200, {
                  present: await hasProgram(requiredString(body.program, "program")),
                })
                return
              /* What a pack says about itself, at a directory an agent named.
                 Its picture is kept in the hub's asset library, so the answer
                 carries a reference there rather than a copy of the bytes. */
              case "describe":
                sendJson(
                  response,
                  200,
                  await describePack(
                    requiredString(body.path, "path"),
                    requiredString(body.name, "name"),
                    assets
                  )
                )
                return
              default:
                sendJson(response, 400, { error: `unknown action: ${String(action)}` })
                return
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            sendJson(response, 400, { error: message })
          }
        }
      )
    },
  }
}

/** The uploads a folder arrives as, read off the wire; an entry the page got wrong is dropped. */
function uploadsOf(value: unknown): PackUpload[] {
  if (!Array.isArray(value)) return []
  const files: PackUpload[] = []
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue
    const held = entry as Record<string, unknown>
    if (typeof held.path !== "string" || typeof held.base64 !== "string") continue
    files.push({ path: held.path, base64: held.base64 })
  }
  return files
}
