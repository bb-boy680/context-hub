/**
 * The desktop carrier.
 *
 * Electron starts the hub as a utility process and shows the page that process
 * serves, so the desktop form runs the same server, routes and built page as
 * every other environment. The server reports the port it bound on stdout; the
 * window is not created until that line arrives.
 *
 * Closing the window hides it to the tray instead of stopping the hub: the
 * point of running it in the background is that its agents keep answering.
 * Quit from the tray menu or the platform's quit command.
 */
import { existsSync } from "node:fs"
import path from "node:path"

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  shell,
  Tray,
  utilityProcess,
} from "electron"
import type { UtilityProcess } from "electron"

import {
  APP_LANGUAGE_CHANNEL,
  APP_MENU_ACTION_CHANNEL,
  APP_MENU_CHANNEL,
  DESKTOP_INFO_CHANNEL,
  PICK_FOLDER_CHANNEL,
  TITLEBAR_HEIGHT,
  UPDATE_CHANGED_CHANNEL,
  UPDATE_START_CHANNEL,
  UPDATE_STATE_CHANNEL,
  WINDOW_CLOSE_CHANNEL,
  WINDOW_MAXIMIZE_CHANNEL,
  WINDOW_MINIMIZE_CHANNEL,
  WINDOW_STATE_CHANNEL,
  type DesktopMenuAction,
} from "./bridge.ts"
import {
  appMenuTemplate,
  trayMenuTemplate,
  type AppMenuOptions,
} from "./app-menu.ts"
import { appendTail, tailOf, writeCrashLog } from "./crash-log.ts"
import { applicationMenuTemplate, type MenuActions } from "./menu.ts"
import { RESTART_EXIT_CODE } from "./restart.ts"
import { serverUrlFrom } from "./server-output.ts"
import { createUpdater, type Updater } from "./update.ts"

let server: UtilityProcess | null = null
let window: BrowserWindow | null = null
let tray: Tray | null = null
let updates: Updater | null = null
let loadedUrl: string | null = null
/* The page's language, mirrored here so the tray follows it. */
let menuZh = false
let quitting = false
let serverStopping = false
let stopping: Promise<void> | null = null
let stdoutTail = ""
let stderrTail = ""
/* The folder dialog in flight, so a second ask joins it instead of opening another. */
let picking: Promise<string | null> | null = null

const TAIL_BYTES = 64 * 1024
const DIALOG_TAIL_BYTES = 2 * 1024

/** Where the built page lives in each form. */
function webRoot(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "web")
    : path.resolve(app.getAppPath(), "..", "web", "dist")
}

/** The bundled server: beside the app in development, in resources when packaged. */
function serverEntry(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "server.mjs")
    : path.join(app.getAppPath(), "dist", "server.mjs")
}

/** Say what went wrong and stop; a desktop app cannot report to a console. */
function report(message: string): void {
  dialog.showErrorBox("Context Hub", message)
  app.quit()
}

/**
 * Write the failure beside the platform's logs and answer the text a dialog
 * shows: the message, the log path, and the end of the server's stderr.
 */
function describeFailure(source: string, message: string, error?: unknown): string {
  const written = writeCrashLog({
    dir: app.getPath("logs"),
    source,
    error: error ?? new Error(message),
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    packaged: app.isPackaged,
    stdoutTail,
    stderrTail,
  })
  const tail = tailOf(stderrTail, DIALOG_TAIL_BYTES)
  return [
    message,
    `log: ${written ?? "unavailable"}`,
    ...(tail === "" ? [] : ["", tail]),
  ].join("\n")
}

function fail(source: string, message: string, error?: unknown): void {
  report(describeFailure(source, message, error))
}

/**
 * Ask the hub to close, then end it if it does not. Every quit, restart and
 * update-install path goes through here so no request is cut off silently.
 */
function stopServer(timeoutMs = 3000): Promise<void> {
  if (stopping !== null) return stopping
  const child = server
  if (child === null) return Promise.resolve()

  serverStopping = true
  stopping = new Promise<void>((resolve) => {
    let settled = false
    let forced = false
    const finish = (): void => {
      if (settled) return
      settled = true
      if (server === child) server = null
      serverStopping = false
      stopping = null
      resolve()
    }
    const killTimer = setTimeout(() => {
      forced = true
      if (!settled) child.kill()
    }, timeoutMs)
    const forceTimer = setTimeout(finish, timeoutMs + 1000)
    child.once("exit", () => {
      clearTimeout(killTimer)
      clearTimeout(forceTimer)
      if (forced) console.warn("desktop: the hub server did not stop before the timeout")
      finish()
    })
    try {
      child.postMessage({ type: "shutdown" })
    } catch {
      child.kill()
    }
  })
  return stopping
}

