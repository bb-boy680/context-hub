/**
 * Development: the hub's own server, with the page's source served beside it.
 *
 * Two processes, because that is what every other environment is too — a built
 * form and a desktop or command-line form all run `server.ts` and nothing else.
 * Vite serves the source with HMR on its own port and forwards `/hub` to the
 * server (see `vite.config.ts`), so the app's requests are relative either way
 * and a route that answers here answers after a build.
 *
 * Started by `pnpm dev` through turbo; stop it with Ctrl-C, which stops both.
 */
import { spawn, type ChildProcess } from "node:child_process"
import { fileURLToPath } from "node:url"
import path from "node:path"

import { createServer } from "vite"
import type { ViteDevServer } from "vite"

import { DEV_APP_PORT, DEV_HUB_PORT } from "./hub-port.ts"

const appDir = path.dirname(fileURLToPath(import.meta.url))

let hub: ChildProcess | null = null
let vite: ViteDevServer | null = null
let stopping = false

/** Stop both halves once; whichever one asks, the other goes down with it. */
async function stop(code: number): Promise<void> {
  if (stopping) return
  stopping = true
  await vite?.close().catch(() => undefined)
  hub?.kill()
  process.exit(code)
}

process.on("SIGINT", () => void stop(0))
process.on("SIGTERM", () => void stop(0))

/* The server is a real child process rather than something called in here, so
   development exercises the same entry and the same options a form will. */
hub = spawn(process.execPath, [
  path.join(appDir, "server.ts"),
  "--port",
  String(DEV_HUB_PORT),
], { cwd: appDir, stdio: "inherit" })

/* A server that died on its own leaves the dev server forwarding to nowhere,
   which reads as every route failing; say so and stop rather than serve that. */
hub.on("exit", (code) => {
  if (stopping) return
  console.error(`hub server exited with code ${code ?? "?"}; stopping the dev server`)
  void stop(code ?? 1)
})

/* Both ports are pinned, so stopping this project's processes is never a guess
   about whose port a number is. Only the hub server has to be stopped by hand:
   it is a child of this process, and its exit takes Vite down with it. */
vite = await createServer({
  server: { port: DEV_APP_PORT, strictPort: true },
})
await vite.listen()
vite.printUrls()
