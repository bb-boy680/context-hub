/**
 * Reading a folder a person dropped or picked, without letting a big one take
 * the tab down with it. A person can point this at a home directory or a whole
 * disk, and an unbounded recursive read of one freezes the page and holds every
 * file it met in memory. Three bounds keep that from happening:
 *
 * - the walk counts what it has seen and stops at `maxEntries`, saying so;
 * - generated directories are skipped by their own name, not walked and filtered;
 * - an `AbortSignal` is checked at every step, so closing the dialog stops the
 *   walk where it stands.
 *
 * Bytes are read only when a skill is imported: the walk keeps handles, and the
 * import carries its own byte budget before it opens anything.
 */
import { parseSkillFile } from "./frontmatter.ts"
import type { ImportedSkill } from "./store.ts"

/** One file inside the folder being read; its bytes wait until a skill is imported. */
export interface DroppedFile {
  /** Path relative to the folder that was picked or dropped, `/`-separated. */
  path: string
  /** Open the file, or answer `null` when the handle has gone stale. */
  open(): Promise<File | null>
}

/** One skill found in the folder, before anything is copied into the library. */
export interface FolderSkill {
  /** The skill directory's own name; the id it takes in the library. */
  name: string
  /** Where the skill sits inside the folder, so its files can be read back. */
  dir: string
  description: string
  files: DroppedFile[]
}

/** What one walk found, and whether it stopped short of the folder's end. */
export interface FolderScan {
  skills: FolderSkill[]
  /** Files the walk looked at. */
  scanned: number
  /** True when a bound stopped the walk before the folder ran out. */
  truncated: boolean
}

/** Bounds a walk keeps to, whatever the folder holds. */
export interface ScanLimits {
  /** Entries a walk looks at before it stops and reports a truncation. */
  maxEntries: number
  /** Bytes one import may carry, measured before a single file is read. */
  maxImportBytes: number
}

/** Bounds a walk keeps to, whatever the folder holds. */
export const DEFAULT_LIMITS: ScanLimits = {
  maxEntries: 20_000,
  maxImportBytes: 64 * 1024 * 1024,
}

/** How a walk ended: the files it kept, how far it got, and whether it was cut. */
export interface Walk {
  files: DroppedFile[]
  scanned: number
  truncated: boolean
}

const MANIFEST = "SKILL.md"

/**
 * Directories whose contents are never a skill worth importing. Matched on the
 * directory's own name, so a walk never descends into one — the list is the one
 * this workspace's own harness uses for the same job.
 *
 * Hidden directories are searched on purpose: the layouts in use put skills
 * under `<project>/.agents/skills/<name>` and `<project>/.claude/skills/<name>`.
 */
const NOISE = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  "target",
  ".next",
  ".nuxt",
  ".turbo",
  ".venv",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".gradle",
])

/** Split a path into its segments, dropping the empty ones a leading slash leaves. */
function segments(path: string): string[] {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part !== "" && part !== ".")
}

/**
 * Names that usually hold skills. A walk visits these directories before the
 * rest of a tree, so a budget spent on something enormous — a package cache, a
 * user profile — cannot starve the directory the person actually meant.
 */
const LIKELY = new Set(["skills", ".agents", ".claude", ".codex", ".cursor"])

/**
 * The directories a walk still owes a visit.
 *
 * Two lines and last-in-first-out, for one reason: a real folder holds hundreds
 * of siblings, and the skills sit at the end of one branch. Walking a branch to
 * its end before starting the next — and taking the directories that look like
 * skill roots first — is what reaches `.agents/skills/<name>` while a budget
 * that a sibling folder would otherwise spend is still intact.
 */
class WalkQueue<T> {
  private readonly likely: T[] = []
  private readonly rest: T[] = []

  /** Add one directory; `likely` decides which line it joins. */
  push(item: T, likely: boolean): void {
    if (likely) this.likely.push(item)
    else this.rest.push(item)
  }

  get done(): boolean {
    return this.likely.length === 0 && this.rest.length === 0
  }

  /** The next directory to visit: the likely line first, then the newest. */
  take(): T {
    const next = this.likely.pop() ?? this.rest.pop()
    if (next === undefined) throw new Error("walked past the end of the queue")
    return next
  }
}


/**
 * Whether a path sits under a generated directory, or lives in one of the
 * generated directories a walk refuses to enter.
 */
function ignored(parts: string[]): boolean {
  return parts.some((part) => NOISE.has(part))
}

/** Join a directory and a name the way paths in a drop read. */
function join(dir: string, name: string): string {
  return dir === "" ? name : `${dir}/${name}`
}

/* --- reading a folder the browser enumerated ---------------------------- */