/** Start the hub and answer with the origin it is listening on. */
function startServer(): Promise<string> {
  return new Promise((resolve, reject) => {
    const root = webRoot()
    if (!existsSync(path.join(root, "index.html"))) {
      reject(new Error(`the built page is missing at ${root}; run pnpm build first`))
      return
    }

    /* The working directory is the person's home, not the app's install
       directory: the workspace store falls back to the process directory when
       no folder was chosen, and a shortcut would otherwise name system32. */
    const child = utilityProcess.fork(serverEntry(), ["--port", "0", "--static", root], {
      cwd: app.getPath("home"),
      stdio: "pipe",
      serviceName: "Context Hub Server",
    })
    server = child
    stdoutTail = ""
    stderrTail = ""

    let output = ""
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error("the hub server did not report a port within 15s"))
    }, 15_000)

    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString()
      stdoutTail = appendTail(stdoutTail, chunk, TAIL_BYTES)
      const url = serverUrlFrom(output)
      if (url === null) return
      clearTimeout(timer)
      loadedUrl = url
      resolve(url)
    })
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrTail = appendTail(stderrTail, chunk, TAIL_BYTES)
      process.stderr.write(chunk)
    })

    child.on("exit", (code) => {
      clearTimeout(timer)
      if (server === child) server = null
      if (quitting || serverStopping) return
      const message = `the hub server exited with code ${code ?? "?"}`
      if (loadedUrl === null) reject(new Error(message))
      else fail("server", message)
    })
  })
}

/** Show the window, or build one again if it was destroyed. */
function showWindow(): void {
  if (window !== null && !window.isDestroyed()) {
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
    return
  }
  if (loadedUrl !== null) createWindow(loadedUrl)
}

/** Show one window for the given origin, kept inside the app's own pages. */
function createWindow(url: string): void {
  const created = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === "win32"
      ? {
          titleBarStyle: "hidden" as const,
          titleBarOverlay: {
            height: TITLEBAR_HEIGHT,
            color: "#00000000",
            symbolColor: "#7c828a",
          },
        }
      : process.platform === "darwin"
        ? {
            titleBarStyle: "hiddenInset" as const,
            trafficLightPosition: { x: 16, y: 13 },
          }
        : { frame: false }),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  })
  window = created

  const origin = new URL(url).origin

  /* A link to the app itself stays in the window; anything else belongs to the
     person's browser, not to a window that has no address bar. */
  created.webContents.setWindowOpenHandler(({ url: target }) => {
    if (new URL(target).origin === origin) return { action: "allow" }
    void shell.openExternal(target)
    return { action: "deny" }
  })
  created.webContents.on("will-navigate", (event, target) => {
    if (new URL(target).origin === origin) return
    event.preventDefault()
    void shell.openExternal(target)
  })

  /* With a tray available, closing is "hide": the hub keeps running. Without
     one, the window is the only way back, so closing exits as before. */
  created.on("close", (event) => {
    if (quitting || tray === null) return
    event.preventDefault()
    created.hide()
  })
  created.on("closed", () => {
    if (window === created) window = null
  })

  created.once("ready-to-show", () => created.show())

  created.on("maximize", () => {
    if (!created.isDestroyed()) {
      created.webContents.send(WINDOW_STATE_CHANNEL, true)
    }
  })
  created.on("unmaximize", () => {
    if (!created.isDestroyed()) {
      created.webContents.send(WINDOW_STATE_CHANNEL, false)
    }
  })
  created.webContents.on("did-finish-load", () => {
    if (!created.isDestroyed()) {
      created.webContents.send(WINDOW_STATE_CHANNEL, created.isMaximized())
    }
  })

  let handlingRendererGone = false
  created.webContents.on("render-process-gone", (_event, details) => {
    if (quitting) return
    const message = `the page process stopped: ${details.reason} (exit ${details.exitCode})`
    if (details.reason === "clean-exit") {
      writeCrashLog({
        dir: app.getPath("logs"),
        source: "renderer",
        error: new Error(message),
        version: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
        packaged: app.isPackaged,
        stderrTail,
      })
      return
    }
    if (handlingRendererGone) return
    handlingRendererGone = true
    void dialog
      .showMessageBox(created, {
        type: "error",
        title: "Context Hub",
        message: "The page stopped.",
        detail: describeFailure("renderer", message),
        buttons: ["Reload", "Quit"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      })
      .then((answer) => {
        handlingRendererGone = false
        if (answer.response === 0 && !created.isDestroyed()) created.webContents.reload()
        else app.quit()
      })
  })

  void created.loadURL(url).catch((error: Error) => {
    fail("page", `the page did not load: ${error.message}`, error)
  })
}

