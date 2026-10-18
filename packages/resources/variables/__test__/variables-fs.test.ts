import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { EnvironmentPort } from "../src/host/environment.ts"
import { createFsVariableStore, variablesPath } from "../src/host/variables-fs.ts"

let home: string

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-variables-"))
})

afterEach(async () => {
  await fs.rm(home, { recursive: true, force: true })
})

/** An environment the tests own, so nothing touches the real machine. */
interface MemoryEnvironment extends EnvironmentPort {
  values: Map<string, string>
}

function memoryEnvironment(initial: Record<string, string> = {}): MemoryEnvironment {
  const values = new Map(Object.entries(initial))
  return {
    values,
    get: (name) => values.get(name),
    set: async (name, value) => {
      values.set(name, value)
    },
    remove: async (name) => {
      values.delete(name)
    },
    ready: async () => undefined,
  }
}

/** The document as it is written; values are not part of it. */
async function rawDocument(): Promise<{
  version: number
  groups: string[]
  variables: Record<string, unknown>[]
}> {
  return JSON.parse(await fs.readFile(variablesPath(home), "utf8")) as {
    version: number
    groups: string[]
    variables: Record<string, unknown>[]
  }
}

describe("the variable library", () => {
  it("writes names and groups to the file and values to the environment", async () => {
    const environment = memoryEnvironment()
    const store = createFsVariableStore({ home, environment })
    await store.create([
      { name: "ANTHROPIC_API_KEY", group: "通用", value: "sk-test" },
      { name: "AWS_REGION", value: "us-east-1" },
    ])

    const document = await rawDocument()
    expect(document.version).toBe(1)
    expect(document.variables.map((row) => row.name)).toEqual([
      "ANTHROPIC_API_KEY",
      "AWS_REGION",
    ])
    expect(document.variables[0]).not.toHaveProperty("value")
    expect(document.variables[1]?.group).toBe("通用")
    expect(document.groups).toContain("通用")

    expect(environment.values.get("ANTHROPIC_API_KEY")).toBe("sk-test")
    expect(environment.values.get("AWS_REGION")).toBe("us-east-1")

    const shown = await store.read()
    expect(shown.variables.find((row) => row.name === "AWS_REGION")?.value).toBe(
      "us-east-1"
    )
  })

  it("refuses the same name twice, including inside one batch", async () => {
    const environment = memoryEnvironment()
    const store = createFsVariableStore({ home, environment })
    await store.create([{ name: "TOKEN", value: "one" }])

    await expect(store.create([{ name: "TOKEN", value: "two" }])).rejects.toThrow(
      /already exists/
    )
    await expect(
      store.create([{ name: "OTHER", value: "1" }, { name: "OTHER", value: "2" }])
    ).rejects.toThrow(/already exists/)
  })

  it("refuses a name that is not shell-safe", async () => {
    const environment = memoryEnvironment()
    const store = createFsVariableStore({ home, environment })
    await expect(store.create([{ name: "1TOKEN", value: "x" }])).rejects.toThrow(
      /invalid variable name/
    )
    await expect(store.create([{ name: "A-B", value: "x" }])).rejects.toThrow(
      /invalid variable name/
    )
  })

  it("refuses a row without a value", async () => {
    const environment = memoryEnvironment()
    const store = createFsVariableStore({ home, environment })
    await expect(store.create([{ name: "EMPTY", value: "  " }])).rejects.toThrow(
      /value is required/
    )
    await expect(store.create([{ name: "EMPTY", value: "x" }])).resolves.toBeDefined()
    await expect(store.update("EMPTY", { value: "" })).rejects.toThrow(/value is required/)
  })

  it("renames a row and moves its value to the new name", async () => {
    const environment = memoryEnvironment()
    const store = createFsVariableStore({ home, environment })
    await store.create([
      { name: "OLD", value: "kept" },
      { name: "TAKEN", value: "other" },
    ])

    const renamed = await store.update("OLD", { name: "NEW" })
    expect(renamed.variables.find((row) => row.name === "NEW")?.value).toBe("kept")
    expect(environment.values.has("OLD")).toBe(false)
    expect(environment.values.get("NEW")).toBe("kept")

    await expect(store.update("NEW", { name: "TAKEN" })).rejects.toThrow(/already exists/)
  })

  it("updates a value in the environment without writing it to the file", async () => {
    const environment = memoryEnvironment()
    const store = createFsVariableStore({ home, environment })
    await store.create([{ name: "TOKEN", value: "old" }])

    const updated = await store.update("TOKEN", { value: "new" })
    expect(updated.variables[0]?.value).toBe("new")
    expect(environment.values.get("TOKEN")).toBe("new")
    expect((await rawDocument()).variables[0]).not.toHaveProperty("value")
  })

  it("moves a row between groups and deletes its environment value", async () => {
    const environment = memoryEnvironment()
    const store = createFsVariableStore({ home, environment })
    await store.create([{ name: "REGION", value: "us-east-1" }])

    const moved = await store.update("REGION", { group: "云服务" })
    expect(moved.variables[0]?.group).toBe("云服务")
    expect(moved.groups).toContain("云服务")

    const removed = await store.remove("REGION")
    expect(removed.variables).toEqual([])
    expect(environment.values.has("REGION")).toBe(false)
  })

  it("shows a row whose environment value is missing as unset", async () => {
    const environment = memoryEnvironment()
    const store = createFsVariableStore({ home, environment })
    await store.create([{ name: "GONE", value: "here" }])
    environment.values.delete("GONE")

    const shown = await store.read()
    expect(shown.variables[0]?.value).toBe("")
  })

  it("keeps an empty group", async () => {
    const environment = memoryEnvironment()
    const store = createFsVariableStore({ home, environment })
    const document = await store.createGroup("数据库")
    expect(document.groups).toContain("数据库")
    expect((await rawDocument()).groups).toContain("数据库")
  })

  it("drops a value left in the file by an earlier build", async () => {
    const file = variablesPath(home)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(
      file,
      JSON.stringify({
        version: 1,
        groups: [],
        variables: [{ name: "LEGACY", group: "通用", value: "not-ours" }],
      })
    )

    const environment = memoryEnvironment()
    const store = createFsVariableStore({ home, environment })
    expect((await store.read()).variables[0]?.value).toBe("")
    expect(environment.values.has("LEGACY")).toBe(false)

    await store.createGroup("Other")
    expect((await rawDocument()).variables[0]).not.toHaveProperty("value")
  })

  it("refuses a broken file instead of rebuilding it", async () => {
    const file = variablesPath(home)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, "{")

    const store = createFsVariableStore({ home, environment: memoryEnvironment() })
    await expect(store.read()).rejects.toThrow(/not valid JSON/)
    expect(await fs.readFile(file, "utf8")).toBe("{")
  })

  it("refuses a document that holds the same name twice", async () => {
    const file = variablesPath(home)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(
      file,
      JSON.stringify({
        version: 1,
        groups: [],
        variables: [
          { name: "DUP", group: "通用" },
          { name: "DUP", group: "通用" },
        ],
      })
    )

    const store = createFsVariableStore({ home, environment: memoryEnvironment() })
    await expect(store.read()).rejects.toThrow(/duplicate variable name/)
  })
})
