/**
 * A test server for the Extensions page's marketplace section.
 *
 * It mounts the real state, extension and market handlers on an isolated home,
 * serves the built page, and injects an index so the test needs no network.
 * The `/hub/` fallback answers JSON 404 for routes this server does not mount:
 * without it the static fallback would hand `index.html` to `/hub/skills` and
 * the page would believe a library exists.
 *
 * Usage: node apps/web/__test__/e2e-server.ts --home <dir> [--folder <dir>]
 *        [--port <n>] [--market <index.json|checkout>]
 */
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  createAboutHandler,
  createExtensionHandler,
  createExtensionMarketHandler,
  createStateHandler,
  createWorkspaceHandler,
} from "@context-hub/core/handlers"
import { createMarketReader } from "@context-hub/core/host/extension-market"
import { createHubServer } from "@context-hub/core/host/server"

function flag(name: string): string | undefined {
  const at = process.argv.indexOf(name)
  return at === -1 ? undefined : process.argv[at + 1]
}

const home = flag("--home")
const folder = flag("--folder")
const port = Number(flag("--port") ?? "5283")
const market = flag("--market") ?? process.env.MARKET_SOURCE

if (home === undefined) {
  console.error("--home is required")
  process.exit(2)
}

/* The market reader is the real one. The page always asks for
   OFFICIAL_MARKET_URL; when --market names a local index, this reader ignores
   that URL and reads the checkout instead, so the probe needs no network. */
const marketReader = market === undefined ? null : createMarketReader()
const marketIndex = market === undefined ? null : path.resolve(market)
/* The page reads this at startup and compares every package's engines to it. */
const version = "0.1.0"
const server = createHubServer({
  middlewares: [
    createStateHandler({ home, log: () => undefined }),
    createAboutHandler({ version, home }),
    createExtensionHandler({ home }),
    createExtensionMarketHandler({
      home,
      version,
      ...(marketReader === null || marketIndex === null
        ? {}
        : { reader: { read: () => marketReader.read(marketIndex) } }),
    }),
    createWorkspaceHandler({
      home,
      ...(folder === undefined ? {} : { folder }),
    }),
    (request, response, next) => {
      const url = new URL(request.url ?? "/", "http://localhost")
      if (!url.pathname.startsWith("/hub/")) {
        next()
        return
      }
      response.writeHead(404, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ error: "not found" }))
    },
  ],
  static: { root: fileURLToPath(new URL("../dist", import.meta.url)) },
  log: (message) => console.log(message),
  ...(Number.isFinite(port) ? { port } : {}),
})

const listener = await server.listen()
console.log(listener.url)

/* Keep the process alive until the carrier stops it. */
await new Promise<void>(() => undefined)
