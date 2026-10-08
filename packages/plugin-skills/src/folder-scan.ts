/**
 * Reading a folder a person dropped or picked. The browser hands over files
 * with no directory structure of their own, so this module rebuilds each file's
 * path inside the drop, finds every skill under it, and reads the chosen ones
 * back for the host to write.
 */
import { parseSkillFile } from "./frontmatter.ts"
import type { ImportedSkill } from "./store.ts"

/** One file a folder read produced, with the path it had inside the drop. */
export interface DroppedFile {
  /** Path relative to the dropped folder, `/`-separated. */
  path: string
  file: File
}

/** One skill found in a folder, before anything is copied into the library. */
export interface FolderSkill {
  /** The skill directory's own name; the id it takes in the library. */
  name: string
  /** Where the skill sits inside the drop, so its files can be read back. */
  dir: string
  description: string
  files: DroppedFile[]
}

const MANIFEST = "SKILL.md"

/** Directories whose contents are never a skill worth importing. */
const NOISE = new Set(["node_modules"])

/** Split a path into its segments, dropping the empty ones a leading slash leaves. */
function segments(path: string): string[] {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part !== "" && part !== ".")
}

/** Whether a path sits under a hidden or generated directory. */
function ignored(parts: string[]): boolean {
  return parts.some((part) => part.startsWith(".") || NOISE.has(part))
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

/**
 * Find the skills a folder holds.
 *
 * A skill is any directory carrying a SKILL.md, however deep it sits: a picked
 * folder can be one skill, a repository of them under `skills/<group>/<name>`,
 * or both. A directory that already holds a skill is not searched further —
 * whatever sits under it is that skill's own content.
 */
export async function scanFolder(files: DroppedFile[]): Promise<FolderSkill[]> {
  const usable = files
    .map((entry) => ({ entry, parts: segments(entry.path) }))
    .filter(({ parts }) => !ignored(parts))

  /* Every directory that carries a manifest, keyed by its path in the drop. */
  const manifests = new Map<string, DroppedFile>()
  for (const { entry, parts } of usable) {
    if (parts.length < 2) continue
    const file = parts[parts.length - 1]
    if (file.toLowerCase() !== MANIFEST.toLowerCase()) continue
    manifests.set(parts.slice(0, -1).join("/"), entry)
  }

  /* Shallowest first, so a skill's own subfolders are read as its content. */
  const roots = [...manifests.keys()].sort(
    (left, right) =>
      left.split("/").length - right.split("/").length || left.localeCompare(right)
  )
  const accepted: string[] = []
  for (const root of roots) {
    if (accepted.some((parent) => root.startsWith(`${parent}/`))) continue
    accepted.push(root)
  }

  const found: FolderSkill[] = []
  for (const root of accepted) {
    const manifest = manifests.get(root)
    if (manifest === undefined) continue
    const group = usable
      .filter(({ parts }) => parts.join("/").startsWith(`${root}/`))
      .map(({ entry }) => entry)
    /* An unreadable manifest still counts as a skill; it just carries no text. */
    const text = await manifest.file.text().catch(() => "")
    const { frontmatter } = parseSkillFile(text)
    found.push({
      name: root.split("/").pop() ?? root,
      dir: root,
      description: frontmatter.description ?? "",
      files: group,
    })
  }
  return found
}

/** Read the chosen skills for the host, which writes the bytes as they are. */
export async function readFolderFiles(skills: FolderSkill[]): Promise<ImportedSkill[]> {
  return Promise.all(
    skills.map(async (skill) => ({
      name: skill.name,
      files: await Promise.all(
        skill.files.map(async (entry) => ({
          /* The host writes inside the skill directory, so the root comes off. */
          path: entry.path.slice(skill.dir.length + 1),
          base64: await toBase64(entry.file),
        }))
      ),
    }))
  )
}
