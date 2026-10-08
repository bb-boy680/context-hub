/**
 * The browser's own folder dialog, which is the only one a page can open: the
 * person sees the system's folder tree, and the page is told the folder's name
 * and nothing else — no path, and no access to what is inside. A page never
 * learns where a folder is, by design, so the hub finds the folder by name on
 * its own side. A browser that has no such dialog says so, because the host is
 * not the one asking.
 */

/** The picker Chromium exposes; other browsers leave it out. */
type DirectoryPicker = () => Promise<FileSystemDirectoryHandle>

/**
 * What the dialog answered: a folder's name, `null` when the person dismissed
 * it, or `unsupported` when this browser offers no folder dialog at all.
 */
export type PickedFolder = { name: string } | "unsupported" | null

/**
 * Ask the person for a folder through the system dialog. Must be called from a
 * click: a browser only opens it for a gesture.
 *
 * @returns the picked folder's name, or why there is none.
 */
export async function pickFolder(): Promise<PickedFolder> {
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
