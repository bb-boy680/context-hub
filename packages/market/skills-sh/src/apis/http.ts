/**
 * The shared HTTP plumbing for the skills.sh reads: one request helper, one
 * error type, and the small field parsers every endpoint uses.
 */
import type { NetPort, NetResponse } from "@context-hub/extensions"

/** A readable failure; `status` is the upstream answer when there was one. */
export class MarketHttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "MarketHttpError"
    this.status = status
  }
}

export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null
}

export function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

/** What the API said, when it said anything a person can read. */
function refusal(status: number): string {
  return `skills.sh answered ${status}`
}

/** Whether a body looks like JSON before parsing it. */
function isJsonText(body: string): boolean {
  const start = body.trimStart()
  return start.startsWith("{") || start.startsWith("[")
}

/** Refuse anything the reads cannot use; 404 is the caller's decision. */
export function requireOk(reply: NetResponse): void {
  if (reply.status !== 200) {
    throw new MarketHttpError(reply.status, refusal(reply.status))
  }
}

/** Parse one 200 body; `label` names the endpoint in the error. */
export function parseJson(reply: NetResponse, label: string): unknown {
  if (!isJsonText(reply.body)) {
    throw new Error(`${label}: the answer is not JSON`)
  }
  return JSON.parse(reply.body) as unknown
}

/** Whether a failure is the host proxy's own deadline running out. */
export function isTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === "TimeoutError" || /aborted due to timeout/i.test(error.message)
}

/**
 * One proxy request. The host abandons a read after ten seconds; a second
 * attempt covers the transient cases without retrying real failures.
 */
export async function requestWithRetry(net: NetPort, url: string): Promise<NetResponse> {
  return net.request(url).catch((error: unknown) => {
    if (!isTimeout(error)) throw error
    return net.request(url)
  })
}

/** Read one response and parse its JSON, naming the upstream on failure. */
export async function requestJson(net: NetPort, url: string): Promise<unknown> {
  const reply = await requestWithRetry(net, url)
  requireOk(reply)
  if (!isJsonText(reply.body)) {
    throw new Error("skills.sh answered a page instead of data")
  }
  return JSON.parse(reply.body) as unknown
}
