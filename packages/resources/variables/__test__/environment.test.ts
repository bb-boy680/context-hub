import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createEnvironment, escapeShell } from "../src/host/environment.ts"

let home: string
const NAME = "CONTEXT_HUB_ENV_ADAPTER_TEST"

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-env-"))
  delete process.env[NAME]
})

afterEach(async () => {
  delete process.env[NAME]
  await fs.rm(home, { recursive: true, force: true })
})

describe("the POSIX environment adapter", () => {
  it("quotes a value as one shell word", () => {
    expect(escapeShell("a'b")).toBe("'a'\\''b'")
  })

  it("writes the managed file, sources it once, and updates this process", async () => {
    const environment = createEnvironment({
      platform: "linux",
      home,
      shell: "/bin/bash",
    })
    await environment.set(NAME, "first'value")

    expect(process.env[NAME]).toBe("first'value")
    const file = path.join(home, ".config", "context-hub", "env")
    expect(await fs.readFile(file, "utf8")).toContain(
      `export ${NAME}='first'\\''value'`
    )
    const profile = await fs.readFile(path.join(home, ".bashrc"), "utf8")
    expect(profile).toContain("# context-hub environment")

    await environment.set(NAME, "second")
    expect(process.env[NAME]).toBe("second")

    await environment.remove(NAME)
    expect(process.env[NAME]).toBeUndefined()
    expect(await fs.readFile(file, "utf8")).not.toContain(NAME)
  })

  it("loads the managed file into this process, without overriding it", async () => {
    const file = path.join(home, ".config", "context-hub", "env")
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, `export ${NAME}='from-file'\n`)

    process.env[NAME] = "from-process"
    const environment = createEnvironment({
      platform: "linux",
      home,
      shell: "/bin/bash",
    })
    await environment.ready()
    expect(process.env[NAME]).toBe("from-process")

    delete process.env[NAME]
    const fresh = createEnvironment({ platform: "linux", home, shell: "/bin/bash" })
    await fresh.ready()
    expect(process.env[NAME]).toBe("from-file")
  })
})
