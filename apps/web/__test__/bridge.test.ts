/**
 * The two bridges whose *clients* live in this app, driven against the real
 * handlers over a real socket.
 *
 * `packages/core/__test__/bridge.test.ts` mounts the core handlers, but two of
 * them have their only client here: `place-files.ts` and `workspaces.ts`, both
 * of which exist because this form is the one that owns the browser's fetch.
 * A parameter renamed on either end therefore has nowhere else to be caught —
 * a place that cannot be read draws as "this file is empty", which is what the
 * `?action=files&id=` incident looked like (`docs/memory.md`).
 *
 * Both routes are exercised through the clients this app really uses, so what
 * is under test is the pair, not one half of it.
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createHubServer, type HubListener } from "@context-hub/core/host/server"
import { createPlaceFileHandler, createWorkspaceHandler } from "@context-hub/core/handlers"

import { createRemotePlaceFiles, placeFilesAvailable } from "../src/lib/place-files.ts"
import { createRemoteWorkspaceService } from "../src/lib/workspaces.ts"

let home: string
let folder: string
let extra: string
let listener: HubListener
let base: string

beforeAll(async () => {
  home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-web-bridge-home-"))
  folder = await fs.mkdtemp(path.join(tmpdir(), "context-hub-web-bridge-folder-"))
  extra = await fs.mkdtemp(path.join(tmpdir(), "context-hub-web-bridge-extra-"))
  const server = createHubServer({
    middlewares: [createPlaceFileHandler({ home, folder }), createWorkspaceHandler({ home, folder })],
    log: () => undefined,
  })
  listener = await server.listen()
  base = listener.url
})

afterAll(async () => {
  await listener.close()
  await fs.rm(home, { recursive: true, force: true })
  await fs.rm(folder, { recursive: true, force: true })
  await fs.rm(extra, { recursive: true, force: true })
})

describe("the question the form asks before offering client files", () => {
  it("is answered yes while a host is listening", async () => {
    expect(await placeFilesAvailable(base)).toBe(true)
  })

  it("is answered no when nothing is listening", async () => {
    /* An origin of its own, bound and then let go, so the port is certainly
       nobody's. Without this answer the form keeps `host.files` null, and the
       file panels, the MCP installs and the prompt deliveries all go quiet
       rather than reporting anything. */
    const spare = await createHubServer({ middlewares: [], log: () => undefined }).listen()
    const gone = spare.url
    await spare.close()
    expect(await placeFilesAvailable(gone)).toBe(false)
  })
})

describe("a client file", () => {
  const files = () => createRemotePlaceFiles(base)

  it("is named by the workspace the host is in", async () => {
    expect(await files().workspace()).toBe(folder)
  })

  it("is written, read back, and removed", async () => {
    const ref = { scope: "workspace", file: "notes.md" } as const
    await files().write(ref, "kept\n")
    expect(await files().read(ref)).toBe("kept\n")

    await files().remove(ref)
    /* Gone reads as absent rather than as an error: a file that was never
       there and one that was removed are the same answer to "what is in it". */
    expect(await files().read(ref)).toBeNull()
  })

  it("is refused when the path climbs out of the workspace", async () => {
    await expect(files().write({ scope: "workspace", file: "../escape.md" }, "no")).rejects.toThrow()
  })
})

describe("the workspace list", () => {
  const service = () => createRemoteWorkspaceService(base)

  it("reads the page the host is in", async () => {
    const workspaces = service()
    await workspaces.refresh()
    expect(workspaces.failure()).toBeNull()
    expect(workspaces.current()?.current).toBeTruthy()
  })

  it("takes one in, renames it, switches away, and gives it up", async () => {
    const workspaces = service()
    await workspaces.refresh()
    const was = workspaces.current()?.current
    expect(was, "a workspace has to be in use for this").toBeTruthy()

    expect(await workspaces.add(extra), workspaces.failure() ?? "").toBe(true)
    const added = workspaces.current()?.folders.find(
      (one) => one.path !== null && path.resolve(one.path) === path.resolve(extra)
    )
    expect(added, "the folder that was just added").toBeDefined()
    /* Adding one makes it the one in use, which is what the sidebar shows. */
    expect(workspaces.current()?.current).toBe(added!.id)

    expect(await workspaces.rename(added!.id, "renamed here"), workspaces.failure() ?? "").toBe(true)
    expect(workspaces.current()?.folders.find((one) => one.id === added!.id)?.name).toBe(
      "renamed here"
    )

    /* The one in use cannot be given up; switching away is what frees it. */
    expect(await workspaces.select(was!), workspaces.failure() ?? "").toBe(true)
    expect(await workspaces.remove(added!.id), workspaces.failure() ?? "").toBe(true)
    expect(workspaces.current()?.folders.some((one) => one.id === added!.id)).toBe(false)
  })

  it("records which agents this hub delivers to", async () => {
    const workspaces = service()
    await workspaces.refresh()
    const id = workspaces.current()?.current
    expect(id, "a workspace has to be in use for this").toBeTruthy()

    expect(await workspaces.setAgent(id!, true), workspaces.failure() ?? "").toBe(true)
    expect(workspaces.current()?.agents.length).toBe(1)
  })

  it("reports a failure rather than throwing it at a click", async () => {
    const workspaces = service()
    await workspaces.refresh()
    /* A workspace id nobody has: the answer is `false` with a reason, which is
       what the menu reads, not a rejection the click handler has to catch. */
    expect(await workspaces.select("no-such-workspace")).toBe(false)
    expect(workspaces.failure()).not.toBeNull()
  })
})
