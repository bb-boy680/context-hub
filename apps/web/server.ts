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
 *
 * `--port 0` lets the OS choose, which is what a desktop host wants: it reports
 * the bound port back over its own channel. Without `--static` this answers on
 * its routes only, which is what development needs.
 */
import { promises as fs } from "node:fs"

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
  console.log("usage: node apps/web/server.ts [--port <n>] [--host <addr>] [--folder <path>] [--static <dir>] [--home <dir>]")
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
const root = pathOf(given, "static")

/* This server's own manifest is the version the About row shows. */
const manifest = JSON.parse(
  await fs.readFile(new URL("./package.json", import.meta.url), "utf8")
) as { version?: unknown }
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
  ],
  ...(portText === undefined ? {} : { port: Number(portText) }),
  ...(pathOf(given, "host") === undefined ? {} : { host: pathOf(given, "host") as string }),
  ...(root === undefined ? {} : { static: { root } }),
}

const listener = await createHubServer(options).listen()
console.log(`context hub server listening on ${listener.url}`)
if (root !== undefined) console.log(`serving the built page from ${root}`)

/* A form that spawned this process says when to stop. */
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void listener.close().then(() => process.exit(0))
  })
}
