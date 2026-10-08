/**
 * Reading a folder a person dropped or picked. The browser hands over files
 * with no directory structure of their own, so this module keeps each file's
 * path inside the drop, groups them by their first segment, and treats a group
 * as a skill only when it carries a SKILL.md.
 */
import { parseSkillFile } from "./frontmatter.ts"
import type { ImportedFile } from "./store.ts"

/** One file a folder read produced, with the path it had inside the drop. */
export interface DroppedFile {
  /** Path relative to the dropped folder, `/`-separated. */
  path: string
  file: File
}

/** One skill found in a folder, before anything is copied into the library. */
export interface FolderSkill {
  /** Folder name, which is also the id it takes in the library. */
  name: string
  description: string
  files: DroppedFile[]
}

const MANIFEST = "SKILL.md"

/** Split a path into its segments, dropping the empty ones a leading slash leaves. */
function segments(path: string): string[] {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part !== "")
}

/** The files a directory picker answered with. */
export function filesFromPicker(input: HTMLInputElement): DroppedFile[] {
  return Array.from(input.files ?? []).map((file) => ({
    /* A picked directory reports the folder it was chosen from as its first segment. */
    path: file.webkitRelativePath === "" ? file.name : file.webkitRelativePath,
    file,
  }))
}

/** One directory entry's file, or nothing when the entry disappeared meanwhile. */
function readFileEntry(entry: FileSystemFileEntry): Promise<File[]> {
  return new Promise((resolve) => {
    entry.file(
      (file) => resolve([file]),
      () => resolve([])
    )
  })
}

/** Every child of a directory entry; the reader answers in batches. */
function readDirectoryEntry(entry: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = entry.createReader()
  return new Promise((resolve) => {
    const found: FileSystemEntry[] = []
    const readBatch = () => {
      reader.readEntries(
        (batch) => {
          if (batch.length === 0) {
            resolve(found)
            return
          }
          found.push(...batch)
          readBatch()
        },
        () => resolve(found)
      )
    }
    readBatch()
  })
}

/** Walk one entry into the files under it, keeping the paths of the drop. */
async function readEntry(entry: FileSystemEntry, parent: string): Promise<DroppedFile[]> {
  const path = parent === "" ? entry.name : `${parent}/${entry.name}`
  if (entry.isFile) {
    const files = await readFileEntry(entry as FileSystemFileEntry)
    return files.map((file) => ({ path, file }))
  }
  if (!entry.isDirectory) return []
  const children = await readDirectoryEntry(entry as FileSystemDirectoryEntry)
  const nested = await Promise.all(children.map((child) => readEntry(child, path)))
  return nested.flat()
}

/**
 * Read a drop into files with their paths.
 *
 * The entries have to be collected before the first `await`: a drag event's
 * item list is emptied once the handler returns.
 */
export async function readDrop(transfer: DataTransfer): Promise<DroppedFile[]> {
  const entries: FileSystemEntry[] = []
  for (const item of Array.from(transfer.items)) {
    if (item.kind !== "file") continue
    const entry = item.webkitGetAsEntry()
    if (entry !== null) entries.push(entry)
  }
  const groups = await Promise.all(entries.map((entry) => readEntry(entry, "")))
  return groups.flat()
}

/** Find the skills a folder holds: one per subfolder carrying a SKILL.md. */
export async function scanFolder(files: DroppedFile[]): Promise<FolderSkill[]> {
  const groups = new Map<string, DroppedFile[]>()
  for (const entry of files) {
    const [name, ...rest] = segments(entry.path)
    if (name === undefined || rest.length === 0) continue
    const group = groups.get(name) ?? []
    group.push(entry)
    groups.set(name, group)
  }

  const found: FolderSkill[] = []
  for (const [name, group] of groups) {
    const manifest = group.find((entry) => {
      const parts = segments(entry.path)
      return parts.length === 2 && parts[1].toLowerCase() === MANIFEST.toLowerCase()
    })
    if (manifest === undefined) continue
    const { frontmatter } = parseSkillFile(await manifest.file.text())
    found.push({ name, description: frontmatter.description ?? "", files: group })
  }
  return found.sort((left, right) => left.name.localeCompare(right.name))
}

/** Encode a file as base64, the form a JSON body carries bytes in. */
async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ""
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

/** Read the chosen skills for the host, which writes the bytes as they are. */
export async function readFolderFiles(skills: FolderSkill[]): Promise<ImportedFile[]> {
  const files = await Promise.all(
    skills.flatMap((skill) =>
      skill.files.map(async (entry) => ({
        path: entry.path,
        base64: await toBase64(entry.file),
      }))
    )
  )
  return files
}
