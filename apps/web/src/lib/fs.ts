/**
 * Folder listings over the dev bridge. A page cannot read a directory itself,
 * so this asks the process that owns the disk for one level at a time; a
 * product form swaps this for a call into its own host.
 */
import { FS_ROUTE } from "@workspace/core/fs-browse"
import type { DirectoryListing } from "@workspace/core/fs-browse"

/**
 * List the folders inside one directory.
 *
 * @param path — the directory to list; omitted asks for the person's home.
 * @returns the folders it holds and the trail that leads there.
 */
export async function listFolders(path?: string): Promise<DirectoryListing> {
  const query = path === undefined ? "" : `?path=${encodeURIComponent(path)}`
  const response = await fetch(`${FS_ROUTE}/list${query}`)
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const reported = (payload as { error?: unknown } | null)?.error
    throw new Error(
      typeof reported === "string" ? reported : `${response.status} ${response.statusText}`
    )
  }
  if (payload === null) throw new Error("the hub did not answer for its folders")
  return payload as DirectoryListing
}