/** Reload the page in place; without a window, reopen the last one. */
function reloadPage(): void {
  if (window !== null && !window.isDestroyed()) {
    window.webContents.reload()
    return
  }
  showWindow()
}

function toggleDevTools(): void {
  if (window !== null && !window.isDestroyed()) window.webContents.toggleDevTools()
}

/**
 * Restart the application. Under the development watcher the process exits
 * with a code the watcher understands, so it keeps owning the child; a plain
 * `electron .` relaunches itself.
 */
async function restartApp(): Promise<void> {
  if (quitting) return
  quitting = true
  tray?.destroy()
  tray = null
  await stopServer()
  if (process.env.CONTEXT_HUB_DEV_WATCH === "1") {
    app.exit(RESTART_EXIT_CODE)
    return
  }
  app.relaunch()
  app.quit()
}

/** The native menu's callbacks; it has no page-owned rows. */
function menuActions(): MenuActions {
  return {
    reloadPage: () => reloadPage(),
    checkForUpdates: () => updates?.check(true),
    restartApp: () => void restartApp(),
    toggleDevTools: () => toggleDevTools(),
    quit: () => app.quit(),
  }
}

/**
 * The shared rows' callbacks. The title-bar menu and the tray both use them,
 * so a row means the same thing in either place.
 */
function appMenuOptions(zh: boolean): AppMenuOptions {
  return {
    zh,
    updatesEnabled: updates?.enabled === true,
    send: sendPageAction,
    checkForUpdates: () => updates?.check(true),
    restartApp: () => void restartApp(),
    quit: () => app.quit(),
  }
}

/**
 * Run a row whose work belongs to the page. The tray can be used while the
 * window is hidden, so bring it back first; if it is still loading, wait for
 * the main frame instead of dropping the click.
 */
function sendPageAction(action: DesktopMenuAction): void {
  showWindow()
  const target = window
  if (target === null || target.isDestroyed()) return
  if (target.webContents.isLoadingMainFrame()) {
    target.webContents.once("did-finish-load", () => {
      if (!target.isDestroyed()) {
        target.webContents.send(APP_MENU_ACTION_CHANNEL, action)
      }
    })
    return
  }
  target.webContents.send(APP_MENU_ACTION_CHANNEL, action)
}

/** Rebuild the tray rows; the page language can change while it runs. */
function refreshTrayMenu(): void {
  if (tray === null) return
  tray.setContextMenu(
    Menu.buildFromTemplate(
      trayMenuTemplate({
        ...appMenuOptions(menuZh),
        openWindow: () => showWindow(),
      })
    )
  )
}

/** Keep the tray's labels on the page's language. */
function setMenuLanguage(zh: boolean): void {
  if (menuZh === zh) return
  menuZh = zh
  refreshTrayMenu()
}

/** The tray keeps the hub reachable after the window is hidden. */
function createTray(): void {
  const file = process.platform === "darwin" ? "trayTemplate.png" : "tray.png"
  const image = nativeImage.createFromPath(path.join(app.getAppPath(), "assets", file))
  if (image.isEmpty()) return
  if (process.platform === "darwin") image.setTemplateImage(true)

  try {
    tray = new Tray(image)
  } catch {
    /* A desktop without a tray still has its window; keep the old behaviour. */
    return
  }

  tray.setToolTip("Context Hub")
  refreshTrayMenu()
  /* On macOS the menu is the tray's click action; elsewhere a click reopens. */
  if (process.platform !== "darwin") tray.on("click", () => showWindow())
}

