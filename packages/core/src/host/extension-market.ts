/**
 * The extension market on the host: reading one index over HTTPS, cloning the
 * repository it names, and installing one directory from it.
 *
 * A market document is display data plus an install source. Installing never
 * trusts the page's copy: the handler reads the index again from the source the
 * page configured, and the installer clones the default branch and checks the
 * directory hash before anything moves into `<home>/extensions`.
 *
 * This module runs in the process that owns the disk.
 */
import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

import {
  isLocalMarketPath,
  isMarketIndexUrl,
  readMarketIndex,
  type ExtensionMarketIndex,
  type ExtensionMarketPlugin,
  type ExtensionMarketVersion,
  type MarketSource,
} from "../extension-market.ts"
import { isCompatible, parsePluginManifestYaml, parsePluginPackage, type ExtensionPermission, type PluginPackageFile } from "../extension-manifest.ts"
import { assertPluginId, EXTENSION_MARKET_CACHE, PLUGIN_MANIFEST } from "../plugins.ts"
import type { PluginRecord, PluginStore } from "../plugins.ts"
import type { StateStore } from "../state.ts"
import { writeFileAtomic } from "./atomic.ts"
import { isPublicHostname } from "./remote-image.ts"

/** How long one index fetch may take before it is abandoned. */
const FETCH_TIMEOUT_MS = 15_000

/** The largest index this hub will read. */
const INDEX_LIMIT = 2 * 1024 * 1024

/** The most a downloaded extension may hold. */
const FILE_LIMIT = 5000
const BYTES_LIMIT = 64 * 1024 * 1024

/** Entries a download leaves out, matching `folderHash`'s own skips. */
const SKIPPED_NAMES = new Set([".git", "node_modules"])
const SKIPPED_PATH = /(^|[/\\])(?:\.git|node_modules)([/\\]|$)/

/** Errors an atomic directory move retries, as `atomic.ts` does for files. */
const RETRY_CODES = new Set(["EACCES", "EBUSY", "EPERM"])

/** Fetch options; the test-only switches keep the production path narrow. */
export interface MarketFetchOptions {
  /** Allow `http:`; tests use a loopback server. */
  allowHttp?: boolean
  /** Allow a loopback or private host; tests use one. */
  allowPrivate?: boolean
  timeoutMs?: number
  maxBytes?: number
  fetch?: typeof globalThis.fetch
}

/** One configured market index, read through a cache. */
export interface MarketReader {
  read(url: string, refresh?: boolean): Promise<ExtensionMarketIndex>
}

export interface MarketReaderOptions extends MarketFetchOptions {
  cacheTtlMs?: number
}

/** What one install produced. */
export interface InstallResult {
  id: string
  version: string
  /** Whether the extension is enabled after this install. */
  enabled: boolean
  /** True when no directory existed before this install. */
  fresh: boolean
  /** A non-fatal failure, e.g. the install record could not be written. */
  warning?: string
}

/** What the installer needs from the store and the state document. */
export interface InstallDependencies {
  store: Pick<PluginStore, "root" | "setRecord">
  state: Pick<StateStore, "read" | "write">
  plugin: ExtensionMarketPlugin
  version: ExtensionMarketVersion
  /** The running Context Hub version, checked against both declarations. */
  hubVersion: string
  /** Test seam for the two-step directory replacement. */
  rename?: Rename
}

type Rename = (from: string, to: string) => Promise<void>

function messageOf(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const cause = (error as { cause?: unknown }).cause
  if (cause instanceof Error) return `${error.message}: ${cause.message}`
  if (typeof cause === "string") return `${error.message}: ${cause}`
  if (typeof cause === "object" && cause !== null && "code" in cause) {
    return `${error.message}: ${String((cause as { code?: unknown }).code)}`
  }
  return error.message
}

