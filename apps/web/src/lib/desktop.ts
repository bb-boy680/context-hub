/**
 * The optional desktop bridge.
 *
 * A plain browser has no `window.contextHub`, so every read here is optional
 * and the page keeps its web behaviour. The shapes mirror
 * `apps/desktop/src/bridge.ts`; the two sides are built separately.
 */
import * as React from "react"

export interface DesktopInfo {
  version: string
  /** `process.platform`: win32, darwin or linux. */
  platform: string
  updatesEnabled: boolean
}

export type UpdateStatus = "idle" | "available" | "downloading" | "ready"

/** The menu rows the page has to carry out itself. */
export type DesktopMenuAction =
  | "about"
  | "reload-resources"
  | "refresh-plugins"

export interface UpdateState {
  status: UpdateStatus
  version?: string
  percent?: number
}

export interface DesktopBridge {
  info(): Promise<DesktopInfo>
  /** Ask the carrier for a folder; its absolute path, or null when dismissed. */
  pickFolder(): Promise<string | null>
  updateState(): Promise<UpdateState>
  update(): Promise<void>
  /** Run a menu row that is the page's to carry out. */
  onMenuAction(listener: (action: DesktopMenuAction) => void): () => void
  /** Tell the shell which language the page is showing. */
  setLanguage(zh: boolean): void
  subscribe(listener: (state: UpdateState) => void): () => void
}

declare global {
  interface Window {
    contextHub?: { desktop?: DesktopBridge }
  }
}

/** The desktop bridge, or `undefined` when this page runs in a browser. */
export function desktopBridge(): DesktopBridge | undefined {
  return window.contextHub?.desktop
}

const PLATFORM_NAMES: Record<string, string> = {
  win32: "Windows",
  darwin: "macOS",
  linux: "Linux",
}

/** A person-facing platform name, e.g. "Windows"; unknown values pass through. */
export function platformName(platform: string | null): string | null {
  if (platform === null) return null
  return PLATFORM_NAMES[platform] ?? platform
}

/** The carrier's version and update availability; empty outside the desktop. */
export function useDesktopInfo(): {
  version: string | null
  platform: string | null
  updatesEnabled: boolean
} {
  const [info, setInfo] = React.useState<DesktopInfo | null>(null)

  React.useEffect(() => {
    let cancelled = false
    void desktopBridge()
      ?.info()
      .then((answer) => {
        if (!cancelled) setInfo(answer)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  return {
    version: info?.version ?? null,
    platform: info?.platform ?? null,
    updatesEnabled: info?.updatesEnabled === true,
  }
}

/** The sidebar's update row; idle until the main process has an offer. */
export function useDesktopUpdate(): {
  state: UpdateState
  start: () => void
} {
  const [state, setState] = React.useState<UpdateState>({ status: "idle" })

  React.useEffect(() => {
    const bridge = desktopBridge()
    if (bridge === undefined) return
    let live = true
    let pushed = false
    const unsubscribe = bridge.subscribe((next) => {
      pushed = true
      if (live) setState(next)
    })
    void bridge
      .updateState()
      .then((answer) => {
        /* A push that landed first is newer than this answer. */
        if (live && !pushed) setState(answer)
      })
      .catch(() => undefined)
    return () => {
      live = false
      unsubscribe()
    }
  }, [])

  const start = React.useCallback(() => {
    void desktopBridge()
      ?.update()
      .catch(() => undefined)
  }, [])

  return { state, start }
}
