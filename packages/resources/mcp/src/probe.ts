/**
 * Probing an MCP server: what one probe answers, what a cached answer carries,
 * and the browser's way of asking the host to run one. The host's MCP route
 * also reads and writes the records file, so this module holds the wire shape
 * every call shares.
 *
 * The probe itself runs in the host process — it starts a child process or
 * reaches the network, which a browser form cannot do — so this module holds
 * the part both sides read. It imports no Node built-in.
 */
import type { AssetScope } from "@context-hub/core/place-files"

import type { McpDeclaration } from "./contract.ts"

/** Route the host serves the MCP operations on. */
export const MCP_ROUTE = "/hub/mcp"

/** One icon a server offered, as the picker kept it. */
export interface McpProbeIcon {
  /** A `data:` URI, or an https URL. */
  src: string
  mimeType?: string
  /** The sizes the server declares, e.g. `["48x48"]` or `["any"]`. */
  sizes?: string[]
  theme?: "light" | "dark"
}

/** One tool a server exposes, with the schemas the wire carried. */
export interface McpProbeTool {
  name: string
  title?: string
  description?: string
  /** The input schema as answered; the tool pane validates it before drawing. */
  inputSchema?: unknown
  /** The output schema as answered, when the server declared one. */
  outputSchema?: unknown
}

/** Why a probe failed, in the terms the panel has sentences for. */
export type McpProbeErrorKind =
  | "env"
  | "spawn"
  | "auth"
  | "network"
  | "timeout"
  | "protocol"
  | "unknown"

/** One failure, with the platform's own words kept for the log. */
export interface McpProbeError {
  kind: McpProbeErrorKind
  /** The platform's message, untranslated. */
  message: string
  /** A platform error code, when it had one. */
  code?: string
  /** What the kind's sentence fills in, e.g. the missing variable's name. */
  params?: Record<string, string>
}

/** What one probe found, whether it succeeded or not. */
export interface McpProbeReport {
  ok: boolean
  /** How long the probe took, connect through tool list. */
  ms: number
  /** The version the connection negotiated. */
  protocolVersion?: string
  serverInfo?: {
    name: string
    title?: string
    version: string
    websiteUrl?: string
    /** What the server says it is, when it says anything. */
    description?: string
  }
  icon?: McpProbeIcon
  capabilities?: Record<string, unknown>
  instructions?: string
  tools?: McpProbeTool[]
  /** How many tools the caps kept out of {@link tools}. */
  toolsTrimmed?: number
  error?: McpProbeError
  /** A stdio server's last words on stderr, kept for a failed probe. */
  stderr?: string
}

/** One probe's answer as it is kept: the report plus what says it belongs to. */
export interface McpCacheEntry extends McpProbeReport {
  /** The probe implementation's version, raised when a probe collects more. */
  probe: number
  /** The declaration as one line, for a person reading the cache. */
  target: string
  scope: AssetScope
  /** When the probe ran, in epoch milliseconds. */
  at: number
}

/** One server as a probe is asked to run it. */
export interface McpProbeQuery {
  name: string
  declaration: McpDeclaration
  scope: AssetScope
}

/** What one probe call carries. */
export interface McpProbeRequest {
  /** The cache key the answer is stored under. */
  name?: string
  declaration: McpDeclaration
  scope: AssetScope
  /** Overrides the transport's default timeout. */
  timeoutMs?: number
  /** Whether the answer is kept; the add dialog's tryout is not. */
  save?: boolean
  /** Every name the catalog holds, so the write can drop answers for gone servers. */
  names?: readonly string[]
}

/** What the browser calls. */
export interface McpProbePort {
  /** For each name: its answer, or null when the cache holds none this build can use. */
  cache(names: readonly string[]): Promise<Record<string, McpCacheEntry | null>>
  /** Run one probe now. */
  probe(request: McpProbeRequest): Promise<McpCacheEntry>
}

/** One read, as the route reads it off a query. */
export type McpReadCall = { action: "records" } | { action: "cache"; names: string[] }

/**
 * Read one read off a query, or null when the request is asking the liveness
 * question instead.
 *
 * A read names its action in the query rather than in a body because there is
 * no body to name it in: `curl` can send one, and a caller that only wants to
 * know the cache answers without an encoder.
 *
 * @param params — the query, of no known shape: it crossed a wire.
 * @returns the call, or null for the route itself.
 * @throws when the query names an action this route does not read.
 */
export function readMcpQuery(params: URLSearchParams): McpReadCall | null {
  const action = params.get("action")
  /* No action at all is the question the page asks before offering probes. */
  if (action === null) return null
  if (action === "records") return { action: "records" }
  if (action === "cache") {
    return {
      action: "cache",
      names: params.getAll("names").filter((name) => name !== ""),
    }
  }
  throw new Error(`unknown action: ${action}`)
}

/** One write, as the route reads it off a request body. */
export type McpCall =
  | ({ action: "probe" } & McpProbeRequest)
  | { action: "save-records"; records: unknown[] }

const SCOPES: readonly string[] = ["workspace", "global"]

/**
 * Read one write off a request body.
 *
 * @param body — the parsed body, of no known type: it crossed a wire.
 * @returns the call, with the fields this route understands.
 * @throws when the body is not one of these calls; the message names what was
 * wrong, never what the caller should have sent instead.
 */
