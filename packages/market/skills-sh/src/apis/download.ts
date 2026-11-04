import type { NetPort } from "@context-hub/extensions"

import { parseJson, record, requestWithRetry, requireOk, text } from "./http.ts"
import type { MarketBundle, MarketFile } from "./types.ts"
import { MARKET_ORIGIN, skillSegment, sourceSegments } from "./urls.ts"

/** A preview path that refuses anything but a relative POSIX file. */
function filePath(value: unknown): string | null {
  if (typeof value !== "string" || value === "") return null
  if (value.startsWith("/") || value.includes("\\")) return null
  if (value.split("/").some((segment) => segment === ".." || segment === "")) return null
  return value
}

/** The public preview, or `null` when the source has none (a 404). */
export async function readDownload(
  net: NetPort,
  source: string,
  skill: string
): Promise<MarketBundle | null> {
  const reply = await requestWithRetry(
    net,
    `${MARKET_ORIGIN}/api/download/${sourceSegments(source).join("/")}/${skillSegment(skill)}`
  )
  if (reply.status === 404) return null
  requireOk(reply)
  const parsed = parseJson(reply, "skills.sh preview")
  if (!record(parsed) || !Array.isArray(parsed.files)) {
    throw new Error("skills.sh preview: the answer has no files")
  }
  const files: MarketFile[] = []
  for (const item of parsed.files) {
    if (!record(item)) continue
    const path = filePath(item.path)
    if (path === null || typeof item.contents !== "string") continue
    files.push({ path, contents: item.contents })
  }
  return { files, hash: text(parsed.hash) ?? "" }
}
