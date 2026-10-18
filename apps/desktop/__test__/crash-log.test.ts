import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  appendTail,
  crashLogName,
  pruneCrashLogs,
  tailOf,
  writeCrashLog,
} from "../src/crash-log.ts"

const directories: string[] = []

function temporaryDirectory(): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), "hub-crash-"))
  directories.push(directory)
  return directory
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe("crashLogName", () => {
  it("keeps a readable, ordered name", () => {
    expect(crashLogName("server stderr", new Date("2026-10-18T12:34:56.789Z"))).toBe(
      "crash-2026-10-18T12-34-56-789Z-server-stderr.log"
    )
  })
})

describe("writeCrashLog", () => {
  it("records the error and the server tail", () => {
    const directory = temporaryDirectory()
    const file = writeCrashLog({
      dir: directory,
      source: "server",
      error: new Error("boom"),
      version: "1.2.3",
      platform: "win32",
      arch: "x64",
      packaged: true,
      stderrTail: "last line before the exit",
    })
    expect(file).not.toBeNull()
    const body = readFileSync(file as string, "utf8")
    expect(body).toContain("source: server")
    expect(body).toContain("version: 1.2.3")
    expect(body).toContain("platform: win32")
    expect(body).toContain("arch: x64")
    expect(body).toContain("packaged: true")
    expect(body).toContain("message: boom")
    expect(body).toContain("stack:")
    expect(body).toContain("last line before the exit")
    expect(path.basename(file as string)).toMatch(/^crash-.*-server\.log$/)
  })
})

describe("tails", () => {
  it("keeps only the last bytes", () => {
    expect(tailOf("x".repeat(100), 10)).toHaveLength(10)
    expect(appendTail("abc", "def", 4)).toBe("cdef")
  })
})

describe("pruneCrashLogs", () => {
  it("keeps the newest ten and leaves unrelated files alone", () => {
    const directory = temporaryDirectory()
    mkdirSync(path.join(directory, "nested"))
    writeFileSync(path.join(directory, "keep.txt"), "keep")
    for (let index = 0; index < 12; index += 1) {
      const hour = String(index).padStart(2, "0")
      writeFileSync(
        path.join(directory, `crash-2026-10-18T${hour}-00-00-000Z-s${index}.log`),
        String(index)
      )
    }

    pruneCrashLogs(directory, 10)

    const names = readdirSync(directory)
    const logs = names.filter((name) => /^crash-.*\.log$/.test(name))
    expect(logs).toHaveLength(10)
    expect(logs).not.toContain("crash-2026-10-18T00-00-00-000Z-s0.log")
    expect(logs).not.toContain("crash-2026-10-18T01-00-00-000Z-s1.log")
    expect(logs).toContain("crash-2026-10-18T11-00-00-000Z-s11.log")
    expect(names).toContain("keep.txt")
    expect(names).toContain("nested")
  })
})
