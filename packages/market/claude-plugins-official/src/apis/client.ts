/**
 * One market index over the form's network.
 *
 * A page cannot make this request itself: the index serves no CORS header, so
 * the form's own process fetches it and hands back the body.
 */
import type { NetPort } from "@context-hub/extensions"

/** A refused read, with the upstream's status when it answered at all. */
export class MarketHttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "MarketHttpError"
    this.status = status
  }
}

/**
 * Build the one read this source makes.
 *
 * @param net — the form's network, or `null` on a form without one.
 * @param label — what the failure names, as a person reads it.
 */
export function createJsonReader(
  net: NetPort | null,
  label: string
): (url: string) => Promise<unknown> {
  return async (url) => {
    if (net === null) throw new Error(`${label}: this form cannot reach the network`)
    const reply = await net.request(url)
    if (reply.status !== 200) {
      throw new MarketHttpError(reply.status, `${label} answered ${String(reply.status)}`)
    }
    try {
      return JSON.parse(reply.body) as unknown
    } catch {
      throw new Error(`${label}: the answer is not JSON`)
    }
  }
}