export function readMcpCall(body: unknown): McpCall {
  if (typeof body !== "object" || body === null) throw new Error("a call is an object")
  const held = body as {
    action?: unknown
    /** The names a probe keeps, not the names a cache read asks about. */
    names?: unknown
    name?: unknown
    declaration?: unknown
    scope?: unknown
    timeoutMs?: unknown
    save?: unknown
    records?: unknown
  }
  if (held.action === "save-records") {
    if (!Array.isArray(held.records)) throw new Error("a save call carries its records")
    return { action: "save-records", records: held.records }
  }
  if (held.action === "probe") {
    const declaration = readWireDeclaration(held.declaration)
    return {
      action: "probe",
      declaration,
      scope: readScope(held.scope),
      ...(typeof held.name === "string" && held.name !== "" ? { name: held.name } : {}),
      ...(typeof held.timeoutMs === "number" ? { timeoutMs: held.timeoutMs } : {}),
      ...(typeof held.save === "boolean" ? { save: held.save } : {}),
      ...(Array.isArray(held.names)
        ? { names: held.names.filter((name): name is string => typeof name === "string") }
        : {}),
    }
  }
  throw new Error(`unknown action: ${String(held.action)}`)
}

/** Whether a host answers for probes; without one the page offers none. */
export async function probeAvailable(base = ""): Promise<boolean> {
  try {
    const answer = await fetch(`${base}${MCP_ROUTE}`, { method: "GET" })
    return answer.ok
  } catch {
    /* No host behind this origin: the page offers no probe. */
    return false
  }
}

/**
 * One call to this route, answered as JSON.
 *
 * @param url — the whole address, query and all.
 * @param init — what the call is; the method is what says read or write.
 * @throws when the host refused the call, with the reason it gave.
 */
async function ask<T>(url: string, init: RequestInit): Promise<T> {
  const answer = await fetch(url, init)
  if (!answer.ok) {
    /* The route refuses with `{ error }`, and that sentence is the only one
       that says what went wrong; the status alone reads as a transport fault. */
    const failure = (await answer.json().catch(() => ({}))) as { error?: string }
    throw new Error(failure.error ?? `${answer.status} ${answer.statusText}`)
  }
  return (await answer.json()) as T
}

/**
 * One read, as a browser makes it: a GET whose answer is JSON.
 *
 * @param query — the query the call carries, starting with its action.
 * @param base — the origin the route is reached on; empty means this one.
 */
export function callMcpGet<T>(query: string, base = ""): Promise<T> {
  return ask<T>(`${base}${MCP_ROUTE}${query}`, { method: "GET" })
}

/**
 * One write, as a browser makes it: a POST whose answer is JSON.
 *
 * @param body — the call, in the shape {@link readMcpCall} reads.
 * @param base — the origin the route is reached on; empty means this one.
 */
export function callMcp<T = unknown>(body: unknown, base = ""): Promise<T> {
  return ask<T>(`${base}${MCP_ROUTE}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

/**
 * The browser's probe port: a read in the query, a write in the body.
 *
 * @param base — the origin the route is reached on; empty means this one.
 * @returns the port; a call the host refused rejects with its reason.
 */
export function createRemoteProbe(base = ""): McpProbePort {
  return {
    async cache(names) {
      const query = names.map((name) => `&names=${encodeURIComponent(name)}`).join("")
      const answer = await callMcpGet<{ entries?: Record<string, McpCacheEntry | null> }>(
        `?action=cache${query}`,
        base
      )
      return answer.entries ?? {}
    },
    async probe(request) {
      const answer = await callMcp<{ entry: McpCacheEntry }>(
        { action: "probe", ...request },
        base
      )
      return answer.entry
    },
  }
}

/** A declaration as the wire carries it, checked field by field. */
function readWireDeclaration(value: unknown): McpDeclaration {
  if (typeof value !== "object" || value === null) throw new Error("a declaration is an object")
  const held = value as {
    transport?: unknown
    command?: unknown
    args?: unknown
    env?: unknown
    url?: unknown
    headers?: unknown
  }
  if (held.transport === "stdio") {
    if (typeof held.command !== "string" || held.command === "") {
      throw new Error("a stdio declaration needs a command")
    }
    return {
      transport: "stdio",
      command: held.command,
      args: Array.isArray(held.args) ? held.args.filter((arg): arg is string => typeof arg === "string") : [],
      env: stringsOf(held.env),
    }
  }
  if (held.transport === "http" || held.transport === "sse") {
    if (typeof held.url !== "string" || held.url === "") {
      throw new Error("a remote declaration needs a url")
    }
    return { transport: held.transport, url: held.url, headers: stringsOf(held.headers) }
  }
  throw new Error(`unknown transport: ${String(held.transport)}`)
}

/** A scope as the wire carries it. */
function readScope(value: unknown): AssetScope {
  if (typeof value === "string" && SCOPES.includes(value)) return value as AssetScope
  throw new Error(`unknown scope: ${String(value)}`)
}

/** The string-valued pairs one declaration carries, dropping anything else. */
function stringsOf(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null) return {}
  const pairs: Record<string, string> = {}
  for (const [key, held] of Object.entries(value as Record<string, unknown>)) {
    if (typeof held === "string") pairs[key] = held
  }
  return pairs
}