/** Normalize an index source: an HTTPS URL, or an absolute local path. */
function normalizeIndexUrl(url: string, allowHttp: boolean): string {
  if (isLocalMarketPath(url)) return path.resolve(url.trim())
  if (!allowHttp) return isMarketIndexUrl(url)
  const parsed = (() => {
    try {
      return new URL(url.trim())
    } catch {
      throw new Error("market index: the address is not a URL")
    }
  })()
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("market index: the address must use https")
  }
  if (parsed.username !== "" || parsed.password !== "" || parsed.hash !== "") {
    throw new Error("market index: the address must not carry credentials or a fragment")
  }
  return parsed.href
}

/** Read one index from disk, allowing its versions to name a local repository. */
async function readLocalIndex(
  source: string,
  maxBytes: number
): Promise<ExtensionMarketIndex> {
  const file = /\.json$/i.test(source) ? source : path.join(source, "marketplace.json")
  const stat = await fs.stat(file).catch(() => null)
  if (stat === null || !stat.isFile()) {
    throw new Error(`market index: there is no ${file}`)
  }
  if (stat.size > maxBytes) {
    throw new Error(`market index: ${file} is larger than ${String(maxBytes)} bytes`)
  }
  const text = await fs.readFile(file, "utf8")
  let document: unknown
  try {
    document = JSON.parse(text) as unknown
  } catch {
    throw new Error(`market index: ${file} is not JSON`)
  }
  /* The index is local, so a version may name this checkout directly. Icons
     still have to be data or HTTPS URLs: the page cannot read a local file. */
  const index = readMarketIndex(document, pathToFileURL(file).href, { allowLocalGit: true })
  return localizeSources(index, path.dirname(file))
}

/**
 * Point a local index's versions at the checkout they are read from.
 *
 * A committed index names the published repository. When the same index is read
 * from a checkout during development, that URL would clone a repository that is
 * not there. If the version's `path` exists inside the checkout, the checkout
 * is the repository it means — which is what makes "point the source at this
 * folder and install" work without regenerating the index. A remote plugin
 * whose path is not present keeps its own URL.
 */
async function localizeSources(
  index: ExtensionMarketIndex,
  root: string
): Promise<ExtensionMarketIndex> {
  return {
    ...index,
    plugins: await Promise.all(
      index.plugins.map(async (plugin) => ({
        ...plugin,
        versions: await Promise.all(
          plugin.versions.map(async (version) => {
            const source = version.source
            if (isLocalMarketPath(source.url) || source.path === undefined) return version
            const at = path.resolve(root, ...source.path.split("/"))
            const inside = path.relative(root, at)
            if (inside.startsWith("..") || path.isAbsolute(inside)) return version
            const found = await fs.stat(at).catch(() => null)
            if (found === null || !found.isDirectory()) return version
            return { ...version, source: { ...source, url: root } }
          })
        ),
      }))
    ),
  }
}

/**
 * Write the metadata a market read just returned into the extensions root.
 *
 * This is a cache of listings only — no plugin files move. A failed write is
 * the caller's to ignore: the market answer is already in hand.
 */
export async function cacheMarketIndex(
  root: string,
  index: ExtensionMarketIndex
): Promise<void> {
  await fs.mkdir(root, { recursive: true })
  await writeFileAtomic(
    path.join(root, EXTENSION_MARKET_CACHE),
    `${JSON.stringify(index, null, 2)}\n`
  )
}

/**
 * Read and validate one index.
 *
 * @param url — the index URL, already configured by the user.
 * @param options — test-only switches and limits.
 * @returns the validated index, with relative icons resolved.
 */
