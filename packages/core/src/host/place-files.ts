/** 客户端配置文件的宿主端口；声明根支持受限枚举和快照写入。 */
import { createHash } from "node:crypto"
import { promises as fs } from "node:fs"
import path from "node:path"

import type { AssetScope, PlaceFiles, PlaceRef, PlaceRoot, PlaceSnapshot } from "../place-files.ts"
import { writeFileAtomic } from "./atomic.ts"
import { resolveHubHome, userHome } from "./home.ts"
import { createFsWorkspaceStore } from "./workspaces-fs.ts"

const SCOPES: readonly string[] = ["workspace", "global"]
const leases = new Map<string, Promise<void>>()

export interface PlaceFileOptions {
  /** Hub 数据根；工作区列表保存在这里。 */
  home?: string
  /** 未选择工作区时使用的宿主目录。 */
  folder?: string
  /** 全局位置的用户目录，省略时使用系统用户目录。 */
  userHome?: string
  /** 供测试隔离的环境变量表，省略时使用进程环境。 */
  env?: NodeJS.ProcessEnv
}

function relativeFile(file: string): boolean {
  return file !== "" && !path.isAbsolute(file) && !/^[A-Za-z]:/.test(file) &&
    !file.includes("\\") && !file.split("/").some((part) => part === ".." || part === "" || part === ".")
}

function assertRoot(root: unknown): PlaceRoot {
  if (typeof root !== "object" || root === null) throw new Error("invalid place root")
  const value = root as { home?: unknown; homeEnv?: unknown; list?: unknown }
  if (typeof value.home !== "string" || !relativeFile(value.home)) throw new Error("invalid place root fallback")
  if (value.homeEnv !== undefined && (typeof value.homeEnv !== "string" ||
    !/^[A-Z][A-Z0-9_]*_HOME$/.test(value.homeEnv) ||
    /SECRET|TOKEN|PASS|CRED|PRIVATE|KEY|AUTH|COOKIE|BEARER|SESSION/.test(value.homeEnv))) {
    throw new Error("invalid place root environment name")
  }
  if (value.list !== undefined && (!Array.isArray(value.list) || value.list.length > 32 ||
    !value.list.every((entry) => typeof entry === "string" && entry !== "" && !entry.includes("\\") &&
      entry.split("/").every((part) => part === "*" || /^[A-Za-z0-9][A-Za-z0-9._~-]*$/.test(part))))) {
    throw new Error("invalid client directory allowlist")
  }
  return { home: value.home, ...(value.homeEnv === undefined ? {} : { homeEnv: value.homeEnv }),
    ...(value.list === undefined ? {} : { list: value.list as string[] }) }
}

