/**
 * Development: rebuild the main and preload bundles on change and restart
 * Electron.
 *
 * `build.ts` still does one build for packaging. Here the same esbuild options
 * run in watch mode; a successful rebuild is followed by an Electron restart so
 * carrier changes take effect without a manual relaunch.
 *
 * The page itself is served by Vite from `apps/web/dev.ts`, which this script
 * starts when nothing is listening yet (or reuses, when `pnpm dev` already
 * started it). That makes source edits reach the window through HMR; the hub
 * server is that dev server's child, so `server.ts` edits need a restart of
 * this watcher. `CONTEXT_HUB_DEV_URL` still overrides where the window points.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { createRequire } from "node:module"
import net from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { context, type BuildContext, type Plugin } from "esbuild"

import { DEV_APP_PORT } from "../web/hub-port.ts"
import { buildBundles, mainBuildOptions, preloadBuildOptions } from "./bundle.ts"
import { RESTART_EXIT_CODE } from "./src/restart.ts"

const here = path.dirname(fileURLToPath(import.meta.url))
const webDir = path.resolve(here, "..", "web")
const RESTART_DEBOUNCE_MS = 250
const KILL_TIMEOUT_MS = 3000
/* `pnpm dev` starts apps/web at the same moment as this script; waiting a
   moment lets us reuse that server instead of racing it for the same ports. */
const SIBLING_START_GRACE_MS = 1500
const DEV_SERVER_TIMEOUT_MS = 30_000

const externalDevUrl = process.env.CONTEXT_HUB_DEV_URL
const devUrl = externalDevUrl ?? `http://localhost:${DEV_APP_PORT}`

let child: ChildProcess | null = null
let webDev: ChildProcess | null = null
let restarting = false
let queued = false
let stopping = false
let restartTimer: NodeJS.Timeout | null = null
const watchers: BuildContext[] = []

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/** Answer whether something accepts a connection on the port right now. */
function reachable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "localhost" })
    const done = (open: boolean): void => {
      socket.destroy()
      resolve(open)
    }
    socket.setTimeout(1000, () => done(false))
    socket.once("connect", () => done(true))
    socket.once("error", () => done(false))
  })
}

async function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (await reachable(port)) return true
    if (Date.now() >= deadline) return false
    await delay(200)
  }
}

/** Start the page's dev server; the hub server is its child. */
function startWebDev(): void {
  console.log("desktop dev: starting the web dev server")
  const running = spawn(process.execPath, [path.join(webDir, "dev.ts")], {
    cwd: webDir,
    stdio: "inherit",
  })
  webDev = running
  running.once("exit", (code) => {
    if (webDev === running) webDev = null
    if (stopping) return
    /* Losing the port race to another dev server is fine: the window can use
       that one. Only stop when nothing is serving the page. */
    void reachable(DEV_APP_PORT).then((up) => {
      if (stopping || up) return
      console.error(`web dev server exited with code ${code ?? "?"}; stopping`)
      void stop(code ?? 1)
    })
  })
}

/** Kill only the process this script spawned, including its children. */
function killTree(target: ChildProcess): void {
  if (target.pid === undefined) return
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(target.pid), "/T", "/F"], { stdio: "ignore" })
    return
  }
  target.kill("SIGKILL")
}

function spawnElectron(): void {
  if (stopping) return
  console.log("desktop dev: starting Electron")
  const require = createRequire(import.meta.url)
  const electron = require("electron") as string
  const running = spawn(electron, [here], {
    cwd: here,
    stdio: "inherit",
    env: {
      ...process.env,
      CONTEXT_HUB_DEV_WATCH: "1",
      CONTEXT_HUB_DEV_URL: devUrl,
    },
  })
  child = running

  running.once("exit", (code) => {
    if (child !== running) return
    child = null
    if (stopping) return
    if (restarting) {
      restarting = false
      spawnElectron()
      if (queued) {
        queued = false
        scheduleRestart()
      }
      return
    }
    /* The menu asks the watcher for a fresh process instead of relaunching
       itself, so this script keeps ownership of the child. */
    if (code === RESTART_EXIT_CODE) {
      spawnElectron()
      return
    }
    void stop(code ?? 1)
  })
}

function restartElectron(): void {
  if (stopping) return
  if (restarting) {
    queued = true
    return
  }
  if (child === null) {
    spawnElectron()
    return
  }

  const target = child
  restarting = true
  console.log("desktop dev: restarting Electron")
  const timer = setTimeout(() => {
    /* A child that already exited was replaced by the exit handler. */
    if (child === target) killTree(target)
  }, KILL_TIMEOUT_MS)
  target.once("exit", () => clearTimeout(timer))
  target.kill()
}

function scheduleRestart(): void {
  if (stopping) return
  if (restartTimer !== null) clearTimeout(restartTimer)
  restartTimer = setTimeout(() => {
    restartTimer = null
    restartElectron()
  }, RESTART_DEBOUNCE_MS)
}

/** Skip the watcher's own first build: the initial `buildBundles` covered it. */
function restartPlugin(name: string): Plugin {
  let first = true
  return {
    name,
    setup(build) {
      build.onEnd((result) => {
        if (result.errors.length > 0) return
        if (first) {
          first = false
          return
        }
        scheduleRestart()
      })
    },
  }
}

async function stop(code: number): Promise<void> {
  if (stopping) return
  stopping = true
  if (restartTimer !== null) {
    clearTimeout(restartTimer)
    restartTimer = null
  }
  await Promise.all(watchers.map((watcher) => watcher.dispose().catch(() => undefined)))
  watchers.length = 0

  /* The hub server is this child's own child; on Windows only a tree kill
     reaches it, elsewhere `apps/web/dev.ts` handles SIGTERM and stops both. */
  const runningWeb = webDev
  webDev = null
  if (runningWeb !== null) {
    if (process.platform === "win32") killTree(runningWeb)
    else runningWeb.kill()
  }

  const running = child
  child = null
  if (running !== null) {
    const exited = new Promise<void>((resolve) => running.once("exit", () => resolve()))
    running.kill()
    await Promise.race([exited, delay(KILL_TIMEOUT_MS)])
    if (running.exitCode === null && running.signalCode === null) killTree(running)
  }
  process.exit(code)
}

process.on("SIGINT", () => void stop(0))
process.on("SIGTERM", () => void stop(0))

/* Start (or reuse) the page's dev server first so it warms up while the
   bundles build. With an explicit `CONTEXT_HUB_DEV_URL` the caller owns it. */
if (externalDevUrl === undefined) {
  if (await waitForPort(DEV_APP_PORT, SIBLING_START_GRACE_MS)) {
    console.log(`desktop dev: reusing the dev server on port ${DEV_APP_PORT}`)
  } else {
    startWebDev()
  }
}

await buildBundles()

if (
  externalDevUrl === undefined &&
  !(await waitForPort(DEV_APP_PORT, DEV_SERVER_TIMEOUT_MS))
) {
  console.error(`desktop dev: nothing answered on port ${DEV_APP_PORT}`)
  await stop(1)
}

const mainWatcher = await context({
  ...mainBuildOptions,
  plugins: [restartPlugin("main-watch")],
})
const preloadWatcher = await context({
  ...preloadBuildOptions,
  plugins: [restartPlugin("preload-watch")],
})
watchers.push(mainWatcher, preloadWatcher)

console.log("desktop dev: watching main and preload bundles")
await Promise.all([mainWatcher.watch(), preloadWatcher.watch()])
spawnElectron()