export async function fetchMarketIndex(
  url: string,
  options: MarketFetchOptions = {}
): Promise<ExtensionMarketIndex> {
  const canonical = normalizeIndexUrl(url, options.allowHttp === true)
  const maxBytes = options.maxBytes ?? INDEX_LIMIT
  if (isLocalMarketPath(canonical)) return readLocalIndex(canonical, maxBytes)
  const parsed = new URL(canonical)
  if (options.allowPrivate !== true && !isPublicHostname(parsed.hostname)) {
    throw new Error(`market index: "${parsed.hostname}" is not a public host`)
  }
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS
  const doFetch = options.fetch ?? globalThis.fetch
  const response = await doFetch(canonical, {
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
  }).catch((error: unknown) => {
    throw new Error(`market index: could not read ${canonical}: ${messageOf(error)}`)
  })
  if (response.status >= 300 && response.status < 400) {
    throw new Error(`market index: ${canonical} redirected; configure its final URL`)
  }
  if (!response.ok) {
    throw new Error(`market index: ${canonical} answered ${String(response.status)}`)
  }
  if (response.body === null) throw new Error(`market index: ${canonical} has no body`)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new Error(`market index: ${canonical} is larger than ${String(maxBytes)} bytes`)
    }
    chunks.push(value)
  }
  const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
  let text: string
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    throw new Error(`market index: ${canonical} is not UTF-8`)
  }
  let document: unknown
  try {
    document = JSON.parse(text) as unknown
  } catch {
    throw new Error(`market index: ${canonical} is not JSON`)
  }
  return readMarketIndex(document, canonical)
}

/** Create a reader that caches successful documents and shares concurrent reads. */
export function createMarketReader(options: MarketReaderOptions = {}): MarketReader {
  const ttl = options.cacheTtlMs ?? 5 * 60_000
  const documents = new Map<string, { at: number; index: ExtensionMarketIndex }>()
  const pending = new Map<string, Promise<ExtensionMarketIndex>>()
  return {
    read(url, refresh = false) {
      const key = normalizeIndexUrl(url, options.allowHttp === true)
      const hit = documents.get(key)
      if (!refresh && hit !== undefined && Date.now() - hit.at < ttl) {
        return Promise.resolve(hit.index)
      }
      const running = pending.get(key)
      if (running !== undefined) return running
      const task = fetchMarketIndex(key, options)
        .then((index) => {
          documents.set(key, { at: Date.now(), index })
          return index
        })
        .finally(() => {
          pending.delete(key)
        })
      pending.set(key, task)
      return task
    },
  }
}

/** Run one git command, with a deadline and bounded output. */
function runGit(args: readonly string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      [...args],
      {
        cwd,
        timeout: 120_000,
        maxBuffer: 4 * 1024 * 1024,
        /* Git reads this machine's configuration but must never prompt. */
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          GIT_ASKPASS: "",
          SSH_ASKPASS: "",
          SSH_ASKPASS_REQUIRE: "never",
          LC_ALL: "C",
        },
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const output = `${String(stdout)}${String(stderr)}`.trim()
        if (error === null) {
          resolve(output)
          return
        }
        const timedOut = (error as { killed?: boolean }).killed === true
        reject(
          new Error(
            timedOut
              ? `git ${args[0] ?? ""} did not finish within 120s`
              : `git ${args[0] ?? ""} failed: ${output.split("\n").slice(-8).join("\n")}`
          )
        )
      }
    )
  })
}

/** Clone the repository's default branch into an empty directory. */
async function cloneBranch(work: string, url: string): Promise<void> {
  await runGit(
    [
      "-c",
      "core.autocrlf=false",
      "-c",
      "core.eol=lf",
      "-c",
      "core.symlinks=false",
      "clone",
      "--quiet",
      "--depth",
      "1",
      "--no-tags",
      "--",
      url,
      work,
    ],
    path.dirname(work)
  )
}

/** The directory one source names, refused when it leaves the checkout. */
function sourceAt(work: string, relative: string | undefined): string {
  if (relative === undefined) return work
  const at = path.resolve(work, ...relative.split("/"))
  const inside = path.relative(work, at)
  if (inside === "" || inside.startsWith("..") || path.isAbsolute(inside)) {
    throw new Error(`source path "${relative}" leaves the repository`)
  }
  return at
}

/** Refuse links and special files, and bound what a download may contain. */
async function assertRegularTree(dir: string): Promise<void> {
  let files = 0
  let bytes = 0
  const walk = async (at: string): Promise<void> => {
    for (const entry of await fs.readdir(at, { withFileTypes: true })) {
      if (SKIPPED_NAMES.has(entry.name)) continue
      const full = path.join(at, entry.name)
      if (entry.isSymbolicLink()) throw new Error(`extension contains a symbolic link: ${full}`)
      if (entry.isDirectory()) {
        await walk(full)
        continue
      }
      if (!entry.isFile()) throw new Error(`extension contains a non-file: ${full}`)
      files += 1
      bytes += (await fs.stat(full)).size
      if (files > FILE_LIMIT) throw new Error(`extension has more than ${String(FILE_LIMIT)} files`)
      if (bytes > BYTES_LIMIT) throw new Error("extension is larger than 64 MiB")
    }
  }
  await walk(dir)
}

