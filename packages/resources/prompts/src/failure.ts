/**
 * How one provider's failure reaches the screen: a message key and its
 * placeholders, which the page turns into a sentence in the reader's language.
 *
 * Nothing a provider throws is shown as thrown — the extension that knows the
 * agent owns its own keys, and this is the shape both sides agree on.
 */

/** One failure, as the provider that produced it named it. */
export interface PromptFailure {
  /** The message key, in the namespace of the extension that reports it. */
  key: string
  /** The values the key's placeholders take. */
  params?: Record<string, string>
  /** What the platform said, kept for the log rather than for the screen. */
  detail?: string
}

/**
 * A failure a provider already named: what it throws when it knows which
 * message the reader should see.
 */
export class PromptError extends Error {
  /** The message key, in the throwing extension's namespace. */
  readonly key: string
  /** The values that key's placeholders take. */
  readonly params: Record<string, string> | undefined

  constructor(key: string, params?: Record<string, string>, detail?: string) {
    super(detail === undefined ? key : `${key}: ${detail}`)
    this.name = "PromptError"
    this.key = key
    this.params = params
  }

  /** This failure, in the shape a caller passes to the page. */
  get failure(): PromptFailure {
    return { key: this.key, params: this.params, detail: this.message }
  }
}

/**
 * The failure a caught value stands for: the one it named when it named one,
 * and `fallback` otherwise — a key the catching module owns, so an unexpected
 * throw still reads as a sentence rather than as an English stack line.
 */
export function promptFailure(error: unknown, fallback: string): PromptFailure {
  if (error instanceof PromptError) return error.failure
  const detail = error instanceof Error ? error.message : String(error)
  return { key: fallback, detail }
}

/**
 * The sentence one failure reads as: its key resolved, its placeholders filled.
 *
 * @param t — the active locale's lookup.
 * @param failure — the failure, as the extension that produced it named it.
 */
export function failureText(t: (key: string) => string, failure: PromptFailure): string {
  let text = t(failure.key)
  for (const [name, value] of Object.entries(failure.params ?? {})) {
    text = text.replace(`{${name}}`, value)
  }
  return text
}
