/**
 * In-place updates. Only a packaged app with `app-update.yml` has a feed; every
 * other form reports `enabled: false` and the menu omits the action.
 *
 * A check on a timer only publishes the offered version, which the sidebar
 * shows; clicking it downloads and installs without another question. The
 * menu's manual check keeps its dialogs. Installation first stops the hub
 * server through the caller, so a half-written file cannot be left behind by
 * the restart.
 */
import { existsSync } from "node:fs"
import path from "node:path"

import {
  app,
  dialog,
  type BrowserWindow,
  type MessageBoxOptions,
  type MessageBoxReturnValue,
} from "electron"
import { autoUpdater, type ProgressInfo, type UpdateInfo } from "electron-updater"

import {
  applyUpdateEvent,
  initialUpdateState,
  type UpdateEvent,
  type UpdateState,
} from "./update-state.ts"

const CHECK_DELAY_MS = 10_000
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

export interface Updater {
  readonly enabled: boolean
  readonly state: UpdateState
  check(manual: boolean): void
  update(): void
  subscribe(listener: (state: UpdateState) => void): () => void
  dispose(): void
}

export interface UpdaterOptions {
  getWindow: () => BrowserWindow | null
  stopServer: () => Promise<void>
  markQuitting: () => void
}

/** A message box parented to the app window when there is one. */
async function show(
  options: UpdaterOptions,
  message: MessageBoxOptions
): Promise<MessageBoxReturnValue> {
  const window = options.getWindow()
  if (window === null || window.isDestroyed()) return dialog.showMessageBox(message)
  return dialog.showMessageBox(window, message)
}

