/**
 * The hub's asset library: one place that keeps user-supplied files and answers
 * with the path they live at. Callers record that path and never touch the
 * directory themselves.
 *
 * A source a person pastes is either a link the hub keeps as it is, or bytes it
 * takes over. `readSource` draws that line once so every form agrees on it.
 */

/** What the library keeps: images and videos. */
export type AssetKind = "image" | "video"

/** Route a host serves files from the hub home on. */
export const ASSET_ROUTE = "/hub/files"

/** Directory under the hub home that holds the files. */
export const ASSET_DIR = "assets"

/** Upload limits, in bytes. */
const MAX_IMAGE = 5 * 1024 * 1024
const MAX_VIDEO = 25 * 1024 * 1024

/** Whether a file is a video, by content type first and extension second. */
export function assetKind(name: string, contentType?: string): AssetKind {
  if (contentType?.startsWith("video/")) return "video"
  return /\.(mp4|webm|mov|m4v|ogv)$/i.test(name) ? "video" : "image"
}

/** Whether a recorded reference points somewhere the hub does not own. */
export function isLink(ref: string): boolean {
  return /^https?:\/\//i.test(ref)
}

/** Extension a stored file is named with, from its content type. */
const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
}

/** The size limit for one kind, so callers can refuse before reading the bytes. */
export function assetLimit(kind: AssetKind): number {
  return kind === "video" ? MAX_VIDEO : MAX_IMAGE
}

/** A message naming the limit a file exceeded. */
export function limitMessage(kind: AssetKind): string {
  return `${kind} exceeds the ${Math.round(assetLimit(kind) / 1024 / 1024)} MB limit`
}

/** A pasted source the hub can keep. */
export type AssetSource =
  /** A remote address the hub only references. */
  | { kind: "link"; ref: string }
  /** Bytes the hub takes over, under the name they are stored as. */
  | { kind: "bytes"; name: string; bytes: Uint8Array; contentType: string }

/** Decode the payload of a base64 data URL. */
function decodeBase64(payload: string): Uint8Array {
  const binary = atob(payload.replace(/\s/g, ""))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

/** Read a pasted source: a remote address stays a link, anything carried inline becomes bytes. */
export function readSource(source: string): AssetSource {
  const value = source.trim()
  if (isLink(value)) return { kind: "link", ref: value }
  if (!value.startsWith("data:")) {
    throw new Error("only an http, https, or data: source can be added")
  }
  const comma = value.indexOf(",")
  if (comma < 0) throw new Error("that data: source is not readable")
  const [mime = "", ...parameters] = value.slice("data:".length, comma).split(";")
  const contentType = mime.trim() || "application/octet-stream"
  const payload = value.slice(comma + 1)
  let bytes: Uint8Array
  try {
    bytes = parameters.includes("base64")
      ? decodeBase64(payload)
      : new TextEncoder().encode(decodeURIComponent(payload))
  } catch {
    throw new Error("that data: source is not readable")
  }
  const extension = EXTENSIONS[contentType] ?? "bin"
  return { kind: "bytes", name: `asset.${extension}`, bytes, contentType }
}

/** The URL that serves one stored path; `base` is empty for a same-origin form. */
export function assetUrl(path: string, base = ""): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/")
  return `${base}${ASSET_ROUTE}/${encoded}`
}

/**
 * The library of stored files. Implementations own the directory; callers hold
 * the paths they are given and nothing else.
 */
export interface AssetLibrary {
  /** Where the files live, for display and diagnostics. */
  readonly root: string
  /**
   * Store bytes under a unique name and answer with the path they were stored
   * at, relative to the hub home. A name already taken gains a numeric suffix.
   * Rejects with a displayable message when the file is too large to keep.
   */
  put(name: string, bytes: Uint8Array, contentType?: string): Promise<string>
  /** Delete one stored file; a path that is already gone is not an error. */
  remove(path: string): Promise<void>
}