/** The dev URL skips the server entirely so Vite can serve the source with HMR. */
async function open(): Promise<void> {
  const devUrl = process.env.CONTEXT_HUB_DEV_URL
  try {
    const url = devUrl ?? (await startServer())
    loadedUrl = url
    createWindow(url)
  } catch (error) {
    fail(
      "startup",
      error instanceof Error ? error.message : String(error),
      error
    )
  }
}

const locked = app.requestSingleInstanceLock()
if (!locked) {
  app.quit()
} else {
  app.on("second-instance", () => showWindow())

  app.on("before-quit", (event) => {
    if (quitting) return
    event.preventDefault()
    quitting = true
    updates?.dispose()
    tray?.destroy()
    tray = null
    void stopServer().finally(() => app.quit())
  })

  app.on("window-all-closed", () => {
    /* With a tray the hub stays up; without one, the old rules apply. */
    if (tray === null && process.platform !== "darwin") app.quit()
  })

  app.on("activate", () => showWindow())

  void app.whenReady().then(() => {
    const updater = createUpdater({
      getWindow: () => window,
      stopServer: () => stopServer(),
      markQuitting: () => {
        quitting = true
        tray?.destroy()
        tray = null
      },
    })
    updates = updater
    ipcMain.handle(DESKTOP_INFO_CHANNEL, () => ({
      version: app.getVersion(),
      platform: process.platform,
      updatesEnabled: updater.enabled,
    }))
    ipcMain.handle(PICK_FOLDER_CHANNEL, (event): Promise<string | null> | null => {
      if (
        window === null ||
        window.isDestroyed() ||
        event.sender !== window.webContents
      ) {
        return null
      }
      if (picking !== null) return picking

      const target = window
      picking = dialog
        .showOpenDialog(target, { properties: ["openDirectory"] })
        .then(({ canceled, filePaths }) =>
          canceled ? null : (filePaths[0] ?? null)
        )
        .catch(() => null)
        .finally(() => {
          picking = null
        })
      return picking
    })
    ipcMain.handle(UPDATE_STATE_CHANNEL, () => updater.state)
    ipcMain.handle(UPDATE_START_CHANNEL, () => updater.update())
    ipcMain.handle(
      APP_MENU_CHANNEL,
      (event, x: unknown, y: unknown, zh: unknown) => {
        if (
          window === null ||
          window.isDestroyed() ||
          event.sender !== window.webContents ||
          typeof x !== "number" ||
          typeof y !== "number" ||
          !Number.isFinite(x) ||
          !Number.isFinite(y)
        ) {
          return undefined
        }
        if (typeof zh === "boolean") setMenuLanguage(zh)
        const target = window
        const zoom = target.webContents.getZoomFactor()
        const menu = Menu.buildFromTemplate(
          appMenuTemplate(appMenuOptions(zh === true))
        )
        return new Promise<void>((resolve) => {
          menu.popup({
            window: target,
            x: Math.round(x * zoom),
            y: Math.round(y * zoom),
            callback: resolve,
          })
        })
      }
    )
    ipcMain.on(APP_LANGUAGE_CHANNEL, (event, zh: unknown) => {
      if (
        window === null ||
        window.isDestroyed() ||
        event.sender !== window.webContents ||
        typeof zh !== "boolean"
      ) {
        return
      }
      setMenuLanguage(zh)
    })
    ipcMain.handle(WINDOW_MINIMIZE_CHANNEL, () => window?.minimize())
    ipcMain.handle(WINDOW_MAXIMIZE_CHANNEL, () => {
      if (window === null || window.isDestroyed()) return
      if (window.isMaximized()) window.unmaximize()
      else window.maximize()
    })
    ipcMain.handle(WINDOW_CLOSE_CHANNEL, () => window?.close())
    updater.subscribe((state) => {
      if (window !== null && !window.isDestroyed()) {
        window.webContents.send(UPDATE_CHANGED_CHANNEL, state)
      }
    })
    const actions = menuActions()
    createTray()
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(
        applicationMenuTemplate({
          platform: process.platform,
          updatesEnabled: updates.enabled,
          dev: !app.isPackaged,
          actions,
        })
      )
    )
    void open()
  })
}