export function createUpdater(options: UpdaterOptions): Updater {
  const enabled =
    app.isPackaged && existsSync(path.join(process.resourcesPath, "app-update.yml"))
  if (!enabled) {
    return {
      enabled: false,
      state: initialUpdateState,
      check: () => undefined,
      update: () => undefined,
      subscribe: () => () => undefined,
      dispose: () => undefined,
    }
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false
  autoUpdater.logger = console

  let disposed = false
  let checking = false
  let prompting = false
  let installing = false
  let manualCheck = false
  let silentInstall = false
  let downloadedVersion: string | undefined
  let state: UpdateState = initialUpdateState
  const listeners = new Set<(state: UpdateState) => void>()

  const publish = (next: UpdateState): void => {
    state = next
    for (const listener of listeners) listener(state)
  }

  const publishEvent = (event: UpdateEvent): void => {
    publish(applyUpdateEvent(state, event))
  }

  const progress = (percent: number): void => {
    const window = options.getWindow()
    if (window !== null && !window.isDestroyed()) window.setProgressBar(percent)
  }

  const reportError = (error: unknown, manual: boolean): void => {
    progress(-1)
    if (manual) {
      const message = error instanceof Error ? error.message : String(error)
      void show(options, {
        type: "error",
        title: "Update failed",
        message: "The update could not be checked or downloaded.",
        detail: message,
        buttons: ["OK"],
      })
    } else {
      console.error("desktop update:", error)
    }
  }

  /** The sidebar path: no question, restart as soon as the download is done. */
  const installNow = async (): Promise<void> => {
    if (installing) return
    installing = true
    try {
      options.markQuitting()
      await options.stopServer()
      autoUpdater.quitAndInstall(true, true)
    } finally {
      installing = false
    }
  }

  const install = async (version: string): Promise<void> => {
    if (prompting) return
    prompting = true
    try {
      const answer = await show(options, {
        type: "question",
        title: "Update ready",
        message: `Context Hub ${version} is ready to install.`,
        detail: "The application will close and reopen to finish installing.",
        buttons: ["Restart now", "Later"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      })
      if (answer.response !== 0) return
      options.markQuitting()
      await options.stopServer()
      autoUpdater.quitAndInstall(true, true)
    } finally {
      prompting = false
    }
  }

  const askDownload = async (version: string): Promise<void> => {
    if (prompting) return
    prompting = true
    try {
      const answer = await show(options, {
        type: "question",
        title: "Update available",
        message: `Context Hub ${version} is available.`,
        detail: `You have ${app.getVersion()}. Download it now?`,
        buttons: ["Download", "Later"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      })
      if (answer.response !== 0) return
      /* The person asked for this download, so report its failure even when the
         check that found it was automatic. */
      manualCheck = true
      silentInstall = false
      publishEvent({ type: "downloading" })
      progress(0)
      void autoUpdater.downloadUpdate().catch(() => undefined)
    } finally {
      prompting = false
    }
  }

  const onUpdateAvailable = (info: UpdateInfo): void => {
    checking = false
    if (disposed) return
    const manual = manualCheck
    manualCheck = false
    if (downloadedVersion === info.version) {
      publishEvent({ type: "downloaded", version: info.version })
      if (manual) void install(info.version)
      return
    }
    publishEvent({ type: "available", version: info.version })
    if (manual) void askDownload(info.version)
  }

  const onUpdateDownloaded = (info: UpdateInfo): void => {
    manualCheck = false
    progress(-1)
    downloadedVersion = info.version
    publishEvent({ type: "downloaded", version: info.version })
    if (silentInstall) {
      silentInstall = false
      void installNow()
      return
    }
    void install(info.version)
  }

  const onError = (error: Error): void => {
    checking = false
    installing = false
    if (disposed) return
    const manual = manualCheck
    manualCheck = false
    silentInstall = false
    publishEvent({ type: "failed" })
    reportError(error, manual)
  }

  const onNotAvailable = (): void => {
    checking = false
    const manual = manualCheck
    manualCheck = false
    /* A check must not discard a download that is still running or finished. */
    if (state.status !== "downloading" && state.status !== "ready") {
      publishEvent({ type: "none" })
    }
    if (!manual || disposed) return
    void show(options, {
      type: "info",
      title: "No updates",
      message: "You're up to date.",
      detail: `Version ${app.getVersion()}`,
      buttons: ["OK"],
    })
  }

  autoUpdater.on("update-available", onUpdateAvailable)
  autoUpdater.on("update-downloaded", onUpdateDownloaded)
  autoUpdater.on("update-not-available", onNotAvailable)
  autoUpdater.on("error", onError)
  autoUpdater.on("download-progress", (event: ProgressInfo) => {
    progress(event.percent / 100)
    publishEvent({ type: "progress", percent: event.percent })
  })
  autoUpdater.on("update-cancelled", () => {
    manualCheck = false
    silentInstall = false
    progress(-1)
    publishEvent({ type: "failed" })
  })

  const check = (manual: boolean): void => {
    if (disposed || checking || prompting || installing) return
    if (state.status === "downloading") return
    if (downloadedVersion !== undefined) {
      if (manual) void install(downloadedVersion)
      return
    }
    checking = true
    manualCheck = manual
    void autoUpdater.checkForUpdates().catch(() => undefined)
  }

  /** The sidebar action: available starts the download, ready installs. */
  const update = (): void => {
    if (disposed || checking || prompting || installing) return
    if (state.status === "downloading") return
    if (state.status === "ready") {
      void installNow()
      return
    }
    if (state.status !== "available") return
    silentInstall = true
    publishEvent({ type: "downloading" })
    progress(0)
    void autoUpdater.downloadUpdate().catch(() => undefined)
  }

  const subscribe = (listener: (state: UpdateState) => void): (() => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  const firstTimer = setTimeout(() => check(false), CHECK_DELAY_MS)
  const intervalTimer = setInterval(() => check(false), CHECK_INTERVAL_MS)

  return {
    enabled,
    get state() {
      return state
    },
    check,
    update,
    subscribe,
    dispose: () => {
      disposed = true
      clearTimeout(firstTimer)
      clearInterval(intervalTimer)
      autoUpdater.removeAllListeners()
      listeners.clear()
    },
  }
}
