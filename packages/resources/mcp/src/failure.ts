/**
 * How one client's failure reaches the screen: a message key and its
 * placeholders, which the module that renders it turns into a sentence in the
 * reader's language. Nothing an extension throws is shown as thrown — the
 * package that knows the client owns its own keys, and this is the shape both
 * sides agree on.
 */

/** One failure, as the extension that produced it named it. */
export interface McpFailure {
  /** The message key, in the namespace of the extension that reports it. */
  key: string
  /** The values the key's placeholders take. */
  params?: Record<string, string>
  /** What the platform said, kept for the log rather than for the screen. */
  detail?: string
}

/**
 * A failure an extension already named: what it throws when it knows which
 * message the reader should see.
 */
export class McpError extends Error {
  /** The message key, in the throwing extension's namespace. */
  readonly key: string
  /** The values that key's placeholders take. */
  readonly params: Record<string, string> | undefined

  constructor(key: string, params?: Record<string, string>, detail?: string) {
    super(detail === undefined ? key : `${key}: ${detail}`)
    this.name = "McpError"
    this.key = key
    this.params = params
  }

  /** This failure, in the shape a caller passes to the page. */
  get failure(): McpFailure {
    return { key: this.key, params: this.params, detail: this.message }
  }
}

/**
 * The failure a caught value stands for: the one it named when it named one,
 * and `fallback` otherwise — a key the catching module owns, so an unexpected
 * throw still reads as a sentence rather than as an English stack line.
 */
export function mcpFailure(error: unknown, fallback: string): McpFailure {
  if (error instanceof McpError) return error.failure
  const detail = error instanceof Error ? error.message : String(error)
  return { key: fallback, detail }
}

/**
 * The sentence one failure reads as: its key resolved, its placeholders filled.
 *
 * It travels with the failure rather than with a page because a failure can be
 * reported where no page is: a probe answers a library that outlives every
 * page drawn from it, and what it reports has to be a sentence before it gets
 * there.
 *
 * @param t — the active locale's lookup.
 * @param failure — the failure, as the extension that produced it named it.
 */
export function failureText(t: (key: string) => string, failure: McpFailure): string {
  let text = t(failure.key)
  for (const [name, value] of Object.entries(failure.params ?? {})) {
    text = text.replace(`{${name}}`, value)
  }
  return text
}