/**
 * The files a directory picker answered with, bounded like a walk.
 *
 * The browser listed the folder whole before this runs, so the budget can only
 * cut the result — but it cuts it after dropping the generated directories and
 * after putting the paths that look like skill roots first, or a package cache
 * would spend the whole allowance before the skills were ever reached.
 */
export function filesFromPicker(
  input: { files: ArrayLike<File> | null },
  limits: ScanLimits = DEFAULT_LIMITS
): { files: DroppedFile[]; truncated: boolean } {
  const likely: DroppedFile[] = []
  const rest: DroppedFile[] = []
  for (const file of Array.from(input.files ?? [])) {
    const path =
      file.webkitRelativePath === "" ? file.name : file.webkitRelativePath
    const parts = segments(path)
    if (ignored(parts)) continue
    const entry = { path, open: async () => file }
    if (parts.some((part) => LIKELY.has(part))) likely.push(entry)
    else rest.push(entry)
  }
  const total = likely.length + rest.length
  return {
    files: [...likely, ...rest].slice(0, limits.maxEntries),
    truncated: total > limits.maxEntries,
  }
}

/* --- walking a folder the browser handed over as entries ---------------- */

/** One directory entry's file, or nothing when the entry disappeared meanwhile. */
function readFileEntry(entry: FileSystemFileEntry): Promise<File[]> {
  return new Promise((resolve) => {
    entry.file(
      (file) => resolve([file]),
      () => resolve([])
    )
  })
}

