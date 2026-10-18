/**
 * The machine's environment, as far as this hub writes to it.
 *
 * A value lives in the system, not in the hub's own file. What "the system"
 * means differs by platform, so this is the one place that knows how:
 *
 * - **Windows** writes the user environment through PowerShell
 *   (`[Environment]::SetEnvironmentVariable(..., 'User')`), which is the same
 *   store `$env:NAME` shows in a new shell. The running hub process is updated
 *   directly so the page sees the value before a restart.
 * - **macOS / Linux** writes `~/.config/context-hub/env` and makes sure the
 *   user's shell profile sources it. The hub also reads that file into its own
 *   process at startup, so a form launched from a GUI still sees the values.
 *
 * The POSIX branch covers the POSIX shells (sh, bash, zsh). A fish profile is
 * not sourced by the same syntax and is refused rather than written wrongly.
 */
import { execFile } from "node:child_process"
import { promises as fs } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"

import { writeFileAtomic } from "@context-hub/core/host/atomic"

const run = promisify(execFile)

/** The marker that says a profile already sources the managed file. */
const MARKER = "# context-hub environment"

/** Where the managed POSIX file lives, relative to the user's home. */
const MANAGED_DIR = path.join(".config", "context-hub")
const MANAGED_FILE = "env"

/** Reading and writing the machine environment. */
export interface EnvironmentPort {
  /** The value this process sees right now, or undefined when it is not set. */
  get(name: string): string | undefined
  /** Persist a value for new processes, and make it visible to this one. */
  set(name: string, value: string): Promise<void>
  /** Remove a value from the persistent environment and from this process. */
  remove(name: string): Promise<void>
  /** Load what an earlier run persisted into this process, once. */
  ready(): Promise<void>
}

/** Options for the platform adapter; tests pass a temporary home and shell. */
export interface EnvironmentOptions {
  platform?: NodeJS.Platform
  /** The user's home; defaults to the real one. */
  home?: string
  /** The login shell used to choose a profile; defaults to `$SHELL`. */
  shell?: string
}

