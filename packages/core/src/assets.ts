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

/** The extension one media type is stored with, or nothing when it names none this hub keeps. */
export function extensionFor(contentType: string): string | undefined {
  return EXTENSIONS[contentType]
}

/** The size limit for one kind, so callers can refuse before reading the bytes. */
export function assetLimit(kind: AssetKind): number {
  return kind === "video" ? MAX_VIDEO : MAX_IMAGE
}

/** A message naming the limit a file exceeded. */
export function limitMessage(kind: AssetKind): string {
  return `${kind} exceeds the ${Math.round(assetLimit(kind) / 1024 / 1024)} MB limit`
}

/**
 * A pasted source the hub can keep.
 *
 * A file is what travels: a browser hands one over from a file picker, a host
 * builds one from bytes it read, and everything downstream — the store, a sink
 * that uploads it — takes that same thing and reads its name, type and bytes
 * off it.
 */
export type AssetSource =
  /** A remote address the hub only references. */
  | { kind: "link"; ref: string }
  /** Bytes the hub takes over, as the file they are. */
  | { kind: "file"; file: File }

/** Decode the payload of a base64 data URL. */
function decodeBase64(payload: string): Uint8Array<ArrayBuffer> {
  const binary = atob(payload.replace(/\s/g, ""))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

/** Read a pasted source: a remote address stays a link, anything carried inline becomes a file. */
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
  /* The buffer is spelled out because a file's data may be any of several
     buffer types; these two are the plain ones. */
  let bytes: Uint8Array<ArrayBuffer>
  try {
    bytes = parameters.includes("base64")
      ? decodeBase64(payload)
      : new TextEncoder().encode(decodeURIComponent(payload))
  } catch {
    throw new Error("that data: source is not readable")
  }
  const extension = EXTENSIONS[contentType] ?? "bin"
  return { kind: "file", file: new File([bytes], `asset.${extension}`, { type: contentType }) }
}

/** The URL that serves one stored path; `base` is empty for a same-origin form. */
export function assetUrl(path: string, base = ""): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/")
  return `${base}${ASSET_ROUTE}/${encoded}`
}

/**
 * The URL a view draws one recorded reference by: a stored path through the
 * hub's own route, and anything else — an address a sink answered with, a link
 * a person pasted — exactly as it was recorded.
 */
export function assetRef(ref: string, base = ""): string {
  return isLink(ref) ? ref : assetUrl(ref, base)
}

/**
 * The library of stored files. Implementations own the directory; callers hold
 * the paths they are given and nothing else.
 */
export interface AssetLibrary {
  /** Where the files live, for display and diagnostics. */
  readonly root: string
  /**
   * Store one file and answer with the path it was stored at, relative to the
   * hub home.
   *
   * The file's own name is the hint for the stored one, and a digest of its
   * bytes makes that name unique: saving one file twice keeps one copy, while
   * two files that share a name never collide. The MIME type, when the file
   * carries one, is kept as the stored file's type.
   *
   * @throws {Error} with a displayable message when the file is larger than this hub keeps.
   */
  put(file: File): Promise<string>
  /** Delete one stored file; a path that is already gone is not an error. */
  remove(path: string): Promise<void>
}

/**
 * Somewhere else the hub's assets may be kept: a bucket a plugin uploads to, a
 * mirror, a store of somebody's own.
 *
 * A sink is offered each file first, and one that answers takes it over — the
 * reference it returns is what gets recorded, and dropping that reference is
 * the sink's job again. This is the seam a plugin adds a backend through;
 * nothing in this hub names a sink.
 */
export interface AssetSink {
  /** A name for diagnostics. */
  readonly id: string
  /**
   * Keep one file somewhere of the sink's own.
   *
   * The file's name is a hint from its owner — a pack's picture is named after
   * the pack — and a sink is free to use it or ignore it.
   *
   * @returns the reference to record instead of the hub's own, or `null` to leave the file to this hub.
   */
  keep(file: File): Promise<string | null>
  /** Drop one asset this sink took over; called with a reference it returned. */
  drop?(ref: string): Promise<void>
}

/**
 * The one thing every consumer of assets calls: hand the hub a file and read
 * back the reference to record.
 */
export interface AssetStore {
  /**
   * Keep one file.
   *
   * @returns the reference to record: a path inside the hub's own directory, or whatever a sink that took it over answered.
   */
  put(file: File): Promise<string>
  /** Drop one asset, wherever it was kept. A missing file is not an error. */
  remove(ref: string): Promise<void>
}

/**
 * Compose the store over the hub's own library and the sinks that may take a
 * file over. Order decides: the first sink that answers keeps it.
 *
 * @param library — the hub's own storage, and the fallback for every file no sink takes.
 * @param sinks — the backends a form or a plugin adds, in the order they are offered.
 */
export function createAssetStore(
  library: AssetLibrary,
  sinks: readonly AssetSink[] = []
): AssetStore {
  return {
    async put(file) {
      for (const sink of sinks) {
        const ref = await sink.keep(file)
        if (ref !== null) return ref
      }
      return library.put(file)
    },

    async remove(ref) {
      /* A path inside the hub's directory is this hub's to delete. */
      if (ref.startsWith(`${ASSET_DIR}/`)) {
        await library.remove(ref)
        return
      }
      /* Anything else came from a sink — a link a person pasted is one nobody
         claims — so the sinks are asked, and each answers for its own. */
      const owners = sinks.filter((sink) => sink.drop !== undefined)
      if (owners.length > 0) {
        for (const sink of owners) await sink.drop?.(ref)
        return
      }
      /* With no sink to ask, a reference that names neither the hub's directory
         nor an address somewhere else is a mistake, not an empty answer. */
      if (!isLink(ref)) {
        throw new Error(`${ref} is not inside the hub's asset directory`)
      }
    },
  }
}
