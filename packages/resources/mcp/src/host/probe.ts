/**
 * Running one MCP probe from the host process: start or reach the server,
 * complete one initialization, read its tool list, and close again.
 *
 * The protocol work is the official SDK's. What this module adds is the
 * deployment's terms: environment expansion, timeouts, the error vocabulary
 * the panel has sentences for, and the caps that keep one big or hostile
 * server from writing megabytes into the cache.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import type {
  Transport,
  TransportSendOptions,
} from "@modelcontextprotocol/sdk/shared/transport.js"
import type { JSONRPCMessage, Tool } from "@modelcontextprotocol/sdk/types.js"
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js"

import type { McpDeclaration } from "../declaration.ts"
import type {
  McpProbeError,
  McpProbeIcon,
  McpProbeReport,
  McpProbeTool,
} from "../probe.ts"

/** The identity a probe introduces itself with. */
const CLIENT_INFO = { name: "context-hub", version: "0.1.0" }

/** How long a stdio server may take, from spawning it to reading its tools. */
const STDIO_TIMEOUT_MS = 30_000
/** How long a remote server has, which spawns nothing and answers over the network. */
const REMOTE_TIMEOUT_MS = 15_000

/** Caps on what one server may write into the cache. Text a person reads is
    never cut: the detail panel is where it is shown in full, so only binary
    payloads and logs are bounded. */
const ICON_LIMIT = 32 * 1024
const STDERR_LIMIT = 4 * 1024
const TOOLS_LIMIT = 256 * 1024
const TOOLS_MAX = 500
const TOOL_PAGES_MAX = 20

/** What one probe needs to run. */
export interface McpProbeInput {
  declaration: McpDeclaration
  /** The directory a stdio server starts in; absent starts it where the hub runs. */
  cwd?: string | null
  /** Overrides the transport's default timeout. */
  timeoutMs?: number
}

/**
 * Probe one server: connect, read what it offers, close again.
 *
 * Never throws — a failure comes back as a report whose `error` says why, so
 * the caller keeps and shows one shape for both outcomes.
 *
 * @param input — the declaration, and where a stdio server should start.
 * @returns what the server answered, or why the probe failed.
 */
export async function probeDeclaration(input: McpProbeInput): Promise<McpProbeReport> {
  const started = Date.now()
  let stderr = ""
  let protocolVersion: string | undefined
  const client = new Client(CLIENT_INFO, { capabilities: {} })
  try {
    const declaration = expandDeclaration(input.declaration)
    const timeoutMs = input.timeoutMs ?? defaultTimeout(declaration)
    const transport = createTransport(declaration, input.cwd ?? null, (chunk) => {
      stderr = tail(`${stderr}${chunk}`, STDERR_LIMIT)
    })
    const tapped = tapProtocolVersion(transport, (version) => {
      protocolVersion = version
    })
    await client.connect(tapped, { timeout: timeoutMs })
    const tools = await readTools(client, timeoutMs)
    return reportOf(client, { ms: Date.now() - started, protocolVersion, tools, stderr })
  } catch (error) {
    return {
      ok: false,
      ms: Date.now() - started,
      error: classify(error),
      ...(stderr === "" ? {} : { stderr }),
    }
  } finally {
    /* Closing is what stops a stdio server; a probe that never started one has nothing to stop. */
    await client.close().catch(() => undefined)
  }
}

/** What the client holds once initialized, plus what only this module saw. */
interface ReportParts {
  ms: number
  protocolVersion: string | undefined
  tools: ToolRead | null
  stderr: string
}

/** The answer in the shape the cache keeps, with every cap applied. */
function reportOf(client: Client, parts: ReportParts): McpProbeReport {
  const version = client.getServerVersion()
  const serverInfo =
    version === undefined
      ? undefined
      : {
          name: version.name,
          ...(version.title === undefined ? {} : { title: version.title }),
          version: version.version,
          ...(version.description === undefined || version.description === ""
            ? {}
            : { description: version.description }),
          ...(version.websiteUrl === undefined ? {} : { websiteUrl: version.websiteUrl }),
        }
  const icon = pickIcon(version?.icons)
  const capabilities = client.getServerCapabilities()
  const instructions = client.getInstructions()

  return {
    ok: true,
    ms: parts.ms,
    ...(parts.protocolVersion === undefined ? {} : { protocolVersion: parts.protocolVersion }),
    ...(serverInfo === undefined ? {} : { serverInfo }),
    ...(icon === undefined ? {} : { icon }),
    ...(capabilities === undefined ? {} : { capabilities: capabilities as Record<string, unknown> }),
    ...(instructions === undefined || instructions === ""
      ? {}
      : { instructions }),
    ...(parts.tools === null
      ? {}
      : {
          tools: parts.tools.tools,
          ...(parts.tools.trimmed === 0 ? {} : { toolsTrimmed: parts.tools.trimmed }),
        }),
    ...(parts.stderr === "" ? {} : { stderr: parts.stderr }),
  }
}

