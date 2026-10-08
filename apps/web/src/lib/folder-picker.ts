/**
 * The browser's own folder dialog, which is the only one a page can open: the
 * person sees the folder tree and the page is told the folder's name and
 * nothing else — no path, and no access to what is inside. A browser that has
 * no such dialog says so, because the host is not the one asking.
 */

/** The picker Chromium exposes; other browsers leave it out. */
type DirectoryPicker = () => Promise<FileSystemDirectoryHandle>

/**
 * Ask the person for a folder.
 *
 * @returns the folder's name, or `null` when they dismissed the dialog.
 */
export async function pickFolderName(): Promise<string | null> {
  const pick = (window as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker
  if (pick === undefined) throw new Error("this browser has no folder dialog")
  try {
    const handle = await pick()
    return handle.name
  } catch {
    /* Dismissing the dialog rejects; there is nothing to report. */
    return null
  }
}
