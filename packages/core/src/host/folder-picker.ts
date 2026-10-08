/**
 * The host's folder picker: one native dialog, so the process that owns the
 * disk can ask a person for a folder and get an absolute path back. Each
 * platform is asked its own way, and the prompt travels as data — it is
 * localized text that may contain quotes, so it is never spliced into a
 * command line that a shell would re-parse.
 */
import { execFile } from "node:child_process"

/** The result of one dialog process. */
interface Run {
  code: number | null
  stdout: string
  stderr: string
}

function run(command: string, args: string[]): Promise<Run> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 },
      (error, stdout, stderr) => {
        const code = error === null ? 0 : ((error as { code?: number }).code ?? null)
        if (error !== null && code === null) {
          /* The command never ran: a missing platform tool is a real failure. */
          reject(new Error(`${command}: ${error.message}`))
          return
        }
        resolve({ code, stdout, stderr })
      }
    )
  })
}

/**
 * Read one dialog's outcome.
 *
 * @param result — what the dialog process left behind.
 * @param cancel — how this platform reports a cancelled dialog: an empty result, or exit code 1.
 * @returns the chosen folder, or `null` when the dialog was cancelled.
 */
function taken(result: Run, cancel: "empty" | "exit-1"): string | null {
  const chosen = result.stdout.trim()
  if (chosen !== "") return chosen
  if (cancel === "exit-1" && result.code === 1) return null
  if (result.code === 0) return null
  const detail = result.stderr.trim()
  throw new Error(detail === "" ? `folder picker exited with ${String(result.code)}` : detail)
}

/** The Windows dialog script; the prompt is single-quoted, so its own quotes double. */
function windowsScript(prompt: string): string {
  return [
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "Add-Type -AssemblyName System.Windows.Forms",
    "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
    `$dialog.Description = '${prompt.replaceAll("'", "''")}'`,
    "$dialog.ShowNewFolderButton = $true",
    "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.SelectedPath }",
  ].join("; ")
}

async function pickWindows(prompt: string): Promise<string | null> {
  /* Base64 UTF-16LE is the one encoding PowerShell reads verbatim: quoting,
     escaping, and the console code page cannot change what it runs. */
  const encoded = Buffer.from(windowsScript(prompt), "utf16le").toString("base64")
  return taken(await run("powershell.exe", ["-NoProfile", "-STA", "-EncodedCommand", encoded]), "empty")
}

async function pickMac(prompt: string): Promise<string | null> {
  const quoted = prompt.replaceAll("\\", "\\\\").replaceAll('"', '\\"')
  const script = [
    "try",
    `  POSIX path of (choose folder with prompt "${quoted}")`,
    "on error",
    '  ""',
    "end try",
  ].join("\n")
  return taken(await run("osascript", ["-e", script]), "empty")
}

async function pickLinux(prompt: string): Promise<string | null> {
  return taken(
    await run("zenity", ["--file-selection", "--directory", `--title=${prompt}`]),
    "exit-1"
  )
}

/**
 * Ask a person for a folder.
 *
 * @param prompt — the text the folder dialog shows.
 * @returns the folder's absolute path, or `null` when the dialog was cancelled.
 */
export async function pickFolder(prompt: string): Promise<string | null> {
  if (process.platform === "win32") return pickWindows(prompt)
  if (process.platform === "darwin") return pickMac(prompt)
  if (process.platform === "linux") return pickLinux(prompt)
  throw new Error(`this platform has no folder dialog: ${process.platform}`)
}
