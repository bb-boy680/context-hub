/**
 * The platform host: the one seam that differs per form. The kernel and every
 * extension read capabilities from here, so no extension asks which form it
 * runs in.
 */
import type { PlaceFiles } from "@workspace/core/place-files"

/**
 * What the kernel and its extensions remember about this hub: one JSON value
 * per key, kept where the form keeps its state — the hub home's `state`
 * directory in every form that owns a disk. A form loads its store before the
 * kernel starts, which is what lets the kernel read synchronously, and writes
 * every change straight back to it; the value is durable JSON, so a reader
 * validates what it finds.
 */
export interface StoragePort {
  /** The stored value, or `null` when this key has never been written. */
  read(key: string): unknown
  write(key: string, value: unknown): void
}

/** Platform abilities a form either has or lacks. */
export interface PlatformCapabilities {
  /** The form runs extension code; without it, code extensions stay unavailable. */
  code: boolean
  /** Injection results can reach the local filesystem. */
  filesystem: boolean
  /** The form can reach the network. */
  network: boolean
}

/** One HTTP response a form fetched on an extension's behalf. */
export interface NetResponse {
  status: number
  /** The response body as text; the caller parses what it asked for. */
  body: string
}

/**
 * The network as a form can reach it.
 *
 * An extension never calls `fetch` itself: a browser page is bound by the
 * target's CORS headers, so an API that serves no `Access-Control-Allow-Origin`
 * is reachable only from the process the form runs in. The form does the
 * request and hands back the body.
 */
export interface NetPort {
  /**
   * Fetch one URL.
   *
   * @param url — the absolute URL to read.
   * @param init — request headers, when the API needs any.
   * @throws {Error} when the request fails or the form refuses the URL.
   */
  request(url: string, init?: { headers?: Record<string, string> }): Promise<NetResponse>
}

/** What every form must provide to compose a kernel. */
export interface PlatformHost {
  /** Form name shown in the UI, e.g. "Web". */
  readonly form: string
  readonly capabilities: PlatformCapabilities
  readonly storage: StoragePort
  /** How this form reaches the network; `null` when it cannot. */
  readonly net: NetPort | null
  /** The client configuration files under this form's two roots; `null` when it cannot reach them. */
  readonly files: PlaceFiles | null
  /** Record one kernel-owned diagnostic line, e.g. an activation failure. */
  log(level: "info" | "warn" | "error", message: string): void
}

export type { AssetScope, PlaceFiles, PlaceRef } from "@workspace/core/place-files"

declare module "@deepseek-ai/cordis" {
  interface Context {
    host: PlatformHost
  }
}
