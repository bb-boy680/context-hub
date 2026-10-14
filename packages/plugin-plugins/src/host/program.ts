/**
 * Running one console program for an installer.
 *
 * This is the host half of {@link PluginTools}: it knows how to start a program,
 * hand it arguments, bound how long it may run and return what it printed. It
 * knows nothing about which program or which arguments — that is the agent
 * plugin's business, and keeping it out of here is what lets an agent be added
 * as a plugin.
 *
 * Arguments travel as a list and are quoted here, so a path with a space stays
 * one argument and nothing a person typed reaches a shell unquoted. The clients
 * ship as scripts on Windows, which is why a shell is asked to start them at
 * all.
 *
 * This module runs in the process that owns the machine, and is the only place
 * in this package that starts a subprocess.
 */
import { execFile } from "node:child_process"

/** How long one program may take. */
const PROGRAM_TIMEOUT_MS = 120_000

/** One argument as a shell word. */
function quote(argument: string): string {
  if (/^[A-Za-z0-9_@./:=+-]+$/.test(argument)) return argument
  /* A Windows command line has no single-quote form, so it always doubles. */
  return `"${argument.replace(/(["\\$`])/g, "\\$1")}"`
}

/** What one program run printed, and how it ended. */
export interface ProgramResult {
  output: string
  exitCode: number
}

/**
 * Run one program with structured arguments.
 *
 * @param program — the executable's name, resolved on `PATH`.
 * @param args — its arguments, in order; each is passed as one word.
 * @returns what it printed on standard output, and how it ended.
 */
export function runProgram(program: string, args: readonly string[]): Promise<ProgramResult> {
  const line = [program, ...args].map(quote).join(" ")
  return new Promise((resolve) => {
    execFile(
      line,
      {
        timeout: PROGRAM_TIMEOUT_MS,
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true,
        shell: true,
      },
      (error, stdout, stderr) => {
        const output = `${String(stdout)}`.trim()
        const voice = `${String(stdout)}${String(stderr)}`.trim()
        if (error === null) {
          resolve({ output, exitCode: 0 })
          return
        }
        const code = typeof error.code === "number" ? error.code : 1
        resolve({
          output: output === "" ? voice : output,
          exitCode: code,
        })
      }
    )
  })
}

/**
 * Whether a program is on this machine.
 *
 * @param program — the executable's name.
 * @returns true when the platform's own lookup finds it.
 */
export function hasProgram(program: string): Promise<boolean> {
  const finder = process.platform === "win32" ? "where" : "which"
  return new Promise((resolve) => {
    execFile(finder, [program], { windowsHide: true }, (error) => resolve(error === null))
  })
}
