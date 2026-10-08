/**
 * Taking over a folder a person dropped in the browser. The page already read
 * the files it was given, so what arrives here is a list of relative paths and
 * bytes; this module decides which of them are skills and writes each one into
 * the library root as its own directory.
 */
import { promises as fs } from "node:fs"
import path from "node:path"

import type { ImportedFile, SkillImport } from "../store.ts"
import { assertSkillName } from "./names.ts"

const MANIFEST = "SKILL.md"

/** Split one relative path into safe segments; `null` when it climbs or is bare. */
function segments(relative: string): string[] | null {
  const parts = relative
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part !== "" && part !== ".")
  if (parts.length < 2 || parts.some((part) => part === "..")) return null
  return parts
}

/**
 * Write the files of a dropped folder into the library.
 *
 * @param files — every file the page read, keyed by its path inside the drop.
 *   The first segment names the skill; a folder without a SKILL.md is not one
 *   and is skipped rather than reported.
 * @param root — the skills directory the folders land in.
 * @returns the folders that became skills and the ones that were refused.
 */
export async function importFolder(
  files: ImportedFile[],
  root: string
): Promise<SkillImport> {
  const groups = new Map<string, { path: string; base64: string }[]>()
  for (const file of files) {
    const parts = segments(file.path)
    if (parts === null) continue
    const [name, ...rest] = parts
    const group = groups.get(name) ?? []
    group.push({ path: rest.join("/"), base64: file.base64 })
    groups.set(name, group)
  }

  const result: SkillImport = { installed: [], failed: [] }
  for (const [name, group] of groups) {
    try {
      const hasManifest = group.some(
        (file) => file.path.toLowerCase() === MANIFEST.toLowerCase()
      )
      if (!hasManifest) continue
      const target = path.join(root, assertSkillName(name))
      const taken = await fs.stat(target).catch(() => null)
      if (taken !== null) {
        throw new Error("a skill with this name is already in the library")
      }
      await fs.mkdir(target, { recursive: true })
      try {
        for (const file of group) {
          const absolute = path.join(target, ...file.path.split("/"))
          await fs.mkdir(path.dirname(absolute), { recursive: true })
          await fs.writeFile(absolute, Buffer.from(file.base64, "base64"))
        }
      } catch (failure) {
        /* A half-written folder is not a skill: take it back out. */
        await fs.rm(target, { recursive: true, force: true })
        throw failure
      }
      result.installed.push(name)
    } catch (failure) {
      result.failed.push({
        name,
        reason: failure instanceof Error ? failure.message : String(failure),
      })
    }
  }
  return result
}
