import { createHash, randomUUID } from "node:crypto"
import { promises as fs, realpathSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { lock } from "proper-lockfile"

import { writeFileAtomic } from "@context-hub/core/host/atomic"

import type {
  PluginDisk,
  PluginDiskChange,
  PluginDiskDeclaration,
  PluginDiskRef,
  PluginDiskRoots,
  PluginJournalCommit,
} from "../provider.ts"
import { assertPackRelative, assertSafeSegment } from "./names.ts"
import type { PluginLibrary } from "./library.ts"

interface Options {
  library: PluginLibrary
  workspace(): Promise<string | null>
  userHome?: string
  env?: NodeJS.ProcessEnv
  write?: typeof writeFileAtomic
  rename?: typeof fs.rename
}

const queues = new Map<string, Promise<unknown>>()

function matches(pattern: string, relative: string): boolean {
  const parts = pattern.split("/")
  const target = relative.split("/")
  const test = (i: number, j: number): boolean => {
    if (i === parts.length) return j === target.length
    if (parts[i] === "**") return test(i + 1, j) || (j < target.length && test(i, j + 1))
    return j < target.length && (parts[i] === "*" || parts[i] === target[j]) && test(i + 1, j + 1)
  }
  return test(0, 0)
}

function allowedRef(roots: PluginDiskRoots, ref: PluginDiskRef, write: boolean): boolean {
  if (typeof ref !== "object" || ref === null || typeof ref.path !== "string") return false
  const scope = ref.root === "plugins" ? roots.declaration.stateFiles : roots.declaration[ref.root]
  if (typeof scope !== "object" || scope === null || !("write" in scope)) return false
  return [...scope.write, ...(write ? [] : scope.read)].some((pattern) => matches(pattern, ref.path))
}

function directoryAllowed(roots: PluginDiskRoots, relative: string, name?: string): boolean {
  const parts = assertPackRelative(relative).split("/")
  for (const part of parts) assertSafeSegment(part, "plugin directory")
  const templates = ["cache/*/:name/*", ...(roots.declaration.directories ?? [])]
  return templates.some((template) => {
    const expected = template.split("/")
    return expected.length === parts.length && expected.every((part, index) =>
      part === "*" || (part === ":name" ? name === undefined || parts[index] === name : parts[index] === part)
    )
  })
}

function missing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT"
}

