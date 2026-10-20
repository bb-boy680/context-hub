/**
 * The library the page reads through: how it is published, what it reads on its
 * own, and what it does when there is nothing behind it.
 *
 * The wiring is worth a check of its own because it is invisible: a library that
 * is constructed and never published looks exactly like one that is, and a page
 * that finds nothing draws an empty list rather than saying so. So what is
 * asserted here is the seam — that the module's `apply` leaves something under
 * the name a form starts its reads by — and the two things the page used to
 * have to do for itself: keeping a list on screen while its probes are still
 * out, and reading again when the set of clients changes. Both used to live in
 * the page's effect, so nothing was left to notice if they stopped.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { Context } from "@deepseek-ai/cordis"

import type { PlaceFiles } from "@context-hub/core/place-files"
import { createHubKernel, type ExtensionModule, type PlatformHost } from "@context-hub/extensions"

import { McpError } from "../src/contract.ts"
import { mcpModuleWith } from "../src/extension.ts"
import {
  EMPTY_MCP_LIBRARY,
  MCP_LIBRARY_SERVICE,
  McpLibrary,
  loadRecords,
} from "../src/library-store.ts"
import type { McpPlace, McpProvider } from "../src/provider.ts"
import type { McpCacheEntry } from "../src/probe.ts"
import type { McpRecordsPort } from "../src/records.ts"

/** The least a form can be: no files, no network, and nowhere to keep state. */
function bareHost(): PlatformHost {
  return {
    form: "Test",
    version: "0.5.0",
    capabilities: { code: true, filesystem: false, network: false },
    storage: { read: () => null, write: () => undefined },
    net: null,
    files: null,
    log: () => undefined,
  }
}

/** A records file that answers with whatever a check hands it. */
function recordsPort(answer: { document: unknown; file: string } | Error): McpRecordsPort {
  return {
    read: async () => {
      if (answer instanceof Error) throw answer
      return answer
    },
    save: async () => undefined,
  }
}

/**
 * The workspace list as a form provides it, holding one choice.
 *
 * `announce` is any change that keeps the choice — a rename, a folder added —
 * and `choose` is the one that decides which agents' files are read.
 */
function formWorkspaces(agents: string[]) {
  let chosen = [...agents]
  const listeners = new Set<() => void>()
  const tell = () => {
    for (const listener of [...listeners]) listener()
  }
  return {
    current: () => ({ folders: [], current: null, agents: chosen }),
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    refresh: async () => undefined,
    announce: tell,
    choose(id: string, on: boolean) {
      chosen = on ? [...chosen, id] : chosen.filter((one) => one !== id)
      tell()
    },
  }
}

describe("the library a form starts", () => {
  it("is under the name the form reads it by once the module is active", async () => {
    const kernel = await createHubKernel({
      host: bareHost(),
      extensions: [mcpModuleWith(() => null)],
    })
    await kernel.start()

    /* Constructing it is not enough to make it findable; this is the seam a
       form's startup and every page look through. */
    expect(kernel.ctx.get(MCP_LIBRARY_SERVICE)).toBeInstanceOf(McpLibrary)
  })

  it("answers an empty read rather than a failure when this form reaches no client file", async () => {
    const ctx = new Context()
    ctx.provide("host", bareHost())
    const library = new McpLibrary(ctx)

    await library.load()

    expect(library.state()).toMatchObject({
      status: "ready",
      value: EMPTY_MCP_LIBRARY,
      failure: null,
    })
  })
})

describe("reading the records file", () => {
  it("names the file the host reported, and keeps the last name when it reported none", async () => {
    const named: string[] = []
    await loadRecords(recordsPort({ document: [], file: "~/mcp/mcp.json" }), (file) =>
      named.push(file)
    )
    await loadRecords(recordsPort({ document: [], file: "" }), (file) => named.push(file))

    expect(named).toEqual(["~/mcp/mcp.json"])
  })

  it("fails as this module's own message about the records file, not the platform's words", async () => {
    const port = recordsPort(new Error("the host is not there"))
    const failed = await loadRecords(port, () => undefined).then(
      () => null,
      (error: unknown) => error
    )

    expect(failed).toBeInstanceOf(McpError)
    expect((failed as McpError).key).toBe("mcp.error.records")
    expect((failed as McpError).message, "the platform's words are kept for the log").toContain(
      "the host is not there"
    )
  })
})

/** Every client file under this form's roots, as a form that reaches none. */
function noFiles(): PlaceFiles {
  return {
    read: async () => null,
    write: async () => undefined,
    remove: async () => undefined,
    workspace: async () => null,
  }
}

/** One client with one file, holding one server, which is all a scan needs. */
const PROVIDER: McpProvider = {
  id: "acme.mcp",
  places: [
    {
      id: "acme",
      label: "Acme",
      scope: "workspace",
      file: "acme.json",
      switchable: false,
    } satisfies McpPlace,
  ],
  read: async () => [
    {
      name: "server",
      declaration: { transport: "stdio", command: "run", args: [], env: {} },
      enabled: true,
    },
  ],
  install: async () => undefined,
  uninstall: async () => undefined,
}

/** What one probe answered, as the cache keeps it. */
const ENTRY: McpCacheEntry = {
  ok: true,
  ms: 1,
  probe: 1,
  target: "run",
  scope: "workspace",
  at: 0,
}

