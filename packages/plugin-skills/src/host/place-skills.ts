/**
 * The skills one place holds, and the two roots a place can sit under. A place
 * is a directory relative to a scope's root, never an absolute path: the
 * `.agents/skills` the skills CLI installs into is in every workspace, and an
 * agent integration contributes its own directory, e.g. `.claude/skills` there
 * or under the home directory.
 *
 * The hub installs by LINK, not by copy: a link needs no second copy and no
 * record of its own — the entry itself says where it came from, so anyone
 * looking at the folder (this hub, another tool, a person) can tell an
 * installed skill from one the project wrote.
 */
import { promises as fs } from "node:fs"
import path from "node:path"

import { displayPath } from "@workspace/core/host/home"

import { parseSkillFile } from "../frontmatter.ts"
import { walkSkillDir } from "./file-tree.ts"
import { assertSkillName } from "./names.ts"
import type {
  PlaceSkill,
  PlaceSkillDetail,
  PlaceSkillOrigin,
  PlaceSkillsView,
  SkillInstall,
} from "../store.ts"

/** The file that makes a directory a skill. */
const MANIFEST = "SKILL.md"

/**
 * Validate one place's skills directory, which arrives from a contribution.
 *
 * @param dir — the directory inside the scope's root, `/`-separated.
 * @returns the same path in this platform's separator form.
 * @throws when the value is absolute, empty, or climbs out of that root.
 */
export function assertSkillDir(dir: string): string {
  const parts = dir.split(/[\\/]+/).filter((part) => part !== "" && part !== ".")
  if (path.isAbsolute(dir) || parts.length === 0 || parts.includes("..")) {
    throw new Error(`not a directory inside its root: ${dir}`)
  }
  return path.join(...parts)
}

/**
 * Codes a link can fail with when the filesystem does not support one — an
 * exFAT stick, a network share, a Windows account without the privilege. The
 * install falls back to a copy for these and reports the real failure for
 * anything else.
 */
const LINK_UNSUPPORTED = new Set(["EPERM", "EACCES", "ENOTSUP", "EINVAL", "UNKNOWN"])

/** Whether one path sits inside a directory, on either separator. */
function isInside(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
}

/** Where a link points, resolved against the directory that holds it. */
function targetOf(link: string, at: string): string {
  return path.isAbsolute(link) ? link : path.resolve(path.dirname(at), link)
}

/**
 * The skills directory of one place, under the root its scope names; nothing is
 * created by reading it.
 *
 * @param base — the scope's root: the workspace folder, or the home directory.
 * @param dir — the place's directory inside that root.
 */
export function placeSkillRoot(base: string, dir: string): string {
  return path.join(base, assertSkillDir(dir))
}

/**
 * Read the skills one place holds.
 *
 * @param base — the scope's root: the workspace folder, or the home directory.
 * @param libraryRoot — the hub's own library, which tells an installed skill
 *   from one somebody else wrote.
 * @param dir — the place's directory inside that root.
 * @returns every skill the place holds, and where it came from.
 */
export async function readPlaceSkills(
  base: string,
  libraryRoot: string,
  dir: string
): Promise<PlaceSkillsView> {
  const root = placeSkillRoot(base, dir)
  const view = { root, display: displayPath(root) }
  const dirents = await fs.readdir(root, { withFileTypes: true }).catch(() => null)
  if (dirents === null) return { ...view, skills: [] }

  const skills: PlaceSkill[] = []
  for (const dirent of dirents) {
    /* A dot-prefixed entry is somebody's working file, not a skill: it is also
       what this hub's own directory swaps leave behind mid-replacement. */
    if (dirent.name.startsWith(".")) continue
    const dir = path.join(root, dirent.name)
    const stat = await fs.lstat(dir).catch(() => null)
    if (stat === null) continue
    let link: string | null = null
    let origin: PlaceSkillOrigin = "own"
    if (stat.isSymbolicLink()) {
      link = await fs.readlink(dir).catch(() => null)
      if (link !== null && isInside(libraryRoot, targetOf(link, dir))) {
        const reached = await fs.stat(dir).catch(() => null)
        origin = reached === null ? "stale" : "hub"
      }
    } else if (!stat.isDirectory()) {
      continue
    }
    const text = await fs.readFile(path.join(dir, MANIFEST), "utf8").catch(() => null)
    /* A link the library no longer answers for has no manifest to read; the
       entry still belongs in the list, because it is what needs cleaning up. */
    if (text === null && origin !== "stale") continue
    const frontmatter = text === null ? {} : parseSkillFile(text).frontmatter
    skills.push({
      id: dirent.name,
      name: frontmatter.name ?? dirent.name,
      description: frontmatter.description ?? "",
      origin,
      ...(link === null ? {} : { link }),
    })
  }
  skills.sort((left, right) => left.id.localeCompare(right.id))
  return { ...view, skills }
}

