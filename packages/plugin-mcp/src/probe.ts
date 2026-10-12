/**
 * Probing an MCP server: what one probe answers, what a cached answer carries,
 * and the browser's way of asking the host to run one.
 *
 * The probe itself runs in the host process — it starts a child process or
 * reaches the network, which a browser form cannot do — so this module holds
 * the part both sides read. It imports no Node built-in.
 */
import type { AssetScope } from "@workspace/core/place-files"

import type { McpDeclaration } from "./contract.ts"

/** Route the host serves probes and cache reads on. */
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

/** One probe's answer as it is kept: the report plus what says it still applies. */
export interface McpCacheEntry extends McpProbeReport {
  /** The probe implementation's version, raised when a probe collects more. */
  probe: number
  /** What the answer belongs to: declaration, scope and working directory. */
  fingerprint: string
  /** The declaration as one line, for a person reading the cache. */
  target: string
  scope: AssetScope
  /** When the probe ran, in epoch milliseconds. */
  at: number
}

/** One server as the cache is asked about it. */
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
  /** For each server: its answer, or null when the cache has none that applies. */
  cache(servers: readonly McpProbeQuery[]): Promise<Record<string, McpCacheEntry | null>>
  /** Run one probe now. */
  probe(request: McpProbeRequest): Promise<McpCacheEntry>
}

/** One call as the route reads it off a request body. */
export type McpCall =
  | { action: "cache"; servers: McpProbeQuery[] }
  | ({ action: "probe" } & McpProbeRequest)

const SCOPES: readonly string[] = ["workspace", "global"]

/**
 * Read one call off a request body.
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
    servers?: unknown
    name?: unknown
    declaration?: unknown
    scope?: unknown
    timeoutMs?: unknown
    save?: unknown
    names?: unknown
  }
  if (held.action === "cache") {
    if (!Array.isArray(held.servers)) throw new Error("a cache call carries its servers")
    return { action: "cache", servers: held.servers.map(readQuery) }
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
export async function probeAvailable(): Promise<boolean> {
  try {
    const answer = await fetch(MCP_ROUTE, { method: "GET" })
    return answer.ok
  } catch {
    /* No host behind this origin: the page offers no probe. */
    return false
  }
}

/**
 * The browser's probe port: both calls are one POST each.
 *
 * @returns the port; a call the host refused rejects with its status.
 */
export function createRemoteProbe(): McpProbePort {
  const post = async (body: unknown): Promise<unknown> => {
    const answer = await fetch(MCP_ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!answer.ok) throw new Error(`${answer.status} ${answer.statusText}`)
    return answer.json()
  }

  return {
    async cache(servers) {
      const answer = (await post({ action: "cache", servers })) as {
        entries?: Record<string, McpCacheEntry | null>
      }
      return answer.entries ?? {}
    },
    async probe(request) {
      const answer = (await post({ action: "probe", ...request })) as { entry: McpCacheEntry }
      return answer.entry
    },
  }
}

/** One query as the wire carries it. */
function readQuery(value: unknown): McpProbeQuery {
  if (typeof value !== "object" || value === null) throw new Error("a query is an object")
  const held = value as { name?: unknown; declaration?: unknown; scope?: unknown }
  if (typeof held.name !== "string" || held.name === "") throw new Error("a query needs a name")
  return { name: held.name, declaration: readWireDeclaration(held.declaration), scope: readScope(held.scope) }
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
