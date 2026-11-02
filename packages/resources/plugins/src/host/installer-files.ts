import { createHash, randomUUID } from "node:crypto"
import { promises as fs } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"

import { writeFileAtomic } from "@context-hub/core/host/atomic"

import type {
  PluginDisk,
  PluginDiskChange,
  PluginDiskDeclaration,
  PluginDiskRef,
  PluginDiskRoots,
} from "../provider.ts"
import { assertPackRelative, assertSafeSegment } from "./names.ts"
import type { PluginLibrary } from "./library.ts"

interface Options {
  library: PluginLibrary
  workspace(): Promise<string | null>
  userHome?: string
  env?: NodeJS.ProcessEnv
  write?: typeof writeFileAtomic
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
  const patterns = (input: unknown): string[] => {
    if (!Array.isArray(input) || input.some((pattern) => typeof pattern !== "string" || pattern === "" || pattern.split("/").some((part: string) => part === "" || part === "." || part === ".." || (part.includes("*") && part !== "*" && part !== "**") || /[\\:]/.test(part)))) throw new Error("invalid file scope pattern")
    return input as string[]
  }
  const scope = (input: unknown) => {
    if (typeof input !== "object" || input === null) throw new Error("invalid file scope")
    const entry = input as { write?: unknown; read?: unknown }
    return { write: patterns(entry.write), read: patterns(entry.read) }
  }
  return { home: segment(value.home), homeEnv: variable(value.homeEnv), state: segment(value.state), stateEnv: variable(value.stateEnv), config: scope(value.config), stateFiles: scope(value.stateFiles), workspace: scope(value.workspace), library: scope(value.library), external: patterns(value.external) }
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

export interface InstallerFiles extends PluginDisk {
  begin(declaration: PluginDiskDeclaration): Promise<PluginDiskRoots>
  end(token: string): void
}

export function createInstallerFiles(options: Options): InstallerFiles {
  const env = options.env ?? process.env
  const write = options.write ?? writeFileAtomic
  const tokens = new Map<string, PluginDiskRoots>()
  const releases = new Map<string, () => void>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const committing = new Set<string>()
  const ending = new Set<string>()

  const roots = async (input: PluginDiskDeclaration): Promise<PluginDiskRoots> => {
    const declaration = declarationOf(input)
    const config = environmentRoot(declaration.homeEnv === undefined ? undefined : env[declaration.homeEnv], path.join(options.userHome ?? homedir(), declaration.home))
    const plugins = environmentRoot(declaration.stateEnv === undefined ? undefined : env[declaration.stateEnv], path.join(config, declaration.state))
    const workspace = await options.workspace()
    return {
      declaration,
      config,
      plugins,
      workspace: workspace === null ? null : path.resolve(workspace),
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

  const commit = async (
    captured: PluginDiskRoots,
    changes: readonly PluginDiskChange[],
    copy?: { name: string; destination: string; replace?: boolean; pruneVersions?: boolean }
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
      try {
        if (copy !== undefined) {
          if (typeof copy !== "object" || copy === null || typeof copy.name !== "string" || typeof copy.destination !== "string") {
            throw new Error("invalid plugin copy")
          }
          const name = assertSafeSegment(copy.name, "plugin name")
          const parts = assertPackRelative(copy.destination).split("/")
          if (parts.length !== 4 || parts[0] !== "cache" || parts[2] !== name || !allowedRef(captured, { root: "plugins", path: copy.destination }, true)) throw new Error("invalid plugin cache destination")
          assertSafeSegment(parts[1]!, "marketplace name")
          assertSafeSegment(parts[3]!, "plugin version")
          if (!(await options.library.list()).some((record) => record.name === name) || !(await options.library.has(name))) {
            throw new Error(`${name} is not in this library`)
          }
          const source = await safePath(captured.library, name)
          destination = await safePath(captured.plugins, copy.destination)
          const sourceHash = await treeHash(source)
          const destinationStat = await fs.lstat(destination).catch((error: unknown) => {
            if (missing(error)) return null
            throw error
          })
          if (destinationStat !== null && !destinationStat.isDirectory()) throw new Error(`plugin cache is not a directory: ${destination}`)
          const different = destinationStat !== null && await treeHash(destination, true) !== sourceHash
          if (different && !copy.replace) throw new Error(`plugin cache already contains different files: ${destination}`)
          if (destinationStat === null || different) {
            await fs.mkdir(path.dirname(destination), { recursive: true })
            staged = path.join(path.dirname(destination), `.tmp-plugin-${randomUUID()}`)
            await fs.cp(source, staged, { recursive: true, errorOnExist: true, force: false })
            if (await treeHash(staged) !== sourceHash || await treeHash(source) !== sourceHash) {
              throw new Error("plugin pack changed while copying; retry")
            }
          }
        }
        await validate(captured)
        for (const item of files) {
          if (await readText(item.file) !== item.before) throw new Error(`file changed; retry: ${item.file}`)
        }
        if (staged !== null && destination !== null) {
          if (await fs.lstat(destination).catch((error: unknown) => { if (missing(error)) return null; throw error })) {
            backup = `${destination}.backup-${randomUUID()}`
            await fs.rename(destination, backup)
          }
          await fs.rename(staged, destination)
          activated = true
          staged = null
        }
        const written: typeof files = []
        try {
          for (const item of files) {
            if (item.before === item.after) continue
            if (await target(captured, item.ref) !== item.file) throw new Error("file path changed; retry")
            if (await readText(item.file) !== item.before) throw new Error(`file changed; retry: ${item.file}`)
            if (item.after === null) await fs.rm(item.file, { force: true })
            else await write(item.file, item.after)
            written.push(item)
          }
        } catch (error) {
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
        if (backup !== null) { await fs.rm(backup, { recursive: true, force: true }); backup = null }
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
        if (activated && destination !== null) await fs.rm(destination, { recursive: true, force: true })
        if (backup !== null && destination !== null) await fs.rename(backup, destination)
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
      if (ending.delete(token)) end(token)
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
    try {
      const captured = await roots(declaration)
      if (captured.plugins !== initial.plugins) throw new Error("file root changed; retry the operation")
      const token = randomUUID()
      captured.token = token
      tokens.set(token, captured)
      releases.set(token, () => {
        tokens.delete(token)
        release()
        if (queues.get(initial.plugins) === barrier) queues.delete(initial.plugins)
      })
      const timer = setTimeout(() => end(token), 120_000)
      timer.unref()
      timers.set(token, timer)
      return captured
    } catch (error) {
      release()
      if (queues.get(initial.plugins) === barrier) queues.delete(initial.plugins)
      throw error
    }
  }
  const end = (token: string): void => {
    if (committing.has(token)) {
      ending.add(token)
      return
    }
    const release = releases.get(token)
    releases.delete(token)
    const timer = timers.get(token)
    if (timer !== undefined) clearTimeout(timer)
    timers.delete(token)
    release?.()
  }

  return {
    roots,
    begin,
    end,
    async read(captured, ref) {
      if (!allowedRef(captured, ref, false)) throw new Error("file is outside the plugin state allowlist")
      return readText(await target(captured, ref))
    },
    async list(captured, ref) {
      if (!allowedRef(captured, ref, false)) throw new Error("directory is outside the plugin state allowlist")
      const dir = await target(captured, ref)
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch((error: unknown) => {
        if (missing(error)) return []
        throw error
      })
      return entries.filter((entry) => !entry.isSymbolicLink()).map((entry) => ({ name: entry.name, directory: entry.isDirectory() }))
    },
    async path(captured, ref) {
      if (!allowedRef(captured, ref, false)) throw new Error("directory is outside the plugin state allowlist")
      return target(captured, ref)
    },
    async removeDirectory(captured, ref) {
      if (!captured.token || !tokens.has(captured.token)) throw new Error("file operation lease required")
      if (ref.root !== "plugins" || !/^cache\/[^/]+\/[^/]+(?:\/[^/]+)?$/.test(ref.path) || !allowedRef(captured, ref, true)) throw new Error("directory is outside the plugin cache allowlist")
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
    async run(declaration, work) {
      const captured = await begin(declaration)
      try {
        return await work(captured)
      } finally {
        end(captured.token!)
      }
    },
  }
}