/** The entry module must be a regular file inside the installed directory. */
async function assertEntry(staging: string, entry: string): Promise<void> {
  if (entry.startsWith("/") || entry.includes("\\")) {
    throw new Error(`extension entry "${entry}" must be a relative POSIX path`)
  }
  const segments = entry.split("/")
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error(`extension entry "${entry}" must be a relative POSIX path`)
  }
  const stat = await fs.stat(path.join(staging, ...segments)).catch(() => null)
  if (stat === null || !stat.isFile()) {
    throw new Error(`extension entry "${entry}" is missing`)
  }
}

/**
 * A market install requires the package declarations: the version and the
 * entry module have one source, and a package that does not declare them is
 * not one this installer can verify.
 */
async function readPackageAt(staging: string, id: string): Promise<PluginPackageFile> {
  const file = path.join(staging, "package.json")
  let raw: string
  try {
    raw = await fs.readFile(file, "utf8")
  } catch {
    throw new Error(`extension "${id}": package.json is missing`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    throw new Error(`extension "${id}": package.json is not JSON`)
  }
  return parsePluginPackage(parsed, id)
}

/** Whether the index and the manifest describe the same permissions. */
function samePermissions(
  indexed: ExtensionPermission[] | undefined,
  manifest: ExtensionPermission[] | undefined
): boolean {
  if (indexed === undefined) return true
  const left = new Set(indexed)
  const right = new Set(manifest ?? [])
  return left.size === right.size && [...left].every((item) => right.has(item))
}

/** The install record's source string, in the shape the agent plugin library uses. */
function sourceOf(source: MarketSource): string {
  if (isLocalMarketPath(source.url)) {
    const inside = source.path === undefined ? "" : `/${source.path}`
    return `local:${path.resolve(source.url)}${inside}`
  }
  const inside = source.path === undefined ? "" : `&path:/${source.path}`
  return `git+${source.url}${inside}`
}

/** Read the enablement document, keeping only booleans. */
async function readState(state: Pick<StateStore, "read">): Promise<Record<string, boolean>> {
  const value = await state.read("extensions").catch(() => null)
  if (typeof value !== "object" || value === null) return {}
  const found: Record<string, boolean> = {}
  for (const [key, on] of Object.entries(value)) {
    if (typeof on === "boolean") found[key] = on
  }
  return found
}

/** Move one directory, retrying the errors `atomic.ts` retries for files. */
async function moveWithRetry(rename: Rename, from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(from, to)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (attempt >= 3 || code === undefined || !RETRY_CODES.has(code)) throw error
      await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)))
    }
  }
}

/**
 * Replace one directory with another on the same volume.
 *
 * The old directory is moved aside first, so a failed second step can put it
 * back. A successful replacement removes the old copy; a failed rollback leaves
 * it at the returned `.old-*` path, which `list()` never reads.
 */
export async function replaceDirectory(options: {
  staging: string
  target: string
  rename?: Rename
}): Promise<void> {
  const rename = options.rename ?? fs.rename
  const old = `${options.target}.old-${randomUUID()}`
  const existed = (await fs.stat(options.target).catch(() => null)) !== null
  if (!existed) {
    await moveWithRetry(rename, options.staging, options.target)
    return
  }
  await moveWithRetry(rename, options.target, old)
  try {
    await moveWithRetry(rename, options.staging, options.target)
  } catch (error) {
    await moveWithRetry(rename, old, options.target).catch(() => undefined)
    throw new Error(
      `could not replace "${options.target}"; the previous files remain at "${old}": ${messageOf(error)}`,
      { cause: error }
    )
  }
  await fs.rm(old, { recursive: true, force: true }).catch(() => undefined)
}