/** A name is already validated by the store; this only guards the shell form. */
export function escapeShell(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** Read the managed file's `export NAME='value'` lines. */
function parseManaged(text: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^export ([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (match === null) continue
    const name = match[1] as string
    const raw = match[2] as string
    const value =
      raw.startsWith("'") && raw.endsWith("'")
        ? raw.slice(1, -1).replaceAll(`'\\''`, "'")
        : raw
    found.set(name, value)
  }
  return found
}

/** The profile a POSIX shell reads, or a refusal for one this cannot edit. */
function profileOf(home: string, shell: string): string {
  const name = path.basename(shell)
  if (name === "zsh") return path.join(home, ".zshrc")
  if (name === "bash") return path.join(home, ".bashrc")
  if (name === "fish") {
    throw new Error(
      "fish profiles are not supported yet; add the context-hub env file to config.fish by hand"
    )
  }
  return path.join(home, ".profile")
}

/** Make sure the profile sources the managed file, once. */
async function ensureSourced(home: string, shell: string): Promise<void> {
  const profile = profileOf(home, shell)
  let text = ""
  try {
    text = await fs.readFile(profile, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  if (text.includes(MARKER)) return

  const lead = text === "" || text.endsWith("\n") ? "" : "\n"
  const block = `${lead}\n${MARKER}\n[ -f "$HOME/.config/context-hub/env" ] && . "$HOME/.config/context-hub/env"\n`
  await fs.writeFile(profile, `${text}${block}`, { mode: 0o600 })
}

/** The POSIX branch: a managed env file, sourced from the login shell. */
function createPosixEnvironment(options: EnvironmentOptions): EnvironmentPort {
  const home = options.home ?? homedir()
  const shell = options.shell ?? process.env.SHELL ?? "/bin/sh"
  const file = path.join(home, MANAGED_DIR, MANAGED_FILE)
  let loaded = false
  let values: Map<string, string> | null = null

  const readFile = async (): Promise<Map<string, string>> => {
    if (values !== null) return values
    try {
      values = parseManaged(await fs.readFile(file, "utf8"))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      values = new Map()
    }
    return values
  }

  const writeFile = async (next: Map<string, string>): Promise<void> => {
    await fs.mkdir(path.dirname(file), { recursive: true })
    const text =
      [...next]
        .map(([name, value]) => `export ${name}=${escapeShell(value)}`)
        .join("\n") + "\n"
    await writeFileAtomic(file, text)
    await fs.chmod(file, 0o600)
    values = next
  }

  return {
    get: (name) => process.env[name],

    async ready() {
      if (loaded) return
      const found = await readFile()
      loaded = true
      for (const [name, value] of found) {
        if (process.env[name] === undefined) process.env[name] = value
      }
    },

    async set(name, value) {
      if (value.includes("\0")) throw new Error("a value cannot contain NUL")
      const current = await readFile()
      const next = new Map(current)
      next.set(name, value)
      await writeFile(next)
      await ensureSourced(home, shell)
      process.env[name] = value
    },

    async remove(name) {
      const current = await readFile()
      if (!current.has(name)) return
      const next = new Map(current)
      next.delete(name)
      await writeFile(next)
      delete process.env[name]
    },
  }
}

/** The Windows branch: the user environment, through PowerShell's own API. */
function createWindowsEnvironment(): EnvironmentPort {
  const powershell =
    process.env.SystemRoot === undefined
      ? "powershell.exe"
      : path.join(
          process.env.SystemRoot,
          "System32",
          "WindowsPowerShell",
          "v1.0",
          "powershell.exe"
        )

  /* The user environment as the registry holds it. Reading it here rather than
     from `process.env` is what makes a hub restart enough: a shell that was
     already open when the variable was written still carries the old
     environment, and so would every child it starts. */
  let values: Map<string, string> | null = null
  let loaded = false

  const load = async (): Promise<void> => {
    if (loaded) return
    loaded = true
    try {
      const { stdout } = await run(
        powershell,
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "[Console]::OutputEncoding=[Text.Encoding]::UTF8; [Environment]::GetEnvironmentVariables('User') | ConvertTo-Json -Compress",
        ],
        { windowsHide: true }
      )
      const text = (stdout.charCodeAt(0) === 0xfeff ? stdout.slice(1) : stdout).trim()
      const parsed = (text === "" ? {} : JSON.parse(text)) as Record<string, unknown>
      values = new Map(
        Object.entries(parsed).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string"
        )
      )
      for (const [name, value] of values) {
        if (process.env[name] === undefined) process.env[name] = value
      }
    } catch {
      /* A machine where the registry cannot be read falls back to what the
         process already has, which is the behaviour this module had before. */
      values = new Map(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string"
        )
      )
    }
  }

  /** Windows names are case-insensitive; the document's spelling need not match. */
  const find = (name: string): string | undefined => {
    if (values === null) return undefined
    const exact = values.get(name)
    if (exact !== undefined) return exact
    const lower = name.toLowerCase()
    for (const [key, value] of values) {
      if (key.toLowerCase() === lower) return value
    }
    return undefined
  }

  const write = async (name: string, value: string): Promise<void> => {
    await run(
      powershell,
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "[Environment]::SetEnvironmentVariable($env:CH_NAME,$env:CH_VALUE,'User')",
      ],
      {
        windowsHide: true,
        env: {
          ...process.env,
          CH_NAME: name,
          CH_VALUE: value,
        },
      }
    )
  }

  return {
    get: (name) => find(name) ?? process.env[name],
    ready: load,

    async set(name, value) {
      if (value.includes("\0")) throw new Error("a value cannot contain NUL")
      await write(name, value)
      if (values !== null) {
        for (const key of [...values.keys()]) {
          if (key.toLowerCase() === name.toLowerCase()) values.delete(key)
        }
        values.set(name, value)
      }
      process.env[name] = value
    },

    async remove(name) {
      await run(
        powershell,
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "[Environment]::SetEnvironmentVariable($env:CH_NAME,$null,'User')",
        ],
        {
          windowsHide: true,
          env: { ...process.env, CH_NAME: name },
        }
      )
      if (values !== null) {
        for (const key of [...values.keys()]) {
          if (key.toLowerCase() === name.toLowerCase()) values.delete(key)
        }
      }
      delete process.env[name]
    },
  }
}

/** The adapter for this machine, or the one the options name. */
export function createEnvironment(options: EnvironmentOptions = {}): EnvironmentPort {
  const platform = options.platform ?? process.platform
  return platform === "win32"
    ? createWindowsEnvironment()
    : createPosixEnvironment(options)
}
