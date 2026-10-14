/**
 * What a skill was installed from, read back from the skills CLI's own record.
 *
 * The CLI writes `skills-lock.json` beside the folder it installed into: one
 * entry per skill, naming the package it came from and the hash of the
 * directory it wrote. Every hash a check compares is the CLI's own, taken
 * when the CLI ran — nothing here recomputes one for a skill it installed.
 * The single question the CLI cannot answer is whether the files here were
 * edited after that install, because it never hashes what is on disk, so
 * `skillFolderHash` repeats the same algorithm for exactly that.
 *
 * That algorithm lives in `@workspace/core/host/folder-hash` — the plugin
 * library hashes its packs with it too, and one implementation is one place for
 * this to be wrong. This module only re-exports it under the name the skills
 * code has always used.
 */
import { promises as fs } from "node:fs"
import path from "node:path"

import { folderHash } from "@workspace/core/host/folder-hash"

import type { SkillUpstream } from "../store.ts"

/** The file the CLI writes at the root of the folder it installed into. */
const LOCK_FILE = "skills-lock.json"

/**
 * The hash the skills CLI computes over one skill directory, and records in
 * `skills-lock.json`.
 *
 * @param dir — the skill directory, absolute.
 * @returns the hex digest the CLI would record for it.
 */
export const skillFolderHash = folderHash

/** One lock entry, as much of it as the hub reads. */
interface LockEntry {
  source?: unknown
  sourceType?: unknown
  skillPath?: unknown
  computedHash?: unknown
}

function asUpstream(entry: LockEntry): SkillUpstream | null {
  const { source, sourceType, skillPath, computedHash } = entry
  if (
    typeof source !== "string" ||
    typeof skillPath !== "string" ||
    typeof computedHash !== "string"
  ) {
    return null
  }
  /* A folder on this machine is no upstream: it cannot be asked for a revision
     from here, and the path in the lock is relative to where it was written. */
  if (sourceType === "local") return null
  return {
    source,
    sourceType: typeof sourceType === "string" ? sourceType : "git",
    skillPath,
    hash: computedHash,
  }
}

/**
 * Read what the skills CLI recorded for one skill, out of the lock file at a
 * workspace's root. The entry is keyed by the name the CLI installed, which is
 * the directory name here; a lock written under another display name is found
 * by the directory its `skillPath` names.
 *
 * @param where — the folder the lock file sits in, usually the workspace root.
 * @param id — the skill's directory name.
 * @returns the record, or `null` when the file, the entry, or its fields are missing.
 */
export async function readLockedUpstream(
  where: string,
  id: string
): Promise<SkillUpstream | null> {
  const text = await fs.readFile(path.join(where, LOCK_FILE), "utf8").catch(() => null)
  if (text === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  const skills = (parsed as { skills?: unknown }).skills
  if (skills === null || typeof skills !== "object") return null
  const entries = skills as Record<string, LockEntry>
  const named = entries[id]
  if (named !== undefined) return asUpstream(named)
  for (const entry of Object.values(entries)) {
    const record = asUpstream(entry)
    if (record === null) continue
    const owner = path.dirname(record.skillPath.split("/").join(path.sep))
    if (path.basename(owner) === id) return record
  }
  return null
}
