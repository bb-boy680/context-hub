/**
 * English defaults for the `claudeCode.*` namespace. A language pack translates
 * these keys; the kernel falls back to this table for any it does not carry.
 */
export const claudeCodeMessages: Record<string, string> = {
  "claudeCode.tab": "Claude Code",
  "claudeCode.error.refused": "The hub could not read or write Claude Code's config files.",
  "claudeCode.error.unknownPlace": "Claude Code has no client file called {place}.",
  "claudeCode.error.noProject":
    "Claude Code has no record for this folder in {file}, so it has nowhere to keep the switch.",
  "claudeCode.error.noWorkspace": "No workspace is open, so there is no project to switch.",
}