function declarationOf(value: PluginDiskDeclaration): PluginDiskDeclaration {
  if (typeof value !== "object" || value === null) throw new Error("missing file root declaration")
  const segment = (part: unknown): string => {
    if (typeof part !== "string" || part === "." || part === ".." || !/^[^/\\:]+$/.test(part)) throw new Error("invalid file root declaration")
    return part
  }
  const variable = (name: unknown): string | undefined => {
    if (name === undefined) return undefined
    if (typeof name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error("invalid environment variable name")
    return name
  }
  const patterns = (input: unknown, allowRoot = false): string[] => {
    if (!Array.isArray(input) || input.some((pattern) => typeof pattern !== "string" || (!allowRoot && pattern === "") || (pattern !== "" && pattern.split("/").some((part: string) => part === "" || part === "." || part === ".." || (part.includes("*") && part !== "*" && part !== "**") || /[\\:]/.test(part))))) throw new Error("invalid file scope pattern")
    return input as string[]
  }
  const scope = (input: unknown) => {
    if (typeof input !== "object" || input === null) throw new Error("invalid file scope")
    const entry = input as { write?: unknown; read?: unknown }
    return { write: patterns(entry.write), read: patterns(entry.read, true) }
  }
  const directories = value.directories === undefined ? [] : value.directories
  if (!Array.isArray(directories) || directories.some((template) => {
    if (typeof template !== "string") return true
    const parts = template.split("/")
    if (parts.filter((part) => part === ":name").length !== 1) return true
    return parts.some((part) => {
      if (part === ":name" || part === "*") return false
      try { assertSafeSegment(part, "directory template"); return false } catch { return true }
    })
  })) throw new Error("invalid plugin directory template")
  if (typeof value.state !== "string") throw new Error("invalid file root declaration")
  const state = value.state.split("/").map(segment).join("/")
  if (value.homeEnvResolution !== undefined && value.homeEnvResolution !== "workspace") throw new Error("invalid environment root resolution")
  if (value.canonicalWorkspace !== undefined && typeof value.canonicalWorkspace !== "boolean") throw new Error("invalid canonical workspace option")
  const lease = value.lease
  if (lease !== undefined) {
    if (typeof lease !== "object" || lease === null || typeof lease.ref !== "object" || lease.ref === null || !["config", "plugins", "workspace"].includes(lease.ref.root) || typeof lease.ref.path !== "string") throw new Error("invalid file lease")
    assertPackRelative(lease.ref.path)
    const retry = lease.retries
    if (!Number.isInteger(lease.stale) || lease.stale < 5000 || lease.stale > 300000 || !Number.isInteger(lease.update) || lease.update < 1000 || lease.update > lease.stale / 2 || typeof retry !== "object" || retry === null || !Number.isInteger(retry.retries) || retry.retries < 0 || retry.retries > 60 || typeof retry.factor !== "number" || retry.factor < 1 || retry.factor > 2 || !Number.isInteger(retry.minTimeout) || retry.minTimeout < 1 || !Number.isInteger(retry.maxTimeout) || retry.maxTimeout < retry.minTimeout || retry.maxTimeout > 1000 || typeof retry.randomize !== "boolean") throw new Error("invalid file lease options")
  }
  const copyPatterns = (value: unknown): string[] | undefined => {
    if (value === undefined) return undefined
    if (!Array.isArray(value) || value.some((item) => {
      if (typeof item !== "string" || item === "" || item === "." || item === "..") return true
      const literal = item.endsWith(".*") ? item.slice(0, -1) : item
      return literal === "." || /[\\/:*?<>|"]/.test(literal) || [...literal].some(character => character.codePointAt(0)! < 0x20)
    })) throw new Error("invalid copy exclusion pattern")
    return value as string[]
  }
  return { home: segment(value.home), homeEnv: variable(value.homeEnv), homeEnvResolution: value.homeEnvResolution, canonicalWorkspace: value.canonicalWorkspace, lease, state, stateEnv: variable(value.stateEnv), config: scope(value.config), stateFiles: scope(value.stateFiles), directories, copyExcludeTop: copyPatterns(value.copyExcludeTop), copyRejectNested: copyPatterns(value.copyRejectNested), workspace: scope(value.workspace), library: scope(value.library), external: patterns(value.external) }
}

function environmentRoot(value: string | undefined, fallback: string): string {
  if (value === undefined || value.trim() === "") return path.resolve(fallback)
  if (!path.isAbsolute(value)) throw new Error("configured file root must be absolute")
  return path.resolve(value)
}

function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
}

/** Refuse symlinks below an explicitly chosen root, including the final file. */
async function safePath(root: string, relative: string): Promise<string> {
  const target = relative === "" ? root : path.join(root, ...assertPackRelative(relative).split("/"))
  if (!inside(root, target)) throw new Error("path escapes file root")
  const rootStat = await fs.lstat(root).catch((error: unknown) => {
    if (missing(error)) return null
    throw error
  })
  if (rootStat?.isSymbolicLink()) throw new Error(`symbolic link in file root: ${root}`)
  let current = root
  const parts = path.relative(root, target).split(path.sep).filter(Boolean)
  for (const part of parts) {
    current = path.join(current, part)
    const stat = await fs.lstat(current).catch((error: unknown) => {
      if (missing(error)) return null
      throw error
    })
    if (stat?.isSymbolicLink()) throw new Error(`symbolic link in file path: ${current}`)
  }
  return target
}

async function readText(file: string): Promise<string | null> {
  return fs.readFile(file, "utf8").catch((error: unknown) => {
    if (missing(error)) return null
    throw error
  })
}

async function durableWrite(file: string, text: string, beforeReplace?: () => Promise<void>): Promise<void> {
  const parent = path.dirname(file)
  await fs.mkdir(parent, { recursive: true })
  const temporary = path.join(parent, `.tmp-${randomUUID()}`)
  let created = false
  try {
    await beforeReplace?.()
    const handle = await fs.open(temporary, "wx", 0o600)
    created = true
    try {
      await handle.writeFile(text, "utf8")
      await handle.sync()
    } finally {
      await handle.close()
    }
    for (let attempt = 0; ; attempt++) {
      try { await beforeReplace?.(); await fs.rename(temporary, file); break }
      catch (error) {
        if (attempt >= 4 || !["EACCES", "EBUSY", "EPERM"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error
        await new Promise(resolve => setTimeout(resolve, 20 * (attempt + 1)))
      }
    }
  } finally {
    if (created) await fs.rm(temporary, { force: true })
  }
}

/** Markers a client writes into its own cache copy; they are not part of the pack. */
const CACHE_MARKERS = new Set([".orphaned_at", ".in_use"])

/** Hash every copied file, including empty directories and excluding the client's own markers. */
async function treeHash(root: string, ignoreMarker = false): Promise<string> {
  const hash = createHash("sha256")
  const visit = async (dir: string, relative: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (ignoreMarker && relative === "" && CACHE_MARKERS.has(entry.name)) continue
      const name = relative === "" ? entry.name : `${relative}/${entry.name}`
      const full = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`symbolic link in plugin pack: ${name}`)
      hash.update(`${entry.isDirectory() ? "d" : "f"}:${name}\0`)
      if (entry.isDirectory()) await visit(full, name)
      else if (entry.isFile()) hash.update(await fs.readFile(full))
      else throw new Error(`unsupported file in plugin pack: ${name}`)
    }
  }
  await visit(root, "")
  return hash.digest("hex")
}

async function absent(file: string): Promise<boolean> {
  return fs.lstat(file).then(() => false, (error: unknown) => {
    if (missing(error)) return true
    throw error
  })
}

function copyMatches(name: string, patterns: readonly string[] = []): boolean {
  return patterns.some((pattern) => pattern.endsWith(".*") ? name.startsWith(pattern.slice(0, -1)) : name === pattern)
}

function copyFilter(root: string, declaration: PluginDiskDeclaration): (entry: string) => boolean {
  return (entry) => {
    const relative = path.relative(root, entry)
    if (relative === "") return true
    const parts = relative.split(path.sep)
    if (copyMatches(parts[0]!, declaration.copyExcludeTop)) return false
    if (parts.length > 1 && copyMatches(parts.at(-1)!, declaration.copyRejectNested)) throw new Error(`nested excluded file in plugin directory: ${relative}`)
    return true
  }
}

async function directorySnapshot(root: string, filter?: Pick<PluginDiskDeclaration, "copyExcludeTop" | "copyRejectNested">): Promise<string | null> {
  const stat = await fs.lstat(root).catch((error: unknown) => {
    if (missing(error)) return null
    throw error
  })
  if (stat === null) return null
  if (stat.isSymbolicLink()) throw new Error(`symbolic link in plugin directory: ${root}`)
  if (!stat.isDirectory()) throw new Error(`plugin path is not a directory: ${root}`)
  const hash = createHash("sha256")
  const visit = async (dir: string, relative: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    for (const entry of entries) {
      if (relative === "" && copyMatches(entry.name, filter?.copyExcludeTop)) continue
      if (relative !== "" && copyMatches(entry.name, filter?.copyRejectNested)) throw new Error(`nested excluded file in plugin directory: ${relative}/${entry.name}`)
      const name = relative === "" ? entry.name : `${relative}/${entry.name}`
      const full = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`symbolic link in plugin directory: ${name}`)
      if (entry.isDirectory()) {
        hash.update(JSON.stringify(["directory", name]))
        await visit(full, name)
      } else if (entry.isFile()) {
        const digest = createHash("sha256").update(await fs.readFile(full)).digest("hex")
        hash.update(JSON.stringify(["file", name, digest]))
      } else throw new Error(`unsupported file in plugin directory: ${name}`)
    }
  }
  await visit(root, "")
  return hash.digest("hex")
}

