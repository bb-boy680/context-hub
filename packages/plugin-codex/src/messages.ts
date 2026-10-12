/**
 * English defaults for the `codex.*` namespace. A language pack translates
 * these keys; the kernel falls back to this table for any it does not carry.
 */
export const codexMessages: Record<string, string> = {
  "codex.error.parse": "Codex's config file is not TOML this hub can read.",
  "codex.error.refused": "The hub could not write {file}.",
  "codex.error.unknownPlace": "Codex has no client file called {place}.",
}
