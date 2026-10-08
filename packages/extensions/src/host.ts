/**
 * The platform host: the one seam that differs per form. The kernel and every
 * extension read capabilities from here, so no extension asks which form it
 * runs in.
 */

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

/** What every form must provide to compose a kernel. */
export interface PlatformHost {
  /** Form name shown in the UI, e.g. "Web". */
  readonly form: string
  readonly capabilities: PlatformCapabilities
  readonly storage: StoragePort
  /** Record one kernel-owned diagnostic line, e.g. an activation failure. */
  log(level: "info" | "warn" | "error", message: string): void
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    host: PlatformHost
  }
}