export interface InstallerFiles extends PluginDisk {
  begin(declaration: PluginDiskDeclaration): Promise<PluginDiskRoots>
  end(token: string): Promise<void>
}

export function createInstallerFiles(options: Options): InstallerFiles {
  const env = options.env ?? process.env
  const write = options.write ?? writeFileAtomic
  const rename = options.rename ?? fs.rename
  const renameArtifact = async (from: string, to: string, check: () => Promise<void>) => {
    for (let attempt = 0; ; attempt++) {
      await check()
      try { await rename(from, to); return }
      catch (error) {
        if (attempt >= 3 || !["EACCES", "EBUSY", "EPERM"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error
        await new Promise(resolve => setTimeout(resolve, 50 * 2 ** attempt))
      }
    }
  }
  const tokens = new Map<string, PluginDiskRoots>()
  const releases = new Map<string, () => Promise<void>>()
  const compromised = new Map<string, Error>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const committing = new Set<string>()
  const ending = new Set<string>()

  const roots = async (input: PluginDiskDeclaration): Promise<PluginDiskRoots> => {
    const declaration = declarationOf(input)
    const workspace = await options.workspace()
    const userHome = path.resolve(options.userHome ?? homedir())
    const homeOverride = declaration.homeEnv === undefined ? undefined : env[declaration.homeEnv]
    let selectedHome = homeOverride
    if (homeOverride && declaration.homeEnvResolution === "workspace") {
      if (homeOverride === "~" || /^~[/\\\\]/.test(homeOverride)) {
        selectedHome = path.join(userHome, ...homeOverride.slice(1).split(/[/\\\\]+/).filter(Boolean))
      } else if (!path.isAbsolute(homeOverride)) {
        if (workspace === null) throw new Error("relative file root requires a selected workspace")
        selectedHome = path.resolve(workspace, homeOverride)
      }
    }
    const config = environmentRoot(selectedHome, path.join(userHome, declaration.home))
    const override = declaration.stateEnv === undefined ? undefined : env[declaration.stateEnv]
    const plugins = override === undefined || override.trim() === ""
      ? await safePath(config, declaration.state)
      : environmentRoot(override, config)
    const resolvedWorkspace = workspace === null ? null : path.resolve(workspace)
    let workspaceCanonical = resolvedWorkspace
    if (declaration.canonicalWorkspace && resolvedWorkspace !== null) {
      try { workspaceCanonical = realpathSync.native(resolvedWorkspace) }
      catch (error) { if (!missing(error)) throw error }
    }
    return {
      declaration,
      config,
      plugins,
      workspace: resolvedWorkspace,
      ...(declaration.canonicalWorkspace ? { workspaceCanonical } : {}),
      library: path.resolve(options.library.root),
      platform: process.platform === "win32" ? "win32" : "posix",
    }
  }

  const validate = async (captured: PluginDiskRoots): Promise<void> => {
    if (typeof captured !== "object" || captured === null) throw new Error("missing captured file roots")
    const current = await roots(captured.declaration)
    if (JSON.stringify(current) !== JSON.stringify({ ...captured, token: undefined })) {
      throw new Error("workspace or file roots changed; retry the operation")
    }
    if (captured.token !== undefined && compromised.has(captured.token)) throw new Error("file operation lease was compromised", { cause: compromised.get(captured.token) })
    if (captured.token !== undefined && tokens.get(captured.token) !== captured) {
      // A bridge request carries a copy, so compare the registered roots by value.
      const saved = tokens.get(captured.token)
      if (saved === undefined || JSON.stringify(saved) !== JSON.stringify(captured)) {
        throw new Error("file operation lease expired")
      }
    }
  }

  const target = async (captured: PluginDiskRoots, ref: PluginDiskRef): Promise<string> => {
    await validate(captured)
    if (typeof ref !== "object" || ref === null || typeof ref.path !== "string") throw new Error("invalid file reference")
    if (!["config", "plugins", "workspace", "library"].includes(ref.root)) throw new Error("invalid file root")
    const root = captured[ref.root]
    if (root === null) throw new Error("no workspace is selected")
    return safePath(root, ref.path)
  }

  const external = async (captured: PluginDiskRoots, directory: string, relative: string): Promise<string> => {
    await validate(captured)
    if (typeof directory !== "string" || !path.isAbsolute(directory)) throw new Error("marketplace directory must be absolute")
    return safePath(path.resolve(directory), relative)
  }

  const directory = async (captured: PluginDiskRoots, ref: PluginDiskRef): Promise<string> => {
    if (ref?.root !== "plugins" || typeof ref.path !== "string" || !directoryAllowed(captured, ref.path) || !allowedRef(captured, ref, true)) {
      throw new Error("directory is outside the plugin directory allowlist")
    }
    return target(captured, ref)
  }

  const commit = async (
    captured: PluginDiskRoots,
    changes: readonly PluginDiskChange[],
    copy?: { name: string; destination: string; replace?: boolean; pruneVersions?: boolean; manifests?: readonly string[]; before?: string | null; sourceSnapshot?: string },
    remove?: { ref: PluginDiskRef; before: string | null }
  ): Promise<void> => {
    if (!Array.isArray(changes)) throw new Error("invalid file changes")
    if (typeof captured !== "object" || captured === null || typeof captured.token !== "string" || !tokens.has(captured.token)) {
      throw new Error("file operation lease required")
    }
    const apply = async (): Promise<void> => {
      await validate(captured)
      const files: { file: string; ref: PluginDiskRef; before: string | null; after: string | null }[] = []
      const seen = new Set<string>()
      for (const change of changes) {
        if (typeof change !== "object" || change === null ||
            !(change.before === null || typeof change.before === "string") ||
            !(change.after === null || typeof change.after === "string")) throw new Error("invalid file change")
        if (!allowedRef(captured, change.ref, true)) throw new Error("file is outside the plugin state allowlist")
        const file = await target(captured, change.ref)
        if (seen.has(file)) throw new Error(`duplicate file change: ${file}`)
        seen.add(file)
        if (await readText(file) !== change.before) throw new Error(`file changed; retry: ${file}`)
        files.push({ file, ref: change.ref, before: change.before, after: change.after })
      }

      let staged: string | null = null
      let destination: string | null = null
      let backup: string | null = null
      let activated = false
      let expected: string | null | undefined
      let activatedSnapshot: string | null = null
      try {
        if (copy !== undefined && remove !== undefined) throw new Error("cannot copy and remove a directory in one operation")
        if (remove !== undefined) {
          if (typeof remove !== "object" || remove === null || !(remove.before === null || typeof remove.before === "string")) throw new Error("invalid directory removal")
          destination = await directory(captured, remove.ref)
          expected = remove.before
        }
        if (copy !== undefined) {
          if (typeof copy !== "object" || copy === null || typeof copy.name !== "string" || typeof copy.destination !== "string") {
            throw new Error("invalid plugin copy")
          }
          if (copy.before !== undefined && copy.before !== null && typeof copy.before !== "string") throw new Error("invalid directory snapshot")
          if (copy.sourceSnapshot !== undefined && (typeof copy.sourceSnapshot !== "string" || copy.before === undefined)) throw new Error("invalid source snapshot")
          if (copy.before !== undefined && copy.pruneVersions) throw new Error("snapshot-protected copy cannot prune versions")
          expected = copy.before
          const name = assertSafeSegment(copy.name, "plugin name")
          if (!directoryAllowed(captured, copy.destination, name) || !allowedRef(captured, { root: "plugins", path: copy.destination }, true)) throw new Error("invalid plugin directory destination")
          if (copy.pruneVersions && !/^cache\/[^/]+\/[^/]+\/[^/]+$/.test(copy.destination)) throw new Error("version pruning requires a cache destination")
          if (!(await options.library.list()).some((record) => record.name === name) || !(await options.library.has(name, copy.manifests))) {
            throw new Error(`${name} is not in this library`)
          }
          const source = await safePath(captured.library, name)
          destination = await safePath(captured.plugins, copy.destination)
          if (expected !== undefined && await directorySnapshot(destination) !== expected) throw new Error(`directory changed; retry: ${destination}`)
          const filtering = (captured.declaration.copyExcludeTop?.length ?? 0) > 0 || (captured.declaration.copyRejectNested?.length ?? 0) > 0
          const sourceHash = filtering ? null : await treeHash(source)
          const sourceSnapshot = filtering || expected !== undefined ? await directorySnapshot(source, captured.declaration) : null
          if (copy.sourceSnapshot !== undefined && sourceSnapshot !== copy.sourceSnapshot) throw new Error("plugin pack changed; retry")
          const destinationStat = await fs.lstat(destination).catch((error: unknown) => {
            if (missing(error)) return null
            throw error
          })
          if (destinationStat !== null && !destinationStat.isDirectory()) throw new Error(`plugin cache is not a directory: ${destination}`)
          const different = destinationStat !== null && (filtering
            ? await directorySnapshot(destination) !== sourceSnapshot
            : expected === undefined ? await treeHash(destination, true) !== sourceHash : expected !== sourceSnapshot)
          if (different && !copy.replace) throw new Error(`plugin cache already contains different files: ${destination}`)
          if (destinationStat === null || different) {
            await fs.mkdir(path.dirname(destination), { recursive: true })
            staged = path.join(path.dirname(destination), `.tmp-plugin-${randomUUID()}`)
            await fs.cp(source, staged, { recursive: true, errorOnExist: true, force: false, filter: copyFilter(source, captured.declaration) })
            if (filtering
              ? await directorySnapshot(staged) !== sourceSnapshot || await directorySnapshot(source, captured.declaration) !== sourceSnapshot
              : await treeHash(staged) !== sourceHash || await treeHash(source) !== sourceHash ||
                (expected !== undefined && (await directorySnapshot(staged) !== sourceSnapshot || await directorySnapshot(source) !== sourceSnapshot))) {
              throw new Error("plugin pack changed while copying; retry")
            }
          }
        }
        await validate(captured)
        for (const item of files) {
          if (await readText(item.file) !== item.before) throw new Error(`file changed; retry: ${item.file}`)
        }
        if (destination !== null && expected !== undefined) {
          if (files.some((item) => inside(destination!, item.file) || inside(item.file, destination!))) throw new Error("file change overlaps plugin directory")
          const ref = remove?.ref ?? { root: "plugins" as const, path: copy!.destination }
          if (await directory(captured, ref) !== destination || await directorySnapshot(destination) !== expected) {
            throw new Error(`directory changed; retry: ${destination}`)
          }
        }
        if (destination !== null && (staged !== null || remove !== undefined)) {
          const present = await fs.lstat(destination).catch((error: unknown) => { if (missing(error)) return null; throw error })
          if (expected === null && present !== null) throw new Error(`directory changed; retry: ${destination}`)
          if (present !== null) {
            await validate(captured)
            const backupPath = `${destination}.backup-${randomUUID()}`
            await fs.rename(destination, backupPath)
            backup = backupPath
            if (expected !== undefined && await directorySnapshot(backup) !== expected) throw new Error(`directory changed; retry: ${destination}`)
          } else if (typeof expected === "string") throw new Error(`directory changed; retry: ${destination}`)
          if (staged !== null) {
            activatedSnapshot = expected === undefined ? null : await directorySnapshot(staged)
            await validate(captured)
            await fs.rename(staged, destination)
            activated = true
            staged = null
          }
        }
        const written: typeof files = []
        try {
          for (const item of files) {
            if (item.before === item.after) continue
            if (await target(captured, item.ref) !== item.file) throw new Error("file path changed; retry")
            if (await readText(item.file) !== item.before) throw new Error(`file changed; retry: ${item.file}`)
            await validate(captured)
            if (item.after === null) await fs.rm(item.file, { force: true })
            else await write(item.file, item.after)
            written.push(item)
          }
        } catch (error) {
          if (compromised.has(captured.token!)) throw new Error("file operation lease was compromised; automatic rollback refused", { cause: error })
          const unresolved: string[] = []
          for (const item of written.reverse()) {
            try {
              if (await readText(item.file) !== item.after) {
                unresolved.push(item.file)
                continue
              }
              if (item.before === null) await fs.rm(item.file, { force: true })
              else await write(item.file, item.before)
            } catch {
              unresolved.push(item.file)
            }
          }
          const reason = error instanceof Error ? error.message : String(error)
          if (unresolved.length > 0) {
            const recovery = path.join(options.library.root, `.plugin-recovery-${randomUUID()}.json`)
            try {
              await fs.mkdir(path.dirname(recovery), { recursive: true })
              await fs.writeFile(recovery, JSON.stringify(files.filter((item) => unresolved.includes(item.file))), { mode: 0o600, flag: "wx" })
            } catch (backupError) {
              throw new Error(`${reason}; could not restore ${unresolved.join(", ")} or save recovery copy: ${String(backupError)}`, { cause: backupError })
            }
            throw new Error(`${reason}; could not restore: ${unresolved.join(", ")}; recovery copy: ${recovery}`, { cause: error })
          }
          throw new Error(reason, { cause: error })
        }
        await validate(captured)
        if (backup !== null) {
          if (expected !== undefined) {
            try {
              if (await directorySnapshot(backup) !== expected) throw new Error("backup changed")
            } catch (error) {
              const kept = backup
              backup = null
              activated = false
              throw new Error(`operation committed; backup preserved at ${kept}: ${String(error)}`, { cause: error })
            }
          }
          const completedBackup = backup
          backup = null
          activated = false
          try { await fs.rm(completedBackup, { recursive: true, force: true }) }
          catch (error) { throw new Error(`operation committed; could not remove backup ${completedBackup}: ${String(error)}`, { cause: error }) }
        }
        activated = false
        if (copy?.pruneVersions && destination !== null) {
          const parent = path.dirname(destination)
          for (const entry of await fs.readdir(parent, { withFileTypes: true })) {
            if (entry.isDirectory() && entry.name !== path.basename(destination)) {
              const relative = `cache/${copy.destination.split("/")[1]}/${copy.name}/${entry.name}`
              if (!allowedRef(captured, { root: "plugins", path: relative }, true)) throw new Error("directory is outside the plugin cache allowlist")
              await fs.rm(await safePath(captured.plugins, relative), { recursive: true, force: true })
            }
          }
        }
      } catch (error) {
        if (compromised.has(captured.token!)) {
          const remaining = [backup, staged].filter((item): item is string => item !== null)
          staged = null
          throw new Error(`file operation lease was compromised; automatic rollback refused${remaining.length ? `; preserved: ${remaining.join(", ")}` : ""}`, { cause: error })
        }
        if (expected !== undefined && destination !== null) {
          const current = await directorySnapshot(destination).catch(() => "changed")
          if ((activated && current !== activatedSnapshot) || (!activated && backup !== null && current !== null)) {
            throw new Error(`${String(error)}; directory changed during rollback${backup === null ? "" : `; original saved at ${backup}`}`, { cause: error })
          }
        }
        if (activated && destination !== null) await fs.rm(destination, { recursive: true, force: true })
        if (backup !== null && destination !== null) {
          try { await fs.rename(backup, destination) }
          catch (restoreError) { throw new Error(`${String(error)}; original saved at ${backup}; restore failed: ${String(restoreError)}`, { cause: restoreError }) }
        }
        throw error
      } finally {
        if (staged !== null) await fs.rm(staged, { recursive: true, force: true })
      }
    }
    const token = captured.token
    if (committing.has(token)) throw new Error("file operation is already committing")
    committing.add(token)
    try {
      return await apply()
    } finally {
      committing.delete(token)
      if (ending.delete(token)) await end(token)
    }
  }

  const journalCommit = async (captured: PluginDiskRoots, recipe: PluginJournalCommit): Promise<{ committed: boolean; warnings: string[] }> => {
    if (!captured?.token || !tokens.has(captured.token) || !captured.declaration.lease) throw new Error("cross-process lease required")
    const token = captured.token
    if (committing.has(token)) throw new Error("file operation is already committing")
    committing.add(token)
    try {
      await validate(captured)
      if (!recipe || !Array.isArray(recipe.before) || !Array.isArray(recipe.after) || !recipe.commit || recipe.commit.after === null || recipe.commit.after === recipe.commit.before) throw new Error("invalid journal transaction")
      if (!allowedRef(captured, recipe.pending, false)) throw new Error("journal directory is outside the allowlist")
      const pending = await target(captured, recipe.pending)
      const pendingEntries = await fs.readdir(pending).catch((error: unknown) => { if (missing(error)) return []; throw error })
      if (pendingEntries.length) throw new Error("pending client transaction requires recovery")
      if (recipe.guardEmpty !== undefined && !Array.isArray(recipe.guardEmpty)) throw new Error("invalid recovery guards")
      for (const ref of recipe.guardEmpty ?? []) {
        if (!allowedRef(captured, ref, false)) throw new Error("recovery guard is outside the allowlist")
        const dir = await target(captured, ref)
        const entries = await fs.readdir(dir).catch((error: unknown) => { if (missing(error)) return []; throw error })
        if (entries.length) throw new Error("pending client transaction requires recovery")
      }
      const changes = [...recipe.before, recipe.commit, ...recipe.after]
      const files: { file: string; change: PluginDiskChange }[] = []
      const seen = new Set<string>()
      for (const change of changes) {
        if (!change || !(change.before === null || typeof change.before === "string") || !(change.after === null || typeof change.after === "string") || !allowedRef(captured, change.ref, true)) throw new Error("invalid journal file change")
        const file = await target(captured, change.ref)
        if (seen.has(file)) throw new Error("duplicate journal file change")
        seen.add(file)
        if (await readText(file) !== change.before) throw new Error(`file changed; retry: ${file}`)
        files.push({ file, change })
      }
      const journal = recipe.journal
      let journalFile: string | null = null
      if (journal !== undefined) {
        if (!allowedRef(captured, journal.ref, true)) throw new Error("journal is outside the allowlist")
        journalFile = await target(captured, journal.ref)
        if (path.dirname(journalFile) !== pending || seen.has(journalFile) || await readText(journalFile) !== null) throw new Error("invalid journal path")
        for (const value of [journal.prepared, journal.swapped, journal.committed]) {
          if (typeof value !== "string" || typeof JSON.parse(value) !== "object" || JSON.parse(value) === null) throw new Error("invalid journal document")
        }
      }
      const artifact = recipe.artifact
      let destination: string | null = null, staging: string | null = null, backup: string | null = null
      if (artifact !== undefined) {
        if (!journal || (artifact.operation !== "copy" && artifact.operation !== "remove") || !(artifact.before === null || typeof artifact.before === "string")) throw new Error("invalid journal artifact")
        const name = assertSafeSegment(artifact.name, "plugin name")
        if (!directoryAllowed(captured, artifact.destination, name)) throw new Error("invalid plugin directory destination")
        destination = await directory(captured, { root: "plugins", path: artifact.destination })
        if (!allowedRef(captured, artifact.backup, true)) throw new Error("backup outside allowlist")
        backup = await target(captured, artifact.backup)
        if (artifact.operation === "copy") {
          if (!artifact.staging || typeof artifact.sourceSnapshot !== "string" || !allowedRef(captured, artifact.staging, true)) throw new Error("invalid staging declaration")
          staging = await target(captured, artifact.staging)
        } else if (artifact.staging !== undefined || artifact.before === null) throw new Error("invalid removal declaration")
        const dirs = [destination, backup, ...(staging ? [staging] : [])]
        if (dirs.some((dir, index) => dirs.some((other, otherIndex) => index !== otherIndex && (inside(dir, other) || inside(other, dir)))) || dirs.some(dir => inside(dir, pending) || inside(pending, dir) || files.some(item => inside(dir, item.file) || inside(item.file, dir)) || (journalFile !== null && (inside(dir, journalFile) || inside(journalFile, dir))))) throw new Error("overlapping journal paths")
        if (!(artifact.before === null ? await absent(destination) : await directorySnapshot(destination) === artifact.before) || !(await absent(backup)) || (staging !== null && !(await absent(staging)))) throw new Error("directory changed; retry")
      }
      let prepared = false, swapped = false, committed = false, movedOld = false
      const written: typeof files = []
      const warnings: string[] = []
      const save = async (file: string, text: string, beforeReplace?: () => Promise<void>) => {
        if (options.write) await options.write(file, text, { beforeReplace })
        else await durableWrite(file, text, beforeReplace)
      }
      const check = async () => { await validate(captured) }
      const prepareJournal = async () => {
        if (!journal || journalFile === null) return
        await check()
        if (await target(captured, journal.ref) !== journalFile || await readText(journalFile) !== null) throw new Error("journal changed; retry")
        await save(journalFile, journal.prepared, async () => {
          await check()
          if (await target(captured, journal.ref) !== journalFile || await readText(journalFile) !== null) throw new Error("journal changed; retry")
        })
        prepared = true
      }
      const writeChange = async (item: typeof files[number]) => {
        await check()
        if (await target(captured, item.change.ref) !== item.file || await readText(item.file) !== item.change.before) throw new Error(`file changed; retry: ${item.file}`)
        if (item.change.before === item.change.after) return
        await check()
        if (item.change.after === null) await fs.rm(item.file, { force: true })
        else await save(item.file, item.change.after, async () => {
          await check()
          if (await target(captured, item.change.ref) !== item.file || await readText(item.file) !== item.change.before) throw new Error(`file changed; retry: ${item.file}`)
        })
      }
      try {
        if (artifact?.operation === "copy" && staging !== null) {
          if (!(await options.library.list()).some(row => row.name === artifact.name) || !(await options.library.has(artifact.name, artifact.manifests))) throw new Error("plugin is not in the library")
          const source = await safePath(captured.library, artifact.name)
          if (await directorySnapshot(source, captured.declaration) !== artifact.sourceSnapshot) throw new Error("plugin pack changed; retry")
          await fs.mkdir(path.dirname(staging), { recursive: true })
          await check()
          if (await target(captured, artifact.staging!) !== staging) throw new Error("staging path changed")
          await fs.mkdir(staging)
          await prepareJournal()
          const filter = copyFilter(source, captured.declaration)
          for (const entry of await fs.readdir(source)) {
            const from = path.join(source, entry)
            if (filter(from)) await fs.cp(from, path.join(staging, entry), { recursive: true, errorOnExist: true, force: false, filter })
          }
          if (await directorySnapshot(staging) !== artifact.sourceSnapshot || await directorySnapshot(source, captured.declaration) !== artifact.sourceSnapshot) throw new Error("plugin pack changed while copying")
        }
        await check()
        for (const item of files) if (await readText(item.file) !== item.change.before) throw new Error(`file changed; retry: ${item.file}`)
        if (artifact && destination !== null && !(artifact.before === null ? await absent(destination) : await directorySnapshot(destination) === artifact.before)) throw new Error("directory changed; retry")
        if (!prepared) await prepareJournal()
        if (artifact && destination !== null && backup !== null) {
          await check()
          await fs.mkdir(path.dirname(backup), { recursive: true })
          await fs.mkdir(path.dirname(destination), { recursive: true })
          if (await target(captured, artifact.backup) !== backup || await directory(captured, { root: "plugins", path: artifact.destination }) !== destination || !(await absent(backup)) || !(artifact.before === null ? await absent(destination) : await directorySnapshot(destination) === artifact.before)) throw new Error("directory changed; retry")
          if (artifact.before !== null) { await renameArtifact(destination, backup, check); movedOld = true }
          if (staging !== null) { await renameArtifact(staging, destination, check) }
          swapped = true
          if (journal && journalFile !== null) {
            await check()
            if (await target(captured, journal.ref) !== journalFile || await readText(journalFile) !== journal.prepared) throw new Error("journal changed; retry")
            await save(journalFile, journal.swapped, async () => {
              await check()
              if (await target(captured, journal.ref) !== journalFile || await readText(journalFile) !== journal.prepared) throw new Error("journal changed; retry")
            })
          }
        }
        for (const item of files.slice(0, recipe.before.length)) {
          if (item.change.before !== item.change.after) written.push(item)
          await writeChange(item)
        }
        const commitFile = files[recipe.before.length]!
        await writeChange(commitFile)
        committed = true
        if (journal && journalFile !== null) {
          await check()
          const expectedJournal = artifact ? journal.swapped : journal.prepared
          if (await target(captured, journal.ref) !== journalFile || await readText(journalFile) !== expectedJournal) throw new Error("journal changed after commit")
          await save(journalFile, journal.committed, async () => {
            await check()
            if (await target(captured, journal.ref) !== journalFile || await readText(journalFile) !== expectedJournal) throw new Error("journal changed after commit")
          })
        }
        for (const item of files.slice(recipe.before.length + 1)) await writeChange(item)
        await check()
        if (backup !== null && movedOld) {
          if (await directorySnapshot(backup) !== artifact!.before) throw new Error(`backup changed: ${backup}`)
          await fs.rm(backup, { recursive: true })
        }
        if (journalFile !== null && journal) {
          await check()
          if (await target(captured, journal.ref) !== journalFile || await readText(journalFile) !== journal.committed) throw new Error("journal changed after commit")
          await fs.rm(journalFile)
        }
      } catch (error) {
        if (!committed && !compromised.has(token)) {
          const commitFile = files[recipe.before.length]!
          if (await readText(commitFile.file) === commitFile.change.after) committed = true
        }
        if (committed) {
          warnings.push(error instanceof Error ? error.message : String(error))
          return { committed: true, warnings }
        }
        if (compromised.has(token)) throw new Error("file operation lease was compromised; transaction preserved for recovery", { cause: error })
        try {
          for (const item of written.reverse()) {
            await check()
            const current = await readText(item.file)
            if (current === item.change.before) continue
            if (current !== item.change.after) throw new Error(`file changed during rollback: ${item.file}`, { cause: error })
            await check()
            if (item.change.before === null) await fs.rm(item.file, { force: true })
            else await save(item.file, item.change.before, async () => {
              await check()
              if (await target(captured, item.change.ref) !== item.file || await readText(item.file) !== item.change.after) throw new Error(`file changed during rollback: ${item.file}`, { cause: error })
            })
          }
          if (destination !== null && swapped && artifact?.operation === "copy") {
            await check()
            if (await directorySnapshot(destination) !== artifact.sourceSnapshot) throw new Error("destination changed during rollback", { cause: error })
            await check()
            await fs.rm(destination, { recursive: true })
          }
          if (destination !== null && backup !== null && movedOld) {
            await check()
            if (await directorySnapshot(backup) !== artifact!.before || !(await absent(destination))) throw new Error("backup changed during rollback", { cause: error })
            await renameArtifact(backup, destination, check)
          }
          if (staging !== null && !(await absent(staging))) {
            await check()
            if (await directorySnapshot(staging) !== artifact?.sourceSnapshot) throw new Error("staging changed during rollback", { cause: error })
            await check()
            await fs.rm(staging, { recursive: true })
          }
          if (prepared && journalFile !== null && journal) {
            await check()
            const current = await readText(journalFile)
            if (current !== journal.prepared && current !== journal.swapped) throw new Error("journal changed during rollback", { cause: error })
            await check()
            await fs.rm(journalFile)
          }
        } catch (restoreError) {
          throw new Error(`transaction failed: ${String(error)}; rollback failed, ${prepared ? `journal ${journalFile}` : `staging ${staging}`} preserved: ${String(restoreError)}`, { cause: restoreError })
        }
        throw error
      }
      return { committed: true, warnings }
    } finally {
      committing.delete(token)
      if (ending.delete(token)) await end(token)
    }
  }

  const begin = async (declaration: PluginDiskDeclaration): Promise<PluginDiskRoots> => {
    const initial = await roots(declaration)
    const previous = queues.get(initial.plugins) ?? Promise.resolve()
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    const barrier = previous.catch(() => undefined).then(() => held)
    queues.set(initial.plugins, barrier)
    await previous.catch(() => undefined)
    let unlock: (() => Promise<void>) | undefined
    const token = randomUUID()
    try {
      const captured = await roots(declaration)
      if (captured.plugins !== initial.plugins) throw new Error("file root changed; retry the operation")
      const lease = captured.declaration.lease
      if (lease !== undefined) {
        if (!allowedRef(captured, lease.ref, true)) throw new Error("lease is outside the plugin state allowlist")
        const lockPath = await target(captured, lease.ref)
        await fs.mkdir(path.dirname(lockPath), { recursive: true })
        if (await target(captured, lease.ref) !== lockPath) throw new Error("lease path changed")
        await safePath(captured[lease.ref.root]!, `${lease.ref.path}.lock`)
        try {
          const handle = await fs.open(lockPath, "wx", 0o600)
          await handle.close()
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
        }
        if (await target(captured, lease.ref) !== lockPath || !(await fs.lstat(lockPath)).isFile()) throw new Error("lease path changed")
        unlock = await lock(lockPath, { stale: lease.stale, update: lease.update, retries: lease.retries, onCompromised: error => { compromised.set(token, error) } })
        await validate(captured)
        if (compromised.has(token)) throw new Error("file operation lease was compromised", { cause: compromised.get(token) })
      }
      captured.token = token
      tokens.set(token, captured)
      releases.set(token, async () => {
        tokens.delete(token)
        try { await unlock?.() } finally {
          compromised.delete(token)
          release()
          if (queues.get(initial.plugins) === barrier) queues.delete(initial.plugins)
        }
      })
      const timer = setTimeout(() => { void end(token).catch(() => undefined) }, 120_000)
      timer.unref()
      timers.set(token, timer)
      return captured
    } catch (error) {
      try { await unlock?.() } finally {
        compromised.delete(token)
        release()
        if (queues.get(initial.plugins) === barrier) queues.delete(initial.plugins)
      }
      throw error
    }
  }
  const end = async (token: string): Promise<void> => {
    if (committing.has(token)) {
      ending.add(token)
      return
    }
    const release = releases.get(token)
    releases.delete(token)
    const timer = timers.get(token)
    if (timer !== undefined) clearTimeout(timer)
    timers.delete(token)
    await release?.()
  }

  return {
    roots,
    begin,
    end,
    async read(captured, ref) {
      if (!allowedRef(captured, ref, false)) throw new Error("file is outside the plugin state allowlist")
      return readText(await target(captured, ref))
    },
    async list(captured, ref, options) {
      if (options !== undefined && (typeof options !== "object" || options === null || (options.includeLinks !== undefined && typeof options.includeLinks !== "boolean"))) throw new Error("invalid list options")
      if (!allowedRef(captured, ref, false)) throw new Error("directory is outside the plugin state allowlist")
      const dir = await target(captured, ref)
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch((error: unknown) => {
        if (missing(error)) return []
        throw error
      })
      return entries.filter((entry) => options?.includeLinks === true || !entry.isSymbolicLink()).map((entry) => ({ name: entry.name, directory: entry.isDirectory() }))
    },
    async path(captured, ref) {
      if (!allowedRef(captured, ref, false)) throw new Error("directory is outside the plugin state allowlist")
      return target(captured, ref)
    },
    async snapshotDirectory(captured, ref) {
      if (ref?.root === "library") {
        if (!allowedRef(captured, ref, false)) throw new Error("directory is outside the plugin library allowlist")
        return directorySnapshot(await target(captured, ref), captured.declaration)
      }
      return directorySnapshot(await directory(captured, ref))
    },
    async removeDirectory(captured, ref) {
      if (!captured.token || !tokens.has(captured.token)) throw new Error("file operation lease required")
      const cacheParent = /^cache\/[^/]+\/[^/]+$/.test(ref.path) && ref.path.split("/").every((part) => { try { assertSafeSegment(part, "plugin directory"); return true } catch { return false } })
      if (ref.root !== "plugins" || !(cacheParent || directoryAllowed(captured, ref.path)) || !allowedRef(captured, ref, true)) throw new Error("directory is outside the plugin directory allowlist")
      await fs.rm(await target(captured, ref), { recursive: true, force: true })
    },
    external,
    async readExternal(captured, directory, relative) {
      if (!captured.declaration.external.some((pattern) => matches(pattern, relative))) throw new Error("external path is outside the file scope")
      const file = await external(captured, directory, relative)
      const text = await readText(file)
      return text
    },
    commit,
    journalCommit,
    async run(declaration, work) {
      const captured = await begin(declaration)
      let failed = false
      try {
        return await work(captured)
      } catch (error) {
        failed = true
        throw error
      } finally {
        if (!failed) await end(captured.token!)
        else await end(captured.token!).catch(() => undefined)
      }
    },
  }
}
