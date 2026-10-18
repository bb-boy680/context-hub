/**
 * The shutdown message a carrier sends to the hub server.
 *
 * Electron's `process.parentPort` delivers `{ data }`; a plain process can send
 * the object itself. Both shapes mean the same thing.
 */
export function isShutdownMessage(event: unknown): boolean {
  if (typeof event !== "object" || event === null) return false
  const data = (event as { data?: unknown }).data ?? event
  if (typeof data !== "object" || data === null) return false
  return (data as { type?: unknown }).type === "shutdown"
}
