/**
 * The hub's network proxy route. A browser form cannot read a cross-origin API
 * that serves no CORS header, so a form whose page cannot make the call itself
 * asks the process that holds the connection to make it.
 *
 * The route is a seam, not a feature: it does one GET for one extension and
 * hands back the status and the body. Whoever implements it decides what it
 * refuses, so it is never an open relay.
 */

/** Route a form serves network requests on. */
export const NET_ROUTE = "/hub/net"

/** One proxied response, as the route returns it. */
export interface NetReply {
  status: number
  body: string
}

/** What a caller asks the route to fetch. */
export interface NetRequest {
  /** The one action this route has. */
  action: "fetch"
  /** Absolute URL to read. */
  url: string
  /** Request headers, when the API needs any. */
  headers?: Record<string, string>
}

/**
 * Read one URL through the form's own process.
 *
 * @param base — origin the form serves the route on; empty for the current one.
 * @returns a port that performs the route's request.
 */
export function createRemoteNet(base = ""): {
  request(url: string, init?: { headers?: Record<string, string> }): Promise<NetReply>
} {
  return {
    async request(url, init) {
      const response = await fetch(`${base}${NET_ROUTE}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "fetch",
          url,
          ...(init?.headers === undefined ? {} : { headers: init.headers }),
        }),
      })
      if (!response.ok) {
        /* The proxy reports its own refusals as JSON; anything else is the transport. */
        const failure = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(failure?.error ?? `${response.status} ${response.statusText}`)
      }
      return (await response.json()) as NetReply
    },
  }
}
