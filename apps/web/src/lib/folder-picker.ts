/**
 * The system's own folder dialog — the only one a page may open. The desktop
 * carrier answers with the folder's absolute path, which is what a host needs
 * to point at it. A plain browser is told the folder's name and nothing else —
 * no path, and no access to what is inside — so there the hub finds the folder
 * by name on its own side. A browser that has no such dialog says so, because
 * the host is not the one asking.
 */
import { workspaceName } from "@context-hub/core/workspace"

import { desktopBridge } from "./desktop"

/** The picker Chromium exposes; other browsers leave it out. */
type DirectoryPicker = () => Promise<FileSystemDirectoryHandle>

/**
 * What the dialog answered: a folder's name, with its path when the carrier
 * knows one; `null` when the person dismissed it; or `unsupported` when this
 * browser offers no folder dialog at all.
 */
export type PickedFolder = { name: string; path?: string } | "unsupported" | null

/**
 * Ask the person for a folder through the system dialog. Must be called from a
 * click: a browser only opens it for a gesture.
 *
 * @returns the picked folder, or why there is none.
 */
export async function pickFolder(): Promise<PickedFolder> {
  const bridge = desktopBridge()
  if (bridge !== undefined && typeof bridge.pickFolder === "function") {
    try {
      const path = await bridge.pickFolder()
      return path === null ? null : { name: workspaceName(path), path }
    } catch {
      /* The desktop dialog could not answer; report it as a dismissal rather
         than falling back to the page's own picker, which the desktop carrier
         cannot open a second time. */
      return null
    }
  }

  const pick = (window as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker
  if (pick === undefined) return "unsupported"
  try {
    const handle = await pick()
    return { name: handle.name }
  } catch {
    /* Dismissing the dialog rejects; there is nothing to report. */
    return null
  }
}
