/**
 * Where the hub keeps its own files. One home holds everything the hub owns —
 * today the skill library and the assets its skills reference — so a form can
 * point at a scratch directory with `CONTEXT_HUB_HOME` and leave the real one
 * alone.
 */
import { homedir } from "node:os"
import path from "node:path"

/** Resolve the hub home: explicit path, then `$CONTEXT_HUB_HOME`, then `~/.context-hub`. */
export function resolveHubHome(explicit?: string): string {
  if (explicit !== undefined && explicit.trim() !== "") return explicit
  const fromEnv = process.env.CONTEXT_HUB_HOME
  if (fromEnv !== undefined && fromEnv.trim() !== "") return fromEnv
  return path.join(homedir(), ".context-hub")
}

/** How an absolute path is shown to a person, without leaking machine paths. */
export function displayPath(target: string): string {
  const home = homedir()
  return target.startsWith(home) ? `~${target.slice(home.length)}` : target
}

/**
 * The directory a person's own files live under, which is what an agent reads
 * outside any project. Distinct from {@link resolveHubHome}, which is where the
 * hub keeps its own files.
 */
export function userHome(): string {
  return homedir()
}
