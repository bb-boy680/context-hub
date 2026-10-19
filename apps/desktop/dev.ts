/**
 * Development: rebuild all bundles on change and restart Electron.
 *
 * `build.ts` still does one build for packaging. Here the same esbuild options
 * run in watch mode; a successful rebuild is followed by an Electron restart so
 * main-process and server changes take effect without a manual relaunch. The
 * page keeps its own HMR when `CONTEXT_HUB_DEV_URL` points at Vite.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { context, type BuildContext, type Plugin } from "esbuild"

import {
  buildBundles,
  mainBuildOptions,
  preloadBuildOptions,
  serverBuildOptions,
} from "./bundle.ts"
import { RESTART_EXIT_CODE } from "./src/restart.ts"

const here = path.dirname(fileURLToPath(import.meta.url))
const RESTART_DEBOUNCE_MS = 250
const KILL_TIMEOUT_MS = 3000

let child: ChildProcess | null = null
let restarting = false
let queued = false
let stopping = false
let restartTimer: NodeJS.Timeout | null = null
const watchers: BuildContext[] = []

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

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
    env: { ...process.env, CONTEXT_HUB_DEV_WATCH: "1" },
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

await buildBundles()

const serverWatcher = await context({
  ...serverBuildOptions,
  plugins: [restartPlugin("server-watch")],
})
const mainWatcher = await context({
  ...mainBuildOptions,
  plugins: [restartPlugin("main-watch")],
})
const preloadWatcher = await context({
  ...preloadBuildOptions,
  plugins: [restartPlugin("preload-watch")],
})
watchers.push(serverWatcher, mainWatcher, preloadWatcher)

console.log("desktop dev: watching main, preload and server bundles")
await Promise.all([
  serverWatcher.watch(),
  mainWatcher.watch(),
  preloadWatcher.watch(),
])
spawnElectron()
