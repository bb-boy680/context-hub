/**
 * Behaviour of reading a source the skills CLI recorded into something `git`
 * can ask, and of the one remote question an update check makes.
 *
 * The remote here is a repository on this machine reached through a `file://`
 * URL, so the whole path — parsing, `git ls-remote`, exact ref matching — runs
 * without a network. `git` must be on PATH.
 */
import { execFile, type ExecFileOptions } from "node:child_process"
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { promisify } from "node:util"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  parseGitSource,
  parseRemoteRevision,
  readRemoteRevision,
} from "../src/host/git-source.ts"

const run = promisify(execFile)

let repo: string
let mainHead: string
let devHead: string
let url: string

async function git(args: string[], options: ExecFileOptions = {}): Promise<string> {
  const { stdout } = await run("git", args, { cwd: repo, ...options })
  return String(stdout).trim()
}

beforeAll(async () => {
  repo = await fs.mkdtemp(path.join(tmpdir(), "context-hub-git-source-"))
  await git(["init", "-q", "-b", "main"])
  await fs.writeFile(path.join(repo, "SKILL.md"), "# Fixture\n")
  await git(["add", "-A"])
  await git([
    "-c",
    "user.email=check@localhost",
    "-c",
    "user.name=check",
    "commit",
    "-q",
    "-m",
    "first",
  ])
  mainHead = await git(["rev-parse", "HEAD"])

  await git(["checkout", "-q", "-b", "dev"])
  await fs.writeFile(path.join(repo, "SKILL.md"), "# Fixture, second revision\n")
  await git(["add", "-A"])
  await git([
    "-c",
    "user.email=check@localhost",
    "-c",
    "user.name=check",
    "commit",
    "-q",
    "-m",
    "second",
  ])
  devHead = await git(["rev-parse", "HEAD"])
  await git(["checkout", "-q", "main"])

  url = pathToFileURL(repo).href
})

afterAll(async () => {
  await fs.rm(repo, { recursive: true, force: true })
})

describe("reading a recorded source", () => {
  it("expands the owner/repo shorthand to a repository URL", () => {
    expect(parseGitSource("mattpocock/skills")).toEqual({
      url: "https://github.com/mattpocock/skills",
    })
  })

  it("keeps a repository URL as it was written", () => {
    expect(parseGitSource("https://github.com/mattpocock/skills")).toEqual({
      url: "https://github.com/mattpocock/skills",
    })
    expect(parseGitSource("https://github.com/mattpocock/skills.git")).toEqual({
      url: "https://github.com/mattpocock/skills.git",
    })
    expect(parseGitSource("https://gitlab.com/owner/repo")).toEqual({
      url: "https://gitlab.com/owner/repo",
    })
  })

  it("splits the ref out of a tree URL", () => {
    expect(parseGitSource("https://github.com/owner/repo/tree/main")).toEqual({
      url: "https://github.com/owner/repo",
      ref: "main",
    })
    expect(
      parseGitSource("https://github.com/owner/repo/tree/main/skills/one/SKILL.md")
    ).toEqual({ url: "https://github.com/owner/repo", ref: "main" })
  })

  it("keeps addresses git already understands whole", () => {
    for (const source of [
      "git@github.com:owner/repo.git",
      "ssh://git@github.com/owner/repo.git",
      "git://github.com/owner/repo.git",
      "file:///D:/work-space/repo",
      "C:\\work-space\\repo",
      "/work-space/repo",
    ]) {
      expect(parseGitSource(source)).toEqual({ url: source })
    }
  })

  it("refuses what it cannot ask rather than guessing", () => {
    for (const source of [
      "",
      "not a source",
      "https://example.com/download.zip",
      "https://github.com/owner/repo/extra",
      /* `#ref` treatment by the CLI is not established here. */
      "https://github.com/owner/repo#main",
    ]) {
      expect(parseGitSource(source), source).toBeNull()
    }
  })
})

describe("reading a revision out of ls-remote output", () => {
  /* A repository that knows an origin advertises both lines; the order belongs
     to the remote, so only the exact ref name may be taken. */
  const output = [
    `${"a".repeat(40)}\trefs/remotes/origin/HEAD`,
    `${"b".repeat(40)}\tHEAD`,
    `${"c".repeat(40)}\trefs/heads/main`,
  ].join("\n")

  it("takes HEAD only when HEAD is what was asked for", () => {
    expect(parseRemoteRevision(output)).toBe("b".repeat(40))
  })

  it("takes the named branch exactly", () => {
    expect(parseRemoteRevision(output, "main")).toBe("c".repeat(40))
    expect(parseRemoteRevision(output, "dev")).toBeNull()
  })

  it("refuses an answer that is not a commit", () => {
    expect(parseRemoteRevision("not-a-sha\tHEAD")).toBeNull()
    expect(parseRemoteRevision("")).toBeNull()
  })
})

describe("asking a remote for its revision", () => {
  it("reads the default branch without cloning anything", async () => {
    expect(await readRemoteRevision({ url })).toBe(mainHead)
  })

  it("reads the branch the source names", async () => {
    expect(await readRemoteRevision({ url, ref: "dev" })).toBe(devHead)
  })

  it("names a ref the remote does not have", async () => {
    await expect(readRemoteRevision({ url, ref: "missing" })).rejects.toThrow(
      /has no refs\/heads\/missing/
    )
  })
})
