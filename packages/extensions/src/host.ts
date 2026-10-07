/**
 * The platform host: the one seam that differs per form. The kernel and every
 * extension read capabilities from here, so no extension asks which form it
 * runs in.
 */

/** Synchronous string persistence; each form backs it with what it has (localStorage, files). */
export interface StoragePort {
  /** Stored value, or `null` when the key is absent. */
  read(key: string): string | null
  write(key: string, value: string): void
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
