/**
 * Turning the source a skill was installed from into something `git` can be
 * asked about.
 *
 * The skills CLI records `owner/repo` or a URL in its lock, never the commit it
 * installed. A later check only needs the remote's current commit, which
 * `git ls-remote` reads without downloading any objects — the same question the
 * plugin library asks its sources with.
 *
 * This module runs in the process that owns the disk.
 *
 * shortcut: this repeats the `ls-remote` call in
 * `plugins/src/host/{probe,fetch}.ts`; move the primitive to
 * `@context-hub/core` when one of those is next touched.
 */
import { execFile } from "node:child_process"
import { tmpdir } from "node:os"

/** A remote and the ref to ask about; an absent ref means the default branch. */
export interface GitTarget {
  url: string
  ref?: string
}

/** How long one question to a remote may take. */
const ASK_TIMEOUT_MS = 30_000

/** A commit sha, short or full. */
const SHA = /^[0-9a-f]{7,64}$/i

/** The `owner/repo` shorthand a repository page hands out. */
const SHORTHAND = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/

/** A path that names where it is, rather than where the caller stands. */
const ABSOLUTE = /^(?:[A-Za-z]:[\\/]|\/|\\\\)/

/** `https://github.com/<owner>/<repo>[/.git]/tree/<ref>[/...]`, the form a tree page uses. */
const TREE_URL =
  /^https?:\/\/github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/tree\/([^/]+)(?:\/.*)?$/i

/** Whether a URL path is exactly two repository-shaped segments. */
function isRepositoryPath(pathname: string): boolean {
  const segments = pathname.replace(/^\/+|\/+$/g, "").split("/")
  if (segments.length !== 2) return false
  return segments.every((segment) => /^[A-Za-z0-9._-]+$/.test(segment.replace(/\.git$/i, "")))
}

/**
 * Read the source the CLI recorded into a remote and a ref.
 *
 * A `#ref` fragment is deliberately not parsed: the CLI's own treatment of it
 * has not been established here, and asking the wrong ref would report a
 * revision the files did not come from. Such a source is refused instead.
 *
 * @param source — the `source` field of a `skills-lock.json` entry.
 * @returns what `git ls-remote` can ask, or `null` when it is not a repository.
 */
export function parseGitSource(source: string): GitTarget | null {
  const raw = source.trim()
  if (raw === "") return null

  const tree = TREE_URL.exec(raw)
  if (tree !== null) {
    const [, owner, repo, ref] = tree
    if (owner !== undefined && repo !== undefined && ref !== undefined) {
      return { url: `https://github.com/${owner}/${repo}`, ref: decodeURIComponent(ref) }
    }
  }

  if (SHORTHAND.test(raw)) return { url: `https://github.com/${raw}` }

  if (
    /^(?:git|ssh):\/\//i.test(raw) ||
    /^file:\/\//i.test(raw) ||
    /^[^@\s]+@[^:\s]+:.+/.test(raw)
  ) {
    return { url: raw }
  }
  if (ABSOLUTE.test(raw)) return { url: raw }

  if (/^https?:\/\//i.test(raw)) {
    /* A fragment is a ref in the inventor's head, not in `git ls-remote`. */
    if (raw.includes("#")) return null
    let url: URL
    try {
      url = new URL(raw)
    } catch {
      return null
    }
    return isRepositoryPath(url.pathname) ? { url: raw } : null
  }

  return null
}

/**
 * Pick the commit for one ref out of `git ls-remote` output.
 *
 * The second column is matched exactly: a local repository advertises both
 * `HEAD` and `refs/remotes/origin/HEAD`, and taking the first line would depend
 * on the order the remote happens to print.
 *
 * @param output — stdout of `git ls-remote`.
 * @param ref — the branch asked for; absent means `HEAD`.
 * @returns the commit, or `null` when the output names that ref nowhere.
 */
export function parseRemoteRevision(output: string, ref?: string): string | null {
  const wanted = ref === undefined ? "HEAD" : `refs/heads/${ref}`
  for (const line of output.split("\n")) {
    const [sha, name] = line.trim().split(/\s+/)
    if (sha === undefined || name === undefined) continue
    if (name !== wanted) continue
    return SHA.test(sha) ? sha : null
  }
  return null
}

/**
 * Ask a remote for the commit one ref points at.
 *
 * @param target — the remote, already parsed.
 * @returns the commit sha.
 * @throws when git is missing, the remote cannot be reached, or it has no such ref.
 */
export function readRemoteRevision(target: GitTarget): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["ls-remote", "--", target.url, target.ref ?? "HEAD"],
      {
        cwd: tmpdir(),
        timeout: ASK_TIMEOUT_MS,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
        env: {
          ...process.env,
          /* A credential dialog has nobody to answer it. */
          GIT_TERMINAL_PROMPT: "0",
          GIT_ASKPASS: "",
          SSH_ASKPASS: "",
          SSH_ASKPASS_REQUIRE: "never",
          LC_ALL: "C",
        },
      },
      (error, stdout, stderr) => {
        if (error !== null) {
          if ((error as { code?: string }).code === "ENOENT") {
            reject(new Error("git is not on PATH; update checks need git installed"))
            return
          }
          if ((error as { killed?: boolean }).killed === true) {
            reject(
              new Error(
                `git ls-remote did not finish in ${String(ASK_TIMEOUT_MS / 1000)}s for ${target.url}`
              )
            )
            return
          }
          const detail = `${String(stdout)}${String(stderr)}`
            .trim()
            .split("\n")
            .slice(-1)[0]
          reject(
            new Error(
              `git ls-remote failed for ${target.url}${detail === undefined || detail === "" ? "" : `: ${detail}`}`
            )
          )
          return
        }
        const revision = parseRemoteRevision(String(stdout), target.ref)
        if (revision === null) {
          const wanted = target.ref === undefined ? "HEAD" : `refs/heads/${target.ref}`
          reject(new Error(`${target.url} has no ${wanted}`))
          return
        }
        resolve(revision)
      }
    )
  })
}