/** An extension that arrives after the library is already reading. */
const latecomer: ExtensionModule = {
  name: "test.latecomer",
  manifest: {
    name: "Latecomer",
    version: "0.1.0",
    kind: "code",
    category: "agent",
    description: "A client whose places only exist once it is enabled.",
    /* Nothing renders here, so the mark this extension carries is nothing. */
    icon: () => null,
    defaultEnabled: false,
  },
  apply() {
    /* Nothing here: what this check is about is the extension arriving, not
       what it contributes. */
  },
}

/** Let queued work run until a condition holds, or give up. */
async function until(ready: () => boolean): Promise<void> {
  for (let tries = 0; tries < 100 && !ready(); tries += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

describe("a read with probes behind it", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("publishes the rows while the probe is still out, and lands its answer on the row", async () => {
    /* The host, as it answers this library: every read it asks for lands at
       once, except one probe, which waits to be let go. That is the shape of a
       server that takes seconds to wake up. */
    let release = (): void => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        await held
        return json({ entry: ENTRY })
      }
      if (String(url).includes("action=cache")) return json({ entries: { server: null } })
      if (String(url).includes("action=records")) {
        return json({ value: [], file: "~/mcp/mcp.json" })
      }
      /* No action at all is the question the page asks before offering probes. */
      return json({})
    })

    /* A whole kernel, because the library reads the registry and the locale off
       it and those are its own module's neighbours, not this test's to fake.
       The client is chosen, because a provider nobody chose is not scanned at
       all — that is the rule this library now follows. */
    const kernel = await createHubKernel({
      host: { ...bareHost(), files: noFiles() },
      services: { "hub.workspaces": formWorkspaces([PROVIDER.id]) },
      extensions: [mcpModuleWith(() => null)],
    })
    await kernel.start()
    const service = kernel.ctx.get("mcp")
    const library = kernel.ctx.get(MCP_LIBRARY_SERVICE)
    if (service === undefined || library === undefined) throw new Error("the module is not up")
    service.register(PROVIDER)

    await library.reload()

    /* The scan is on screen and the probe it started is still out: a list that
       waited for every server would be a list nobody sees for seconds. */
    expect(library.state().status).toBe("ready")
    expect(library.state().value?.scan).not.toBeNull()
    expect(library.state().value?.recordsFile).toBe("~/mcp/mcp.json")
    await until(() => (library.state().value?.testing.length ?? 0) > 0)
    expect(library.state().value?.testing).toEqual(["server"])
    expect(library.state().value?.checks).toEqual({ server: null })

    release()
    await until(() => library.state().value?.checks.server !== null)
    expect(library.state().value?.checks.server).toMatchObject({ ok: true })
    expect(library.state().value?.testing).toEqual([])
    expect(library.state().failure).toBeNull()
  })
})

describe("what makes the library read again", () => {
  it("follows the extension set, because an agent enabled while it is loaded is a place", async () => {
    /* The page used to be what watched the snapshot, so the read stopped when
       nobody was looking at it. The library is what watches now, and this is
       the watch: an extension arriving is a client file the next scan reads. */
    let records = 0
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
    vi.stubGlobal("fetch", async (url: string) => {
      if (String(url).includes("action=records")) {
        records += 1
        return json({ value: [], file: "~/mcp/mcp.json" })
      }
      return json({ entries: {} })
    })

    const kernel = await createHubKernel({
      host: { ...bareHost(), files: noFiles() },
      extensions: [mcpModuleWith(() => null), latecomer],
    })
    await kernel.start()
    const library = kernel.ctx.get(MCP_LIBRARY_SERVICE)
    if (library === undefined) throw new Error("the module is not up")
    /* Asked for first, because a library nobody has asked to read has nothing
       to read *again*: the kernel's own startup is a stream of extensions
       arriving, and following that would read the places of half of them. The
       form's startup is what asks, and this is it. */
    await library.load()
    await until(() => records > 0)

    const read = records
    await kernel.ctx.extensions.enable(latecomer.name)
    await until(() => records > read)

    expect(records, "the scan did not follow the extension that arrived").toBeGreaterThan(read)
  })

  it("follows the agents that were chosen, and only a change of key", async () => {
    let records = 0
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
    vi.stubGlobal("fetch", async (url: string) => {
      if (String(url).includes("action=records")) {
        records += 1
        return json({ value: [], file: "~/mcp/mcp.json" })
      }
      return json({ entries: {} })
    })

    const workspaces = formWorkspaces([])
    const kernel = await createHubKernel({
      host: { ...bareHost(), files: noFiles() },
      services: { "hub.workspaces": workspaces },
      extensions: [mcpModuleWith(() => null)],
    })
    await kernel.start()
    const library = kernel.ctx.get(MCP_LIBRARY_SERVICE)
    if (library === undefined) throw new Error("the module is not up")
    await library.load()
    await until(() => records > 0)

    /* A rename, a folder added: the form announces all of them, and none of
       them changes which client files a scan reads. */
    const before = records
    workspaces.announce()
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(records, "an announcement that moves nothing re-read the library").toBe(before)

    /* Choosing an agent is what adds its files to the scan. */
    workspaces.choose(PROVIDER.id, true)
    await until(() => records > before)
    expect(records, "choosing an agent did not re-read the library").toBeGreaterThan(before)
  })
})
