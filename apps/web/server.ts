/**
 * The hub's server: every bridge on one loopback listener, plus the built page
 * when there is one to serve.
 *
 * This is the carrier every environment shares. Development runs it too — Vite
 * serves the source with HMR on its own port and proxies `/hub` here (see
 * `scripts/dev.ts` at the repository root) — so a handler is exercised the same
 * way before and after a build, and a desktop or command-line form is handed
 * this server rather than a third implementation of the same routes.
 *
 * Usage:
 *   node apps/web/server.ts [--port <n>] [--host <addr>] [--folder <path>]
 *                           [--static <dir>] [--home <dir>]
 *   context-hub [--port <n>] ...   (compiled binary; serves its embedded page)
 *
 * `--port 0` lets the OS choose, which is what a desktop host wants: it reports
 * the bound port back over its own channel. Without `--static` this answers on
 * its routes only, which is what development needs; a compiled binary instead
 * serves the page embedded beside it.
 */
import { existsSync } from "node:fs"
import path from "node:path"

import manifest from "../../package.json" with { type: "json" }

import { isShutdownMessage } from "./shutdown.ts"

import {
  createAboutHandler,
  createAssetHandler,
  createExtensionHandler,
  createNetHandler,
  createPlaceFileHandler,
  createStateHandler,
  createWorkspaceHandler,
} from "@context-hub/core/handlers"
import { createHubServer, type HubServerOptions } from "@context-hub/core/host/server"
import { createMcpHandler } from "@context-hub/mcp/handlers"
import { createPluginHandler } from "@context-hub/plugins/handlers"
import { createPromptHandler } from "@context-hub/prompts/handlers"
import { createSkillHandler } from "@context-hub/skills/handlers"
import { createVariableHandler } from "@context-hub/variables/handlers"

/** One flag and the value it takes, or `true` when it takes none. */
function flags(argv: readonly string[]): Map<string, string | true> {
  const found = new Map<string, string | true>()
  for (let at = 0; at < argv.length; at += 1) {
    const arg = argv[at]
    if (arg === undefined || !arg.startsWith("--")) continue
    const next = argv[at + 1]
    if (next === undefined || next.startsWith("--")) {
      found.set(arg.slice(2), true)
      continue
    }
    found.set(arg.slice(2), next)
    at += 1
  }
  return found
}

/** One flag's value as a path, or nothing when it was not given. */
function pathOf(found: Map<string, string | true>, name: string): string | undefined {
  const value = found.get(name)
  return typeof value === "string" && value !== "" ? value : undefined
}

/**
 * The built page embedded beside a compiled entry, if this process is one.
 *
 * `--asset dist` places it under Bun's virtual directory, which `import.meta.dir`
 * names. The `process.versions.bun` guard keeps a plain `node server.ts` from
 * silently serving a stale `dist/`: only a compiled binary falls back here.
 */
function embeddedRoot(): string | undefined {
  if (process.versions.bun === undefined) return undefined
  const here = (import.meta as ImportMeta & { dir?: string }).dir
  if (here === undefined) return undefined
  const root = path.join(here, "dist")
  return existsSync(path.join(root, "index.html")) ? root : undefined
}

const given = flags(process.argv.slice(2))

/* An unknown flag is a mistake worth naming: silently ignoring it would look
   like the option had no effect. */
const KNOWN = new Set(["port", "host", "folder", "static", "home", "help"])
for (const name of given.keys()) {
  if (!KNOWN.has(name)) {
    console.error(`hub server: unknown option --${name}`)
    console.error(`known: ${[...KNOWN].map((one) => `--${one}`).join(" ")}`)
    process.exit(2)
  }
}

if (given.has("help")) {
  console.log("usage: context-hub [--port <n>] [--host <addr>] [--folder <path>] [--static <dir>] [--home <dir>]")
  process.exit(0)
}

const portText = given.get("port")
if (portText !== undefined && typeof portText === "string" && !/^\d+$/.test(portText)) {
  console.error(`hub server: --port takes a number, got ${JSON.stringify(portText)}`)
  process.exit(2)
}

const placed = {
  ...(pathOf(given, "home") === undefined ? {} : { home: pathOf(given, "home") as string }),
  ...(pathOf(given, "folder") === undefined ? {} : { folder: pathOf(given, "folder") as string }),
}
const root = pathOf(given, "static") ?? embeddedRoot()

/* The repository's root manifest is the one release version: About, the
   installer and the update feed all name it. It is a JSON import so every
   carrier — `node server.ts`, the esbuild bundle, and the Bun compiled binary
   — reads the same value without depending on a file beside the executable. */
const version = typeof manifest.version === "string" ? manifest.version : "0.0.0"

const options: HubServerOptions = {
  /* The order the dev server mounted them in, kept: a route that answers on one
     carrier has to answer on the other. */
  middlewares: [
    createAssetHandler(placed),
    createStateHandler({ ...placed, log: (message) => console.warn(message) }),
    createAboutHandler({ version, ...placed }),
    createExtensionHandler(placed),
    createWorkspaceHandler(placed),
    createNetHandler(),
    createSkillHandler(placed),
    createPlaceFileHandler(placed),
    createMcpHandler(placed),
    createPluginHandler(placed),
    createPromptHandler(placed),
    createVariableHandler(placed),
  ],
  ...(portText === undefined ? {} : { port: Number(portText) }),
  ...(pathOf(given, "host") === undefined ? {} : { host: pathOf(given, "host") as string }),
  ...(root === undefined ? {} : { static: { root } }),
}

const listener = await createHubServer(options).listen()
console.log(`context hub server listening on ${listener.url}`)
if (root !== undefined) console.log(`serving the built page from ${root}`)

/* A carrier that spawned this process says when to stop. Electron's utility
   process sends the message through `process.parentPort`; a plain child uses
   signals. Both close the listener exactly once. */
type ParentPort = {
  on(event: "message", listener: (event: unknown) => void): void
}

const parentPort = (process as NodeJS.Process & { parentPort?: ParentPort }).parentPort
let closing = false

async function shutdown(): Promise<void> {
  if (closing) return
  closing = true
  await listener.close()
  process.exit(0)
}

if (parentPort !== undefined) {
  parentPort.on("message", (event) => {
    if (isShutdownMessage(event)) void shutdown()
  })
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void shutdown())
}
