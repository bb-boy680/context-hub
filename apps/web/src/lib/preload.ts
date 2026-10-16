/**
 * Starting every shared read, so a page that opens has its rows already.
 *
 * Each asset page draws a library it does not read itself any more — the read
 * belongs to the module that owns it, and this starts all of them at once the
 * moment there is a kernel to start them on. Which is why the reads are named
 * here rather than started by the pages: a page nobody has opened is exactly
 * the case this exists for.
 *
 * Nothing waits for the answers. Starting a read is not the same as having one,
 * and the page that needs it draws what it has — an empty list or the last one
 * — until it lands. A read that cannot be made (a form with no host, an agent
 * module switched off) is its own module's answer to give, and is not a reason
 * to keep the hub from starting.
 */
import type { HubKernel } from "@context-hub/extensions"

/**
 * The reads a startup starts, by the name each module publishes them under.
 *
 * Written out rather than discovered: a module that publishes one of these is
 * asking to be read at startup, and the list is what says which ones do.
 */
export const PRELOADED = ["catalog.skills", "catalog.prompts", "catalog.mcp", "catalog.plugins"]

/**
 * Ask every shared read to start.
 *
 * @param kernel — the started kernel, because a read that is asked for before
 *   the modules are activated is a read of a service that is not there yet.
 * @returns when every read has settled; a caller that does not care may drop it.
 */
export function preloadCatalogs(kernel: HubKernel): Promise<void> {
  const started = PRELOADED.map((name) => kernel.ctx.get(name)?.load())
  return Promise.allSettled(started).then(() => undefined)
}
