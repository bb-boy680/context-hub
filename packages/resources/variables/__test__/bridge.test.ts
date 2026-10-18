/**
 * The variable bridge's two ends, driven against each other over a real socket.
 *
 * The handler and `remote-store.ts` each spell the route, the action and every
 * parameter name themselves. A name that drifts on one side becomes a 400 the
 * page reports as a failed library — "this feature does not work" and "there is
 * nothing here" look the same from the outside. So this mounts the real handler
 * on a real `createHubServer`, with a temporary hub home, and makes every call
 * through the package's own client.
 *
 * The seed is written straight to `variables.json`: the handler has no test
 * environment injected, so `create`/`update`/`remove` would write the real
 * machine environment. Group operations only touch the index.
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { createHubServer, type HubListener } from "@context-hub/core/host/server"

import { createVariableHandler } from "../handlers.ts"
import { variablesPath } from "../src/host/variables-fs.ts"
import { createRemoteVariableStore } from "../src/remote-store.ts"
import {
  DEFAULT_GROUP,
  VARIABLE_ROUTE,
  type VariableStore,
} from "../src/store.ts"

const SEED = {
  version: 1,
  groups: [DEFAULT_GROUP, "云服务", "空组"],
  variables: [
    {
      name: "SEEDED_ONE",
      group: "云服务",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      name: "SEEDED_TWO",
      group: DEFAULT_GROUP,
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
}

let home: string
let listener: HubListener
let store: VariableStore

async function seed(): Promise<void> {
  const file = variablesPath(home)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, JSON.stringify(SEED))
}

beforeAll(async () => {
  home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-variables-bridge-"))
  const server = createHubServer({
    middlewares: [createVariableHandler({ home })],
    log: () => undefined,
  })
  listener = await server.listen()
  store = createRemoteVariableStore(`${listener.url}${VARIABLE_ROUTE}`)
})

beforeEach(seed)

afterAll(async () => {
  await listener.close()
  await fs.rm(home, { recursive: true, force: true })
})

describe("the variable bridge", () => {
  it("reads the whole library", async () => {
    const document = await store.read()
    expect(Object.keys(document)).toEqual(
      expect.arrayContaining(["version", "groups", "variables"])
    )
    expect(document.groups).toEqual([DEFAULT_GROUP, "云服务", "空组"])
    expect(document.variables.map((row) => row.name)).toEqual([
      "SEEDED_ONE",
      "SEEDED_TWO",
    ])
  })

  it("adds an empty group", async () => {
    const document = await store.createGroup("新组")
    expect(document.groups).toContain("新组")
  })

  it("renames a group through the wire", async () => {
    const document = await store.renameGroup("云服务", "Cloud")
    expect(document.groups).toContain("Cloud")
    expect(document.groups).not.toContain("云服务")
    expect(document.variables.find((row) => row.name === "SEEDED_ONE")?.group).toBe(
      "Cloud"
    )
    expect(document.variables.find((row) => row.name === "SEEDED_TWO")?.group).toBe(
      DEFAULT_GROUP
    )
  })

  it("removes a group through the wire", async () => {
    const document = await store.removeGroup("云服务")
    expect(document.groups).not.toContain("云服务")
    expect(document.variables.find((row) => row.name === "SEEDED_ONE")?.group).toBe(
      DEFAULT_GROUP
    )
    expect(document.variables.find((row) => row.name === "SEEDED_TWO")?.group).toBe(
      DEFAULT_GROUP
    )
  })

  it("refuses a rename onto an existing group through the wire", async () => {
    await expect(store.renameGroup("云服务", "空组")).rejects.toThrow(/already exists/)
    const document = await store.read()
    expect(document.groups).toEqual([DEFAULT_GROUP, "云服务", "空组"])
  })

  it("refuses to remove the default group through the wire", async () => {
    await expect(store.removeGroup(DEFAULT_GROUP)).rejects.toThrow(
      /default group cannot be removed/
    )
  })

  it("does not claim a path that merely starts with the route", async () => {
    const response = await fetch(`${listener.url}${VARIABLE_ROUTE}X`)
    expect(response.status).toBe(404)
  })
})