function templatePattern(entry: string): RegExp {
  const escaped = entry.split("/").map((part) => part === "*" ? "(?!\\.{1,2}$)[A-Za-z0-9._~@-]+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  return new RegExp(`^${escaped.join("/")}$`)
}

function templateAllowed(root: PlaceRoot, parent: string): boolean {
  return (root.list ?? []).some((entry) => entry.split("/").includes("*") && templatePattern(entry).test(parent))
}

/** 在宿主解析路径前进行校验。 */
export function assertPlaceFile(ref: unknown): PlaceRef {
  if (typeof ref !== "object" || ref === null) throw new Error("not a place")
  const place = ref as { scope?: unknown; file?: unknown; root?: unknown; rootIdentity?: unknown; pathTemplate?: unknown }
  if (typeof place.scope !== "string" || !SCOPES.includes(place.scope)) {
    throw new Error(`unknown scope: ${String(place.scope)}`)
  }
  if (typeof place.file !== "string" || place.file === "") throw new Error("a place needs a file")
  if (path.isAbsolute(place.file) || /^[A-Za-z]:/.test(place.file)) {
    throw new Error(`a place's file is relative to its scope: ${place.file}`)
  }
  if (place.file.includes("\\") || place.file.split("/").includes("..")) {
    throw new Error(`a place's file cannot climb out of its scope: ${place.file}`)
  }
  const root = place.root === undefined ? undefined : assertRoot(place.root)
  if (root !== undefined && !relativeFile(place.file)) throw new Error("invalid client-root path")
  if (root !== undefined && place.scope !== "global") throw new Error("a client root must be global")
  const template = place.pathTemplate as { file?: unknown; name?: unknown } | undefined
  if (template !== undefined && (root === undefined || typeof template.file !== "string" || typeof template.name !== "string" ||
    template.name === "" || !/^[A-Za-z0-9][A-Za-z0-9._~-]*$/.test(template.name) || template.name.includes("$") ||
    (template.file.match(/\$\{name\}/g) ?? []).length !== 1 || !template.file.split("/").every((part) =>
      part === "${name}" || (part !== "" && part !== "." && part !== ".." && !part.includes("$"))))) {
    throw new Error("invalid client path template")
  }
  if (place.rootIdentity !== undefined && (root === undefined || typeof place.rootIdentity !== "string" || !/^[a-f0-9]{64}$/.test(place.rootIdentity))) {
    throw new Error("invalid client root identity")
  }
  return { scope: place.scope as AssetScope, file: place.file, ...(root === undefined ? {} : { root }),
    ...(place.rootIdentity === undefined ? {} : { rootIdentity: place.rootIdentity }),
    ...(template === undefined ? {} : { pathTemplate: { file: template.file as string, name: template.name as string } }) }
}

/** 拒绝路径中已存在的符号链接，包括声明根本身。 */
async function noLinks(target: string): Promise<void> {
  const absolute = path.resolve(target)
  const start = path.parse(absolute).root
  let current = start
  for (const part of absolute.slice(start.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    try {
      if ((await fs.lstat(current)).isSymbolicLink()) {
        throw Object.assign(new Error(`symbolic link in client path: ${current}`), { code: "PLACE_PATH_LINK" })
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return
      throw error
    }
  }
}

async function leased<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = leases.get(key) ?? Promise.resolve()
  let release!: () => void
  const next = new Promise<void>((resolve) => { release = resolve })
  const queued = previous.then(() => next)
  leases.set(key, queued)
  await previous
  try { return await run() } finally {
    release()
    if (leases.get(key) === queued) leases.delete(key)
  }
}

export function createFsPlaceFiles(options: PlaceFileOptions = {}): PlaceFiles {
  const home = resolveHubHome(options.home)
  const homeDir = options.userHome ?? userHome()
  const env = options.env ?? process.env
  const workspaces = createFsWorkspaceStore(home, { folder: options.folder })
  const identity = (base: string): string => createHash("sha256").update(path.resolve(base)).digest("hex")

  const baseOf = async (place: PlaceRef): Promise<string | null> => {
    if (place.root !== undefined) {
      const value = place.root.homeEnv === undefined ? undefined : env[place.root.homeEnv]
      const override = value?.trim() === "" ? undefined : value
      if (override) {
        if (!path.isAbsolute(override)) throw new Error("client root environment path must be absolute")
        return path.resolve(override)
      }
      return path.resolve(homeDir, ...place.root.home.split("/"))
    }
    if (place.scope === "global") return homeDir
    const page = await workspaces.page()
    return page.folders.find((item) => item.id === page.current)?.path ?? null
  }

  const resolve = async (ref: unknown): Promise<{ place: PlaceRef; base: string; file: string; missing?: boolean } | null> => {
    const place = assertPlaceFile(ref)
    const base = await baseOf(place)
    if (base === null) return null
    if (place.rootIdentity !== undefined && identity(base) !== place.rootIdentity) {
      throw new Error("client root changed since resolution")
    }
    let relative = place.file
    if (place.pathTemplate !== undefined) {
      const expected = place.pathTemplate.file.replace("${name}", place.pathTemplate.name)
      const parent = place.pathTemplate.file.slice(0, place.pathTemplate.file.indexOf("${name}")).replace(/\/$/, "")
      if (relative !== expected || place.root === undefined || !templateAllowed(place.root, parent)) {
        throw new Error("client path template is outside its declared directory")
      }
      const parentPath = path.join(base, ...parent.split("/").filter(Boolean))
      const entries = await fs.readdir(parentPath, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null
        throw error
      })
      if (entries === null) {
        return { place, base, file: path.join(base, ...expected.split("/")), missing: true }
      }
      const entry = entries.find((candidate) => candidate.name === place.pathTemplate!.name)
      if (entry === undefined) {
        return { place, base, file: path.join(base, ...expected.split("/")), missing: true }
      }
      if (!entry.isDirectory() || entry.isSymbolicLink()) throw new Error("symbolic link in client path template")
      relative = expected
    }
    const file = path.join(base, ...relative.split("/"))
    if (place.root !== undefined) {
      const within = path.relative(base, file)
      if (within === "" || within === ".." || within.startsWith(`..${path.sep}`) || path.isAbsolute(within)) {
        throw new Error("client path escapes its declared root")
      }
      await noLinks(file)
    }
    return { place, base, file }
  }

  const required = async (ref: unknown) => {
    const result = await resolve(ref)
    if (result === null) throw new Error("this hub has no workspace open")
    if (result.missing === true) throw new Error("the client path template names no directory")
    return result
  }

  const read = async (file: string): Promise<string | null> => fs.readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null
    throw error
  })

  return {
    async read(ref) {
      const target = await resolve(ref)
      return target === null || target.missing === true ? null : read(target.file)
    },
    async write(ref, text) {
      const target = await required(ref)
      if (target.place.root !== undefined) throw new Error("client roots require a guarded commit")
      await writeFileAtomic(target.file, text)
    },
    async remove(ref) {
      const target = await required(ref)
      if (target.place.root !== undefined) throw new Error("client roots require a guarded commit")
      await fs.rm(target.file, { force: true })
    },
    async list(ref) {
      const target = await required(ref)
      if (target.place.root === undefined || !target.place.root.list?.includes(target.place.file)) {
        throw new Error("directory is not in the declared client root allowlist")
      }
      const entries = await fs.readdir(target.file, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return []
        throw error
      })
      if (entries.length > 4096) throw new Error("client directory has too many entries")
      return entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()).map((entry) => entry.name).sort()
    },
    async display(ref) {
      const target = await required(ref)
      return target.file
    },
    async snapshot(ref): Promise<PlaceSnapshot> {
      const target = await required(ref)
      if (target.place.root === undefined) throw new Error("snapshot requires a declared client root")
      return { text: await read(target.file), root: identity(target.base) }
    },
    async commit(ref, before, text) {
      const first = await required(ref)
      if (first.place.root === undefined) throw new Error("commit requires a declared client root")
      const leaseKey = process.platform === "win32" ? first.file.toLowerCase() : first.file
      await leased(leaseKey, async () => {
        const target = await required(ref)
        if (identity(target.base) !== before.root || await read(target.file) !== before.text) {
          throw new Error("client file changed since snapshot")
        }
        await writeFileAtomic(target.file, text, {
          beforeReplace: async () => {
            const current = await required(ref)
            if (current.file !== target.file || identity(current.base) !== before.root || await read(current.file) !== before.text) {
              throw new Error("client file changed since snapshot")
            }
          },
        })
      })
    },
    workspace() {
      return baseOf({ scope: "workspace", file: "workspace" })
    },
  }
}
