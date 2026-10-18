/**
 * How the skills CLI is reached. Node's own npx is preferred, but a compiled
 * hub binary and Electron are not Node: there the only path left is the `npx`
 * on PATH, which is a `.cmd` on Windows and needs `cmd.exe` to start.
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { dropWork, npxInvocation } from "../src/host/skills-cli.ts"

describe("npxInvocation", () => {
  it("runs npm's own npx through the current Node when it is there", () => {
    const one = npxInvocation(["skills", "--version"], {
      platform: "linux",
      execPath: "/opt/node/bin/node",
      exists: (file) => file.endsWith("npx-cli.js"),
    })
    expect(one.file).toBe("/opt/node/bin/node")
    expect(one.argv[0]).toMatch(/npx-cli\.js$/)
    expect(one.argv.slice(1)).toEqual(["skills", "--version"])
  })

  it("falls back to npx on PATH where a shell resolves it", () => {
    const one = npxInvocation(["skills"], {
      platform: "linux",
      execPath: "/apps/context-hub",
      exists: () => false,
    })
    expect(one).toEqual({ file: "npx", argv: ["skills"] })
  })

  it("falls back through cmd.exe on Windows", () => {
    const one = npxInvocation(["skills"], {
      platform: "win32",
      execPath: "C:\\apps\\context-hub.exe",
      comspec: "C:\\Windows\\System32\\cmd.exe",
      exists: () => false,
    })
    expect(one).toEqual({
      file: "C:\\Windows\\System32\\cmd.exe",
      argv: ["/d", "/s", "/c", "npx", "skills"],
    })
  })

  it("names cmd.exe when ComSpec is absent", () => {
    const one = npxInvocation([], {
      platform: "win32",
      execPath: "C:\\apps\\context-hub.exe",
      exists: () => false,
    })
    expect(one.file).toBe(process.env.ComSpec ?? "cmd.exe")
  })
})

describe("dropWork", () => {
  /* Windows holds a handle on an open file, so the first removal answers
     EBUSY; the helper waits it out, and a directory that stays locked must
     not turn a finished install into an error. */
  it("removes a throwaway directory even when a handle delays it", async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), "context-hub-drop-"))
    const file = path.join(dir, "held.txt")
    await fs.writeFile(file, "x", "utf8")

    const held = await fs.open(file, "r")
    await expect(dropWork(dir)).resolves.toBeUndefined()
    await held.close()

    await dropWork(dir)
    expect(await fs.stat(dir).catch(() => null)).toBeNull()
  })
})