/** The children of a directory entry, arriving in batches until aborted. */
function readDirectoryEntry(
  entry: FileSystemDirectoryEntry,
  signal: AbortSignal
): Promise<FileSystemEntry[]> {
  const reader = entry.createReader()
  return new Promise((resolve) => {
    const found: FileSystemEntry[] = []
    const readBatch = () => {
      reader.readEntries(
        (batch) => {
          if (batch.length === 0 || signal.aborted) {
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

/** Walk dropped entries branch by branch, bounded and stoppable. */
export async function walkEntries(
  entries: FileSystemEntry[],
  limits: ScanLimits = DEFAULT_LIMITS,
  signal: AbortSignal = new AbortController().signal
): Promise<Walk> {
  const files: DroppedFile[] = []
  const queue = new WalkQueue<{ entry: FileSystemEntry; dir: string }>()
  for (const entry of entries) queue.push({ entry, dir: "" }, LIKELY.has(entry.name))
  let scanned = 0
  let truncated = false

  while (!queue.done) {
    signal.throwIfAborted()
    if (scanned >= limits.maxEntries) {
      truncated = true
      break
    }
    const { entry, dir } = queue.take()
    scanned += 1
    if (NOISE.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isFile) {
      const file = entry as FileSystemFileEntry
      files.push({ path, open: async () => (await readFileEntry(file))[0] ?? null })
      continue
    }
    if (!entry.isDirectory) continue
    const children = await readDirectoryEntry(entry as FileSystemDirectoryEntry, signal)
    for (const child of children) {
      queue.push({ entry: child, dir: path }, LIKELY.has(child.name))
    }
  }

  return { files, scanned, truncated }
}

/**
 * Read a drop into files with their paths.
 *
 * The entries have to be collected before the first `await`: a drag event's
 * item list is emptied once the handler returns.
 */
export function readDrop(
  transfer: DataTransfer,
  options: { limits?: ScanLimits; signal?: AbortSignal } = {}
): Promise<Walk> {
  const entries: FileSystemEntry[] = []
  for (const item of Array.from(transfer.items)) {
    if (item.kind !== "file") continue
    const entry = item.webkitGetAsEntry()
    if (entry !== null) entries.push(entry)
  }
  return walkEntries(entries, options.limits, options.signal)
}

/* --- walking a folder picked through the file-system access API --------- */

/** Walk a picked directory handle branch by branch, bounded and stoppable. */
export async function walkDirectory(
  root: FileSystemDirectoryHandle,
  limits: ScanLimits = DEFAULT_LIMITS,
  signal: AbortSignal = new AbortController().signal
): Promise<Walk> {
  const files: DroppedFile[] = []
  const queue = new WalkQueue<{ handle: FileSystemDirectoryHandle; dir: string }>()
  queue.push({ handle: root, dir: root.name }, false)
  let scanned = 0
  let truncated = false

  while (!queue.done) {
    signal.throwIfAborted()
    if (scanned >= limits.maxEntries) {
      truncated = true
      break
    }
    const { handle, dir } = queue.take()
    const children: (FileSystemDirectoryHandle | FileSystemFileHandle)[] = []
    for await (const child of handle.values()) children.push(child)
    scanned += 1
    for (const child of children) {
      if (NOISE.has(child.name)) continue
      const path = join(dir, child.name)
      if (child.kind === "directory") {
        queue.push({ handle: child, dir: path }, LIKELY.has(child.name))
        continue
      }
      files.push({ path, open: async () => child.getFile().catch(() => null) })
    }
  }

  return { files, scanned, truncated }
}

/* --- finding the skills in what a walk kept ---------------------------- */

/**
 * Find the skills in a folder's files.
 *
 * A skill is any directory carrying a `SKILL.md`, however deep it sits: a
 * picked folder can be one skill, a repository of them under
 * `skills/<group>/<name>`, or both. A directory that already holds a skill is
 * not searched further — whatever sits under it is that skill's own content.
 */
export async function scanFolder(files: DroppedFile[]): Promise<FolderSkill[]> {
  const usable = files.filter((file) => !ignored(segments(file.path)))

  /* Every directory that carries a manifest, keyed by its path in the drop. */
  const manifests = new Map<string, DroppedFile>()
  for (const file of usable) {
    const parts = segments(file.path)
    if (parts.length < 2) continue
    if (parts[parts.length - 1].toLowerCase() !== MANIFEST.toLowerCase()) continue
    manifests.set(parts.slice(0, -1).join("/"), file)
  }

  /* Shallowest first, so a skill's own subfolders are read as its content. */
  const roots = [...manifests.keys()].sort(
    (left, right) =>
      left.split("/").length - right.split("/").length || left.localeCompare(right)
  )
  const kept = new Set<string>()
  for (const root of roots) {
    if (ancestorIn(root, kept)) continue
    kept.add(root)
  }

  const grouped = new Map<string, DroppedFile[]>();
  for (const file of usable) {
    const parts = segments(file.path)
    /* The nearest kept ancestor owns the file. */
    for (let depth = parts.length - 1; depth > 0; depth -= 1) {
      const owner = parts.slice(0, depth).join("/")
      if (!kept.has(owner)) continue
      const group = grouped.get(owner) ?? []
      group.push(file)
      grouped.set(owner, group)
      break
    }
  }

  const found: FolderSkill[] = []
  for (const root of roots) {
    if (!kept.has(root)) continue
    const manifest = manifests.get(root)
    if (manifest === undefined) continue
    /* An unreadable manifest still counts as a skill; it just carries no text. */
    const handle = await manifest.open()
    const text = handle === null ? "" : await handle.text().catch(() => "")
    const { frontmatter } = parseSkillFile(text)
    found.push({
      name: root.split("/").pop() ?? root,
      dir: root,
      description: frontmatter.description ?? "",
      files: grouped.get(root) ?? [],
    })
  }
  return found
}

/** Whether some directory above this one was already kept as a skill. */
function ancestorIn(root: string, kept: ReadonlySet<string>): boolean {
  const parts = root.split("/")
  for (let depth = parts.length - 1; depth > 0; depth -= 1) {
    if (kept.has(parts.slice(0, depth).join("/"))) return true
  }
  return false
}

/* --- reading the skills a person chose --------------------------------- */

/** Encode a file as base64, the form a JSON body carries bytes in. */
async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ""
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

/**
 * Read the chosen skills for the host, which writes the bytes as they are.
 *
 * @param skills — the skills a person picked.
 * @param maxBytes — what all of them together may weigh. Measured from the
 *   files' own sizes before any is read, so an oversized pick fails at once
 *   instead of filling memory first.
 * @returns one entry per skill, each file relative to its skill directory.
 */
export async function readFolderFiles(
  skills: FolderSkill[],
  maxBytes: number = DEFAULT_LIMITS.maxImportBytes
): Promise<ImportedSkill[]> {
  const opened = await Promise.all(
    skills.map(async (skill) => {
      const files = await Promise.all(
        skill.files.map(async (entry) => {
          const file = await entry.open()
          if (file === null) {
            throw new Error(`${entry.path} could not be read; it may have moved`)
          }
          return { path: entry.path.slice(skill.dir.length + 1), file }
        })
      )
      return { skill, files }
    })
  )

  const total = opened.reduce(
    (sum, entry) => sum + entry.files.reduce((size, file) => size + file.file.size, 0),
    0
  )
  if (total > maxBytes) {
    throw new Error(
      `${Math.round(total / (1024 * 1024))} MB is more than this import takes at once; pick fewer skills`
    )
  }

  return Promise.all(
    opened.map(async (entry) => ({
      name: entry.skill.name,
      files: await Promise.all(
        entry.files.map(async (file) => ({
          path: file.path,
          base64: await toBase64(file.file),
        }))
      ),
    }))
  )
}
