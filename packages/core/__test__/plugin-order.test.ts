/**
 * Install order lives in the records file beside the records themselves. A
 * reinstall moves an extension to the end; an update does not move it.
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import { createFsPluginStore } from "../src/host/plugins-fs.ts"

const homes: string[] = []
const record = { version: "1", source: "local", installedAt: "" }

afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => fs.rm(home, { recursive: true, force: true })))
})

async function fixture() {
  const home = await fs.mkdtemp(path.join(tmpdir(), "hub-plugin-order-"))
  homes.push(home)
  const root = path.join(home, "extensions")
  const store = createFsPluginStore(home)
  async function install(id: string) {
    await store.write(id, "plugin.yaml", `id: ${id}\n`)
    await store.setRecord(id, record)
  }
  return { home, root, store, install }
}

describe("extension install order", () => {
  it("keeps install order across updates, stores and reinstall", async () => {
    const { home, store, install } = await fixture()
    await install("z")
    await install("2")
    await install("a")
    await store.setRecord("2", { ...record, version: "2" })
    expect(await store.list()).toEqual(["z", "2", "a"])
    expect(await createFsPluginStore(home).list()).toEqual(["z", "2", "a"])
    const second = createFsPluginStore(home)
    await second.remove("2")
    await install("2")
    expect(await second.list()).toEqual(["z", "a", "2"])
  })

  it("migrates record order and appends a directory nobody recorded", async () => {
    const { root, store, install } = await fixture()
    await install("m")
    await install("q")
    await fs.writeFile(
      path.join(root, "index.json"),
      JSON.stringify({ z: record, m: record, q: record }),
      "utf8"
    )
    await store.write("z", "plugin.yaml", "id: z\n")
    await store.write("a", "plugin.yaml", "id: a\n")
    expect(await store.list()).toEqual(["z", "m", "q", "a"])
    expect((await store.records()).z, "the records survive migration").toBeDefined()
  })

  it("serialises concurrent installs into one ordered file", async () => {
    const { store } = await fixture()
    await Promise.all(
      ["z", "a", "m"].map(async (id) => {
        await store.write(id, "plugin.yaml", `id: ${id}\n`)
        await store.setRecord(id, record)
      })
    )
    expect(await store.list()).toHaveLength(3)
    const saved = JSON.parse(
      await fs.readFile(path.join(store.root, "index.json"), "utf8")
    ) as { order: string[] }
    expect(saved.order).toEqual(expect.arrayContaining(["z", "a", "m"]))
    expect(new Set(saved.order).size).toBe(3)
  })

  it("does not list an install before its record is committed", async () => {
    const { store } = await fixture()
    let release!: () => void
    let entered!: () => void
    const reached = new Promise<void>((resolve) => { entered = resolve })
    const wait = new Promise<void>((resolve) => { release = resolve })
    const installing = store.commitInstall!("z", record, async () => {
      await store.write("z", "plugin.yaml", "id: z\n")
      entered()
      await wait
    })
    await reached
    const listing = store.list()
    release()
    await installing
    expect(await listing).toEqual(["z"])
    expect((await store.records()).z).toEqual(record)
  })

  it("does not replace a corrupt records file with an empty one", async () => {
    const { root, store } = await fixture()
    await store.write("z", "plugin.yaml", "id: z\n")
    const file = path.join(root, "index.json")
    await fs.writeFile(file, "{not json", "utf8")
    expect(await store.records()).toEqual({})
    expect(await store.list()).toEqual(["z"])
    expect(await fs.readFile(file, "utf8"), "the unreadable file is left alone").toBe("{not json")
  })
})
