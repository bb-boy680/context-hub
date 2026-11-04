import { promises as fs } from "node:fs"
import path from "node:path"
import { writeFileAtomic } from "@context-hub/core/host/atomic"

/** Write the client-owned index documents under the library root. */
export async function writeMarketplaceIndexes(root: string, indexes: unknown): Promise<void> {
  if (!Array.isArray(indexes)) throw new Error("invalid marketplace indexes")
  const rootStat = await fs.lstat(root).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null
    throw error
  })
  if (rootStat?.isSymbolicLink()) throw new Error("symbolic link in marketplace root")
  for (const index of indexes) {
    if (typeof index !== "object" || index === null || typeof index.path !== "string" ||
      !/^(?:[^./\\:][^/\\:]*|\.[^./\\:][^/\\:]*)(?:\/(?:[^./\\:][^/\\:]*|\.[^./\\:][^/\\:]*)){0,2}\.json$/.test(index.path) ||
      index.path.split("/").some((part: string) => part === "." || part === "..")) throw new Error("invalid marketplace index path")
    const parts = index.path.split("/")
    let target = root
    for (const part of parts) {
      target = path.join(target, part)
      const stat = await fs.lstat(target).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null
        throw error
      })
      if (stat?.isSymbolicLink()) throw new Error("symbolic link in marketplace index path")
    }
    await fs.mkdir(path.dirname(target), { recursive: true })
    await writeFileAtomic(target, `${JSON.stringify(index.document, null, 2)}\n`)
  }
}
