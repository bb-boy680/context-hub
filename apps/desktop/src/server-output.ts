/**
 * The one line the server reports once it is listening. It is parsed from
 * complete lines only: a chunk boundary can arrive in the middle of the port,
 * and half a port would be a valid-looking URL for the wrong listener.
 */
export function serverUrlFrom(text: string): string | null {
  const lines = text.split("\n")
  /* The last piece has no newline yet, so it may still be growing. */
  lines.pop()
  for (const line of lines) {
    const match = /^context hub server listening on (http:\/\/\S+)$/.exec(line.trim())
    if (match !== null) return match[1]
  }
  return null
}
