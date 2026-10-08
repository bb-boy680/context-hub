/**
 * Writing the skills a folder read produced into the library. The page found
 * them and read their bytes; what arrives here is one directory per skill, each
 * with the files under it, and this module is what turns that into a skill the
 * catalog can index.
 */
import { promises as fs } from "node:fs"
import path from "node:path"

import type { ImportedSkill, SkillImport } from "../store.ts"
import { assertSkillName } from "./names.ts"

const MANIFEST = "SKILL.md"

/** Split one relative path into safe segments; `null` when it climbs or is bare. */
function segments(relative: string): string[] | null {
  const parts = relative
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part !== "" && part !== ".")
  if (parts.length === 0 || parts.some((part) => part === "..")) return null
  return parts
}

/**
 * Write the chosen skills into the library.
 *
 * @param skills — one entry per skill: the directory name it takes, and every
 *   file under it with paths relative to that directory.
 * @param root — the skills directory the folders land in.
 * @returns the skills now in the library and the ones that were refused, each
 *   with a reason fit to show. A skill that cannot be written whole is removed
 *   again rather than left half in place.
 */
export async function importFolder(
  skills: ImportedSkill[],
  root: string
): Promise<SkillImport> {
  const result: SkillImport = { installed: [], failed: [] }
  for (const skill of skills) {
    try {
      const name = assertSkillName(skill.name)
      const hasManifest = skill.files.some(
        (file) => file.path.toLowerCase() === MANIFEST.toLowerCase()
      )
      if (!hasManifest) throw new Error(`no ${MANIFEST} at the folder root`)
      const target = path.join(root, name)
      const taken = await fs.stat(target).catch(() => null)
      if (taken !== null) {
        throw new Error("a skill with this name is already in the library")
      }
      await fs.mkdir(target, { recursive: true })
      try {
        for (const file of skill.files) {
          const parts = segments(file.path)
          if (parts === null) throw new Error(`unusable file path: ${file.path}`)
          const absolute = path.join(target, ...parts)
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
        name: skill.name,
        reason: failure instanceof Error ? failure.message : String(failure),
      })
    }
  }
  return result
}