/**
 * Read one skill a place holds, where it lives.
 *
 * @param base — the scope's root: the workspace folder, or the home directory.
 * @param id — the skill's directory name under the place's skills root.
 * @param dir — the place's directory inside that root.
 * @returns the manifest as written and the files beside it, or `null` when the
 *   folder holds no such skill.
 */
export async function readPlaceSkill(
  base: string,
  id: string,
  dir: string
): Promise<PlaceSkillDetail | null> {
  const dirPath = path.join(placeSkillRoot(base, dir), assertSkillName(id))
  const text = await fs.readFile(path.join(dirPath, MANIFEST), "utf8").catch(() => null)
  if (text === null) return null
  const frontmatter = parseSkillFile(text).frontmatter
  return {
    id,
    name: frontmatter.name ?? id,
    description: frontmatter.description ?? "",
    text,
    files: await walkSkillDir(dirPath),
  }
}

/**
 * Read one text file of a skill a place holds.
 *
 * @param base — the scope's root: the workspace folder, or the home directory.
 * @param id — the skill's directory name under the place's skills root.
 * @param file — the file's path inside that directory, `/`-separated.
 * @param dir — the place's directory inside that root.
 * @returns the file's text, or `null` when it is not there or not readable.
 * @throws when the path climbs out of the skill's own directory.
 */
export async function readPlaceSkillFile(
  base: string,
  id: string,
  file: string,
  dir: string
): Promise<string | null> {
  const skillRoot = path.join(placeSkillRoot(base, dir), assertSkillName(id))
  const target = path.resolve(skillRoot, file)
  const prefix = skillRoot.endsWith(path.sep) ? skillRoot : skillRoot + path.sep
  if (!target.startsWith(prefix)) {
    throw new Error(`path escapes the skill directory: ${file}`)
  }
  return fs.readFile(target, "utf8").catch(() => null)
}

/**
 * Put one library skill into a place, as a link into the library.
 *
 * @param base — the scope's root: the workspace folder, or the home directory.
 * @param libraryRoot — the hub's own library, where the skill lives.
 * @param id — the skill's directory name in the library.
 * @param dir — the place's directory inside that root.
 * @returns how it landed: `link` where the filesystem allows one, else `copy`.
 */
export async function installSkillInto(
  base: string,
  libraryRoot: string,
  id: string,
  dir: string
): Promise<SkillInstall> {
  const name = assertSkillName(id)
  const source = path.join(libraryRoot, name)
  if (!(await fs.stat(source).then((stat) => stat.isDirectory(), () => false))) {
    throw new Error(`not a skill in the library: ${id}`)
  }
  const root = placeSkillRoot(base, dir)
  await fs.mkdir(root, { recursive: true })
  const target = path.join(root, name)
  const existing = await fs.lstat(target).catch(() => null)
  if (existing !== null) throw new Error(`already in this place: ${id}`)

  try {
    await fs.symlink(source, target, process.platform === "win32" ? "junction" : "dir")
    return "link"
  } catch (error) {
    const code = (error as { code?: string }).code ?? ""
    if (!LINK_UNSUPPORTED.has(code)) throw error
    /* The filesystem cannot hold a link, so the skill lands as its own copy and
       stops being the hub's to track. */
    try {
      await fs.cp(source, target, { recursive: true })
    } catch (failure) {
      await fs.rm(target, { recursive: true, force: true }).catch(() => undefined)
      throw failure
    }
    return "copy"
  }
}