/**
 * Fetch, verify and install one version of one extension.
 *
 * @param options — the store, state document, index source and the entry to install.
 * @returns what was installed and whether it is enabled.
 * @throws {Error} when the download, the manifest or the package declarations disagree.
 */
export async function installExtensionFromMarket(
  options: InstallDependencies
): Promise<InstallResult> {
  const id = assertPluginId(options.plugin.id)
  if (!isCompatible(options.version.engines, options.hubVersion)) {
    throw new Error(
      `extension "${id}" ${options.version.version} requires a different Context Hub version`
    )
  }
  const root = options.store.root
  const staging = path.join(root, `.staging-${randomUUID()}`)
  const work = await fs.mkdtemp(path.join(tmpdir(), "context-hub-extension-"))
  try {
    await fs.mkdir(staging, { recursive: true })
    const origin = options.version.source
    /* A local index names a checkout, and a checkout is what a developer is
       editing — including files not committed yet. Copying its working tree is
       the development path; a remote source is still cloned by default branch. */
    const local = isLocalMarketPath(origin.url)
    if (!local) await cloneBranch(work, origin.url)
    const source = sourceAt(local ? origin.url : work, origin.path)
    await assertRegularTree(source)
    await fs.cp(source, staging, {
      recursive: true,
      dereference: false,
      filter: (entry) => !SKIPPED_PATH.test(entry),
    })
    const manifest = parsePluginManifestYaml(
      await fs.readFile(path.join(staging, PLUGIN_MANIFEST), "utf8"),
      id
    )
    if (!isCompatible(manifest.engines, options.hubVersion)) {
      throw new Error(
        `extension "${id}": plugin.yaml does not support Context Hub ${options.hubVersion}`
      )
    }
    const pkg = await readPackageAt(staging, id)
    if (pkg.version !== options.version.version) {
      throw new Error(
        `extension "${id}": the index lists ${options.version.version}, package.json says ${pkg.version}`
      )
    }
    if (!samePermissions(options.plugin.permissions, manifest.permissions)) {
      throw new Error(
        `extension "${id}": the index and the manifest declare different permissions`
      )
    }
    await assertEntry(staging, pkg.entry)

    const target = path.join(root, id)
    const fresh = (await fs.stat(target).catch(() => null)) === null
    await replaceDirectory({ staging, target, rename: options.rename })

    let warning: string | undefined
    const record: PluginRecord = {
      version: pkg.version,
      source: sourceOf(options.version.source),
      installedAt: new Date().toISOString(),
    }
    try {
      await options.store.setRecord(id, record)
    } catch (error) {
      warning = `installed, but the record could not be written: ${messageOf(error)}`
    }

    let enabled = false
    if (fresh) {
      try {
        const stored = await readState(options.state)
        await options.state.write("extensions", { ...stored, [id]: true })
        enabled = true
      } catch {
        /* The files are installed; the switch remains off until the user sets it. */
      }
    } else {
      const stored = await readState(options.state).catch(
        (): Record<string, boolean> => ({})
      )
      enabled = stored[id] ?? manifest.defaultEnabled ?? false
    }
    return {
      id,
      version: pkg.version,
      enabled,
      fresh,
      ...(warning === undefined ? {} : { warning }),
    }
  } finally {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined)
    await fs.rm(work, { recursive: true, force: true }).catch(() => undefined)
  }
}

/**
 * Remove one installed extension and its enablement key.
 *
 * @param options — the store, state document and plugin id.
 * @throws {Error} when the id is not installed.
 */
export async function removeInstalledExtension(options: {
  store: Pick<PluginStore, "list" | "remove">
  state: Pick<StateStore, "read" | "write">
  id: string
}): Promise<void> {
  const id = assertPluginId(options.id)
  const installed = await options.store.list()
  if (!installed.includes(id)) throw new Error(`extension "${id}" is not installed`)
  await options.store.remove(id)
  const stored = await readState(options.state).catch(
    (): Record<string, boolean> => ({})
  )
  if (stored[id] === undefined) return
  delete stored[id]
  await options.state.write("extensions", stored).catch(() => undefined)
}
