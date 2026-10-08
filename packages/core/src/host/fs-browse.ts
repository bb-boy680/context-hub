/**
 * Folder facts the host answers for a form that cannot read the disk itself:
 * whether a folder is there, and which repository a folder belongs to.
 */
import { promises as fs } from "node:fs"
import path from "node:path"

/**
 * Whether a folder exists and can be entered as one.
 *
 * @param target — the path a form reported.
 * @returns true when the path resolves to a directory.
 */
export async function isDirectory(target: string): Promise<boolean> {
  const stat = await fs.stat(target).catch(() => null)
  return stat?.isDirectory() === true
}

/**
 * The repository a folder belongs to: the nearest folder above it that carries
 * a `.git`, or the folder itself when it stands outside one.
 *
 * @param folder — the folder to place.
 * @returns the folder's project root.
 */
export async function projectRoot(folder: string): Promise<string> {
  const start = path.resolve(folder)
  let step = start
  for (;;) {
    if ((await fs.stat(path.join(step, ".git")).catch(() => null)) !== null) return step
    const up = path.dirname(step)
    if (up === step) return start
    step = up
  }
}

/** The folder this host runs in, which is a workspace without anyone picking it. */
export async function hostFolder(): Promise<string> {
  /* A dev server starts inside a package; the repository is what it belongs to. */
  return projectRoot(process.cwd())
}