/**
 * Link one skill a place holds into the hub's library. The place keeps its own
 * directory and the library reaches it through the link, so the skill stays one
 * skill in two places rather than two copies that drift apart.
 *
 * @param base — the scope's root: the workspace folder, or the home directory.
 * @param libraryRoot — the hub's own library, where the link is made.
 * @param id — the skill's directory name under the place's skills root.
 * @param dir — the place's directory inside that root.
 * @returns how it landed: `link` where the filesystem allows one, else `copy`.
 *   A copy is the only option on a filesystem with no links, and then the
 *   library owns its own set of files.
 */
export async function linkSkillIntoLibrary(
  base: string,
  libraryRoot: string,
  id: string,
  dir: string
): Promise<SkillInstall> {
  const name = assertSkillName(id)
  const source = path.join(placeSkillRoot(base, dir), name)
  const listed = await fs.stat(source).catch(() => null)
  if (listed?.isDirectory() !== true) {
    throw new Error(`not a skill in this place: ${id}`)
  }
  const target = path.join(libraryRoot, name)
  if ((await fs.lstat(target).catch(() => null)) !== null) {
    throw new Error(`a skill with this name is already in the library: ${id}`)
  }

  try {
    await fs.symlink(source, target, process.platform === "win32" ? "junction" : "dir")
    return "link"
  } catch (error) {
    const code = (error as { code?: string }).code ?? ""
    if (!LINK_UNSUPPORTED.has(code)) throw error
    /* The filesystem cannot hold a link, so the library keeps its own copy and
       the two stop being the same skill. */
    try {
      await fs.cp(source, target, { recursive: true, dereference: true })
    } catch (failure) {
      await fs.rm(target, { recursive: true, force: true }).catch(() => undefined)
      throw failure
    }
    return "copy"
  }
}

/**
 * Take one library skill out of a place.
 *
 * @param base — the scope's root: the workspace folder, or the home directory.
 * @param libraryRoot — the hub's own library, which decides what the hub may remove.
 * @param id — the skill's directory name.
 * @param dir — the place's directory inside that root.
 * @returns nothing; a skill this hub did not install is refused, not deleted.
 */
export async function removeSkillFrom(
  base: string,
  libraryRoot: string,
  id: string,
  dir: string
): Promise<void> {
  const target = path.join(placeSkillRoot(base, dir), assertSkillName(id))
  const stat = await fs.lstat(target).catch(() => null)
  if (stat === null) throw new Error(`not in this place: ${id}`)
  const link = stat.isSymbolicLink() ? await fs.readlink(target).catch(() => null) : null
  if (link === null || !isInside(libraryRoot, targetOf(link, target))) {
    throw new Error(`not installed by Context Hub: ${id}`)
  }
  /* No `recursive`: this removes the entry, and a link has nothing under it. */
  await fs.rm(target, { force: true })
}

/**
 * Delete one skill from a place, its directory included. This is the
 * destructive one: the skill's own directory goes, so a stored link goes with
 * it and so does everything beside the manifest.
 *
 * @param base — the scope's root: the workspace folder, or the home directory.
 * @param id — the skill's directory name under the place's skills root.
 * @param dir — the place's directory inside that root.
 * @returns nothing; a name that is not a skill there is refused, not removed.
 */
export async function deleteSkillIn(
  base: string,
  id: string,
  dir: string
): Promise<void> {
  const target = path.join(placeSkillRoot(base, dir), assertSkillName(id))
  const stat = await fs.lstat(target).catch(() => null)
  if (stat === null) throw new Error(`not in this place: ${id}`)
  /* A link is deleted as the entry it is; only a directory can be a skill. */
  if (stat.isSymbolicLink()) {
    await fs.rm(target, { force: true })
    return
  }
  if (!stat.isDirectory()) throw new Error(`not a skill in this place: ${id}`)
  if ((await fs.stat(path.join(target, MANIFEST)).catch(() => null))?.isFile() !== true) {
    throw new Error(`not a skill in this place: ${id}`)
  }
  await fs.rm(target, { recursive: true, force: true })
}
