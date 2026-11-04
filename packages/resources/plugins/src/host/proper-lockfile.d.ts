declare module "proper-lockfile" {
  export interface LockOptions {
    stale: number
    update: number
    retries: { retries: number; factor: number; minTimeout: number; maxTimeout: number; randomize: boolean }
    onCompromised(error: Error): void
  }
  export function lock(path: string, options: LockOptions): Promise<() => Promise<void>>
}
