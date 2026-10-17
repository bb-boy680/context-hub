/**
 * Fetching one remote picture into the hub's own asset directory.
 *
 * The download is deliberately as narrow as the net proxy in `handlers.ts`:
 * only http(s), only a public host, each redirect checked again, a timeout, and
 * the same 5 MB image ceiling the asset library already enforces. A link that
 * fails keeps its reference — a dead URL is still a better record than no
 * picture at all.
 */
import { assetLimit, extensionFor } from "../assets.ts"

/** Longest one hop may take before it is abandoned. */
const TIMEOUT_MS = 10_000

/** Redirects followed before the address is declared unusable. */
const MAX_REDIRECTS = 3

/** Accepted when the server names no content type at all. */
const IMAGE_PATH = /\.(png|jpe?g|webp|gif|avif|svg)$/i

/**
 * Hosts a download never reaches: this machine and its neighbours. Moved here
 * from the net proxy unchanged, so both routes apply the same rule.
 */
export function isPublicHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase()
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return false
  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return false
  const parts = host.split(".")
  if (parts.length === 4 && parts.every((part) => /^\d+$/.test(part))) {
    const [a, b] = parts.map(Number)
    if (a === 10 || a === 127 || a === 0) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 192 && b === 168) return false
    if (a === 169 && b === 254) return false
    return true
  }
  /* A name with no dot resolves through search domains; refuse it rather than guess. */
  return parts.length > 1
}

/** The name a downloaded file is handed to the asset library under. */
function fileNameOf(url: URL, contentType: string): string {
  const last = url.pathname.split("/").filter((part) => part !== "").pop() ?? "image"
  let name = last
  try {
    name = decodeURIComponent(last)
  } catch {
    /* A path this cannot decode is still a usable name. */
  }
  if (!/\.[a-z0-9]+$/i.test(name)) {
    const extension = extensionFor(contentType)
    if (extension !== undefined) name = `${name}.${extension}`
  }
  return name === "" ? "image" : name
}

/**
 * Download one remote picture as a file the asset store can take over.
 *
 * @param url — the address a record holds.
 * @returns the bytes, named after the address and typed by the server.
 * @throws {Error} with a displayable reason: not an image, too large, a
 *   redirect into this machine, a timeout, a non-success answer.
 */
export async function downloadRemoteImage(url: string): Promise<File> {
  let target: URL
  try {
    target = new URL(url)
  } catch {
    throw new Error(`not a URL: ${url}`)
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      throw new Error("only http(s) images are downloaded")
    }
    if (!isPublicHostname(target.hostname)) {
      throw new Error(`refusing to download from ${target.hostname}`)
    }

    const response = await fetch(target, {
      method: "GET",
      redirect: "manual",
      headers: { Accept: "image/*" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (response.status >= 300 && response.status <= 399) {
      const location = response.headers.get("location")
      if (location === null) throw new Error("the image server redirected without a location")
      target = new URL(location, target)
      continue
    }
    if (!response.ok) throw new Error(`the image server answered ${response.status}`)

    const contentType = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      ?.trim()
      .toLowerCase() ?? ""
    if (contentType !== "" && !contentType.startsWith("image/")) {
      throw new Error(`the address is not an image: ${contentType}`)
    }
    if (contentType === "" && !IMAGE_PATH.test(target.pathname)) {
      throw new Error("the address does not look like an image")
    }

    const limit = assetLimit("image")
    const declared = response.headers.get("content-length")
    if (declared !== null && Number(declared) > limit) {
      throw new Error("the image exceeds the 5 MB limit")
    }

    const reader = response.body?.getReader()
    if (reader === undefined) throw new Error("the image response has no body")
    const chunks: Uint8Array[] = []
    let size = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) {
        await reader.cancel().catch(() => undefined)
        throw new Error("the image exceeds the 5 MB limit")
      }
      chunks.push(value)
    }

    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return new File([bytes], fileNameOf(target, contentType), {
      type: contentType === "" ? "application/octet-stream" : contentType,
    })
  }

  throw new Error("the image server redirected too many times")
}
