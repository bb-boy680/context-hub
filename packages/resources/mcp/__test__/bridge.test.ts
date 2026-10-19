/**
 * The MCP bridge's two ends, driven against each other over a real socket.
 *
 * Everything else in this package tests the host side directly — the probe, the
 * cache, the records file, the wire reader. The *client* half was never driven:
 * `callMcp` and the two remote ports spell the route, the action and every
 * field name themselves, and a field renamed on one side is a refusal the page
 * swallows. The suite mounts the real handler on a real `createHubServer` with
 * a temporary hub home and calls through the package's own ports.
 *
 * The probe is asked for a program that does not exist on purpose: nothing here
 * needs a server to answer, only the handler to reach the point where it knows
 * what it was asked. `save: false` keeps the answer out of the cache, so the
 * only thing this writes is the records file it was told to write.
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createHubServer, type HubListener } from "@context-hub/core/host/server"

import { createMcpHandler } from "../handlers.ts"
import type { McpDeclaration } from "../src/declaration.ts"
import { MCP_ROUTE, createRemoteProbe, probeAvailable } from "../src/probe.ts"
import { createRemoteRecords } from "../src/records.ts"

/** A program no machine has, so a probe fails fast without starting anything. */
const MISSING = "context-hub-no-such-program-xyz"

const STDIO: McpDeclaration = { transport: "stdio", command: MISSING, args: [], env: {} }

/** One record as the file holds it, in the shape both ends agree on. */
const RECORD = {
  name: "probe.example",
  mcpServers: { "probe.example": { command: MISSING } },
  description: "made by the check",
  tags: [],
}

let home: string
let listener: HubListener
let base: string

beforeAll(async () => {
  home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-mcp-bridge-"))
  const server = createHubServer({
    middlewares: [createMcpHandler({ home })],
    log: () => undefined,
  })
  listener = await server.listen()
  base = listener.url
})

afterAll(async () => {
  await listener.close()
  await fs.rm(home, { recursive: true, force: true })
})

describe("the question the page asks before offering a probe", () => {
  it("is answered yes while a host is listening", async () => {
    expect(await probeAvailable(base)).toBe(true)
  })

  it("is answered no when nothing is listening", async () => {
    /* An origin of its own, bound and then let go, so the port is certainly
       nobody's — asserting against a port that merely looks free would pass
       for the wrong reason. */
    const spare = await createHubServer({ middlewares: [], log: () => undefined }).listen()
    const gone = spare.url
    await spare.close()
    expect(await probeAvailable(gone)).toBe(false)
  })
})

describe("the records file", () => {
  it("is read and written through the bridge", async () => {
    const records = createRemoteRecords(base)

    /* Where the file is is itself a field the two ends have to agree on: a name
       that drifted leaves it empty rather than wrong. */
    expect((await records.read()).file, "the host did not name the records file").not.toBe("")

    await records.save([RECORD])
    expect(await records.read()).toMatchObject({ document: [RECORD] })
  })
})

describe("one probe", () => {
  it("runs and comes back as an answer rather than a refusal", async () => {
    const entry = await createRemoteProbe(base).probe({
      declaration: STDIO,
      scope: "global",
      save: false,
    })
    /* The declaration and the scope reached the handler: a field that drifted
       would have been refused by the body reader before any probe ran. */
    expect(entry.scope).toBe("global")
    expect(entry.target).toContain(MISSING)
    expect(typeof entry.at).toBe("number")
  })

  it("leaves no trace when the caller did not ask for one", async () => {
    /* The add dialog's tryout carries no name, so the write is skipped. */
    await createRemoteProbe(base).probe({ declaration: STDIO, scope: "global", save: false })
    const cache = await createRemoteProbe(base).cache(["probe.example"])
    expect(cache["probe.example"]).toBeNull()
  })

  it("is kept under its name once a name is given", async () => {
    const probe = createRemoteProbe(base)
    const kept = await probe.probe({
      name: "probe.example",
      declaration: STDIO,
      scope: "global",
      save: true,
    })
    const cache = await probe.cache(["probe.example"])
    expect(cache["probe.example"]?.at).toBe(kept.at)
  })
})

describe("a request this bridge does not own", () => {
  it("is passed on rather than answered here", async () => {
    const response = await fetch(`${base}/hub/something-else`)
    expect(response.status).toBe(404)
  })

  it("is not claimed by a path that merely starts with the route", async () => {
    /* `/hub/mcpX` is not this route. The handler matches exactly, and this is
       what says so if that ever changes. */
    const response = await fetch(`${base}${MCP_ROUTE}X`)
    expect(response.status).toBe(404)
  })
})
