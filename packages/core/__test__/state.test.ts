/**
 * Behaviour of the disk-backed state store: one JSON document per name under
 * `<home>/state`, names that are file names, a read of an absent document that
 * is `null`, a malformed document that is an error rather than an empty value,
 * and a write that leaves no temporary file behind.
 *
 * Every case runs against a temporary hub home, so nothing here reaches the
 * machine's own `~`.
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { assertStateName } from "../src/state.ts"
import { createFsStateStore } from "../src/host/state-fs.ts"
import { TEMP_PREFIX } from "../src/host/atomic.ts"

let home: string

beforeAll(async () => {
  home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-state-"))
})

afterAll(async () => {
  await fs.rm(home, { recursive: true, force: true })
})

/** A store over the temporary home; each case opens its own, as a fresh boot would. */
const store = () => createFsStateStore(home)

describe("an empty home", () => {
  it("reports where it writes", () => {
    expect(store().root).toBe(path.join(home, "state"))
  })

  it("lists nothing and reads an absent document as null", async () => {
    expect(await store().names()).toEqual([])
    expect(await store().read("extensions")).toBeNull()
  })
})

describe("a written document", () => {
  /* A write lands as one pretty-printed JSON file under the state directory. */
  const held = { skills: true, "zh-cn": false }

  beforeAll(async () => {
    await store().write("extensions", held)
  })

  it("lands as a JSON file named after it", async () => {
    expect((await fs.stat(path.join(home, "state", "extensions.json"))).isFile()).toBe(true)
  })

  it("holds the value itself, not an encoded string", async () => {
    expect(await fs.readFile(path.join(home, "state", "extensions.json"), "utf8")).toBe(
      `${JSON.stringify(held, null, 2)}\n`
    )
  })

  it("reads back as the value", async () => {
    expect(await store().read("extensions")).toEqual(held)
  })

  /* Values survive a new store over the same home, which is the point of the move. */
  it("is read by a store opened later", async () => {
    expect(await createFsStateStore(home).read("extensions")).toEqual(held)
  })
})

describe("names", () => {
  beforeAll(async () => {
    await store().write("extensions", { skills: true, "zh-cn": false })
    /* Scalars are documents too; the locale is a bare string. */
    await store().write("locale", "zh-CN")
  })

  it("round-trips a scalar document", async () => {
    expect(await store().read("locale")).toBe("zh-CN")
  })

  it("lists every document, sorted", async () => {
    expect(await store().names()).toEqual(["extensions", "locale"])
  })
})

/* Names become file names, so anything else is refused before a path is built. */
const NOT_FILE_NAMES = ["..", "hub/locale", "Hub", ".hidden", "", "with space", "extensions.json"]

describe("a name that is not a file name", () => {
  it.each(NOT_FILE_NAMES)("refuses %j", (name) => {
    expect(() => assertStateName(name)).toThrow()
  })
})

describe("a path that leaves the state directory", () => {
  it("is refused", async () => {
    await expect(store().write("../escape", {})).rejects.toThrow()
  })

  it("writes nothing outside", async () => {
    expect(await fs.stat(path.join(home, "escape.json")).catch(() => null)).toBeNull()
  })
})

describe("a foreign file in the state directory", () => {
  beforeAll(async () => {
    /* A file that is not JSON is an error, so the caller can warn instead of guessing. */
    await fs.writeFile(path.join(home, "state", "broken.json"), "{not json", "utf8")
    await fs.writeFile(path.join(home, "state", "notes.md"), "kept", "utf8")
  })

  it("is an error that names the file", async () => {
    await expect(store().read("broken")).rejects.toThrow(/broken\.json/)
  })

  it("is not listed", async () => {
    expect(await store().names()).not.toContain("notes")
  })

  it("is left alone", async () => {
    expect(await fs.readFile(path.join(home, "state", "notes.md"), "utf8")).toBe("kept")
  })
})

describe("replacing a document", () => {
  beforeAll(async () => {
    await store().write("extensions", { skills: false })
  })

  it("holds the new value", async () => {
    expect(await store().read("extensions")).toEqual({ skills: false })
  })

  /* The write is atomic: a reader never sees a temporary file, and none is left. */
  it("leaves no temporary file behind", async () => {
    const entries = await fs.readdir(path.join(home, "state"))
    expect(entries.filter((entry) => entry.startsWith(TEMP_PREFIX))).toEqual([])
  })
})
