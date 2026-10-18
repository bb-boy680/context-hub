/**
 * In-place updates. Only a packaged app with `app-update.yml` has a feed; every
 * other form reports `enabled: false` and the menu omits the action.
 *
 * Downloads are opt-in. Installation first stops the hub server through the
 * caller, so a half-written file cannot be left behind by the restart.
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

const CHECK_DELAY_MS = 10_000
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

export interface Updater {
  readonly enabled: boolean
  check(manual: boolean): void
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
    return { enabled: false, check: () => undefined, dispose: () => undefined }
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false
  autoUpdater.logger = console

  let disposed = false
  let checking = false
  let prompting = false
  let manualCheck = false
  let promptedVersion: string | undefined
  let downloadedVersion: string | undefined

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
      progress(0)
      void autoUpdater.downloadUpdate().catch(() => undefined)
    } finally {
      prompting = false
    }
  }

  const onUpdateAvailable = (info: UpdateInfo): void => {
    checking = false
    if (disposed) return
    if (downloadedVersion === info.version) {
      void install(info.version)
      return
    }
    /* A manual check always answers; automatic checks do not repeat the same
       prompt for a version the person has already declined. */
    if (!manualCheck && promptedVersion === info.version) return
    promptedVersion = info.version
    void askDownload(info.version)
  }

  const onUpdateDownloaded = (info: UpdateInfo): void => {
    manualCheck = false
    progress(-1)
    downloadedVersion = info.version
    void install(info.version)
  }

  const onError = (error: Error): void => {
    checking = false
    if (disposed) return
    reportError(error, manualCheck)
    manualCheck = false
  }

  const onNotAvailable = (): void => {
    checking = false
    const manual = manualCheck
    manualCheck = false
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
  })
  autoUpdater.on("update-cancelled", () => {
    manualCheck = false
    progress(-1)
  })

  const check = (manual: boolean): void => {
    if (disposed || checking || prompting) return
    if (downloadedVersion !== undefined) {
      if (manual) void install(downloadedVersion)
      return
    }
    checking = true
    manualCheck = manual
    void autoUpdater.checkForUpdates().catch(() => undefined)
  }

  const firstTimer = setTimeout(() => check(false), CHECK_DELAY_MS)
  const intervalTimer = setInterval(() => check(false), CHECK_INTERVAL_MS)

  return {
    enabled,
    check,
    dispose: () => {
      disposed = true
      clearTimeout(firstTimer)
      clearInterval(intervalTimer)
      autoUpdater.removeAllListeners()
    },
  }
}