/** What one tool read produced, before the caps decided what is kept. */
interface ToolRead {
  tools: McpProbeTool[]
  trimmed: number
}

/** Read every page of the tool list, up to the caps; null when the server offers none. */
async function readTools(client: Client, timeoutMs: number): Promise<ToolRead | null> {
  if (client.getServerCapabilities()?.tools === undefined) return null
  const tools: McpProbeTool[] = []
  let size = 0
  let seen = 0
  let cursor: string | undefined

  for (let page = 0; page < TOOL_PAGES_MAX; page += 1) {
    const answer = await client.listTools(cursor === undefined ? undefined : { cursor }, {
      timeout: timeoutMs,
    })
    for (const tool of answer.tools) {
      seen += 1
      if (tools.length >= TOOLS_MAX) continue
      const kept = mapTool(tool)
      const bytes = JSON.stringify(kept).length
      if (size + bytes > TOOLS_LIMIT) continue
      tools.push(kept)
      size += bytes
    }
    cursor = answer.nextCursor
    if (cursor === undefined) break
  }
  return { tools, trimmed: seen - tools.length }
}

/** One tool as the pane needs it; a title falls back to the annotation's. */
function mapTool(tool: Tool): McpProbeTool {
  const title = tool.title ?? tool.annotations?.title
  return {
    name: tool.name,
    ...(title === undefined ? {} : { title }),
    ...(tool.description === undefined ? {} : { description: tool.description }),
    ...(tool.inputSchema === undefined ? {} : { inputSchema: tool.inputSchema }),
    ...(tool.outputSchema === undefined ? {} : { outputSchema: tool.outputSchema }),
  }
}

/**
 * The one icon a panel draws: a data URI first — it is self-contained and
 * phones nowhere — then an https URL, and a light or untinted icon over a
 * dark-tinted one. SVG is kept too; a renderer shows it through an `img`,
 * never inline.
 */
function pickIcon(value: unknown): McpProbeIcon | undefined {
  const icons = readIcons(value)
  const light = icons.filter((icon) => icon.theme !== "dark")
  const pool = light.length > 0 ? light : icons
  const chosen = pool.find((icon) => icon.src.startsWith("data:")) ?? pool.find((icon) => icon.src.startsWith("https://"))
  if (chosen === undefined) return undefined
  if (chosen.src.startsWith("data:") && chosen.src.length > ICON_LIMIT) return undefined
  return chosen
}

/** The icons a server offered, keeping the fields a renderer uses. */
function readIcons(value: unknown): McpProbeIcon[] {
  if (!Array.isArray(value)) return []
  const icons: McpProbeIcon[] = []
  for (const held of value) {
    if (typeof held !== "object" || held === null) continue
    const read = held as { src?: unknown; mimeType?: unknown; sizes?: unknown; theme?: unknown }
    if (typeof read.src !== "string" || read.src === "") continue
    icons.push({
      src: read.src,
      ...(typeof read.mimeType === "string" ? { mimeType: read.mimeType } : {}),
      ...(Array.isArray(read.sizes)
        ? { sizes: read.sizes.filter((size): size is string => typeof size === "string") }
        : {}),
      ...(read.theme === "light" || read.theme === "dark" ? { theme: read.theme } : {}),
    })
  }
  return icons
}

/** A stdio server has to start a process; a remote one answers over the network. */
function defaultTimeout(declaration: McpDeclaration): number {
  return declaration.transport === "stdio" ? STDIO_TIMEOUT_MS : REMOTE_TIMEOUT_MS
}

/** The transport a declaration names, with its options applied. */
function createTransport(
  declaration: McpDeclaration,
  cwd: string | null,
  onStderr: (chunk: string) => void
): Transport {
  if (declaration.transport === "stdio") {
    const transport = new StdioClientTransport({
      command: declaration.command,
      args: declaration.args,
      /* The SDK's default environment plus the declaration's, which is what a client does. */
      env: { ...getDefaultEnvironment(), ...declaration.env },
      ...(cwd === null ? {} : { cwd }),
      /* Piped, not inherited: a failed probe shows the child's last words. */
      stderr: "pipe",
    })
    transport.stderr?.on("data", (chunk: Buffer) => onStderr(chunk.toString("utf8")))
    return transport
  }
  const url = new URL(declaration.url)
  const requestInit = Object.keys(declaration.headers).length === 0 ? {} : { headers: declaration.headers }
  return declaration.transport === "sse"
    ? new SSEClientTransport(url, { requestInit })
    : new StreamableHTTPClientTransport(url, { requestInit })
}

/**
 * A transport that watches for the initialize result on its way in: that
 * message is the only place the negotiated protocol version appears, and the
 * SDK keeps no accessor for it.
 */
class TappedTransport implements Transport {
  onclose?: () => void
  onerror?: (error: Error) => void
  onmessage?: (message: JSONRPCMessage) => void

  private readonly inner: Transport
  private readonly found: (version: string) => void

  constructor(inner: Transport, found: (version: string) => void) {
    this.inner = inner
    this.found = found
    inner.onclose = () => this.onclose?.()
    inner.onerror = (error) => this.onerror?.(error)
    inner.onmessage = (message) => {
      const version = initializeVersionOf(message)
      if (version !== null) this.found(version)
      this.onmessage?.(message)
    }
  }

  start(): Promise<void> {
    return this.inner.start()
  }

  close(): Promise<void> {
    return this.inner.close()
  }

  send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
    return this.inner.send(message, options)
  }

  setProtocolVersion(version: string): void {
    this.inner.setProtocolVersion?.(version)
  }
}

/** Wrap one transport so the initialize result can be read as it passes. */
function tapProtocolVersion(inner: Transport, found: (version: string) => void): Transport {
  return new TappedTransport(inner, found)
}

/** The protocol version an initialize result carries, or null for any other message. */
function initializeVersionOf(message: JSONRPCMessage): string | null {
  if (!("result" in message)) return null
  const result = message.result
  if (typeof result !== "object" || result === null) return null
  const version = (result as { protocolVersion?: unknown }).protocolVersion
  return typeof version === "string" ? version : null
}

/** A `${VAR}` the probe needed and the environment does not set. */
class MissingVariableError extends Error {
  readonly variable: string

  constructor(variable: string) {
    super(`missing environment variable: ${variable}`)
    this.name = "MissingVariableError"
    this.variable = variable
  }
}

/**
 * The declaration with `${VAR}` and `${VAR:-default}` expanded — the two forms
 * a client file may use, applied to the command, the arguments, the URL and
 * every value. Expansion happens here, at probe time, and its result is never
 * written back: the file keeps the placeholder.
 *
 * @throws MissingVariableError when a `${VAR}` without a default is unset.
 */
function expandDeclaration(declaration: McpDeclaration): McpDeclaration {
  if (declaration.transport === "stdio") {
    return {
      transport: "stdio",
      command: expandText(declaration.command),
      args: declaration.args.map((arg) => expandText(arg)),
      env: mapValues(declaration.env, expandText),
    }
  }
  return {
    transport: declaration.transport,
    url: expandText(declaration.url),
    headers: mapValues(declaration.headers, expandText),
  }
}

const PLACEHOLDER = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g

/** One string with its placeholders filled, or a named failure. */
function expandText(text: string): string {
  return text.replace(PLACEHOLDER, (_match, name: string, fallback: string | undefined) => {
    const value = process.env[name]
    if (value !== undefined) return value
    if (fallback !== undefined) return fallback
    throw new MissingVariableError(name)
  })
}

/** Every value of one map, expanded; the keys stay as written. */
function mapValues(values: Record<string, string>, map: (text: string) => string): Record<string, string> {
  const expanded: Record<string, string> = {}
  for (const [key, value] of Object.entries(values)) expanded[key] = map(value)
  return expanded
}

/** What a thrown value means, in the vocabulary the panel translates. */
function classify(error: unknown): McpProbeError {
  if (error instanceof MissingVariableError) {
    return { kind: "env", message: error.message, params: { name: error.variable } }
  }
  const message = error instanceof Error ? error.message : String(error)
  const held = (typeof error === "object" && error !== null ? error : {}) as {
    code?: unknown
    name?: unknown
  }
  const code =
    typeof held.code === "string" || typeof held.code === "number" ? String(held.code) : undefined
  const named = typeof held.name === "string" ? held.name : ""
  const withCode = code === undefined ? {} : { code }

  if (named === "UnauthorizedError" || code === "401" || code === "403" || /unauthoriz|forbidden|\b40[13]\b/i.test(message)) {
    return { kind: "auth", message, ...withCode }
  }
  /* "Connection closed" is what the SDK reports when a spawned server exits
     before it answers, which is a process failure like a missing command. */
  if (/connection closed/i.test(message)) {
    return { kind: "spawn", message, ...withCode }
  }
  if (code === "ENOENT" || code === "EACCES" || code === "EINVAL" || /\bspawn\b/i.test(message)) {
    return { kind: "spawn", message, ...withCode }
  }
  if (
    code === String(ErrorCode.RequestTimeout) ||
    named === "AbortError" ||
    /timed? ?out|timeout/i.test(message)
  ) {
    return { kind: "timeout", message, ...withCode }
  }
  if (
    (code !== undefined && /^E(CONN|AI|HOST|PIPE|NOTFOUND)/.test(code)) ||
    /fetch failed|network|socket hang up/i.test(message)
  ) {
    return { kind: "network", message, ...withCode }
  }
  if (error instanceof McpError || /invalid url|json-?rpc/i.test(message)) {
    return { kind: "protocol", message, ...withCode }
  }
  return { kind: "unknown", message, ...withCode }
}

/** Keep the last `limit` characters, which is where a failing process's reason is. */
function tail(text: string, limit: number): string {
  return text.length <= limit ? text : `…${text.slice(text.length - limit)}`
}
