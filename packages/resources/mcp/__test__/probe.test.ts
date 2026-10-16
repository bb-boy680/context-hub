/**
 * Behaviour of probing: the fixture stdio server the probe must read
 * correctly, the error vocabulary it must classify, the cache's answer rules —
 * what a name it holds an answer for gets back, and what misses — plus the
 * cache's prune and read-back rules.
 *
 * The probe runs real processes and hits a real (closed) port, so this is an
 * end-to-end check of the module and not of a stub.
 */
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import type { McpDeclaration } from "../src/declaration.ts"
import { PROBE_VERSION, cacheEntryOf, createProbeCache } from "../src/host/cache.ts"
import { probeDeclaration } from "../src/host/probe.ts"
import { createRecordStore } from "../src/host/records.ts"
import { readMcpCall } from "../src/probe.ts"

/** Whether a file is there. */
async function exists(file: string): Promise<boolean> {
  return await stat(file).then(
    () => true,
    () => false
  )
}

const FIXTURE = fileURLToPath(new URL("./fixture-server.mjs", import.meta.url))
const NODE = process.execPath

/** A stdio declaration that runs the fixture, with the environment a case needs. */
function stdio(env: Record<string, string> = {}, args: string[] = [FIXTURE]): McpDeclaration {
  return { transport: "stdio", command: NODE, args, env }
}

const MISSING = "CTX_HUB_DEFINITELY_MISSING"

/** What the fixture answered, which the cache cases build an entry from. */
let report: Awaited<ReturnType<typeof probeDeclaration>>

beforeAll(async () => {
  /* The variable must be unset in this process: an unset one is what a `${...}`
     without a default has to trip over. */
  delete process.env[MISSING]
  report = await probeDeclaration({ declaration: stdio() })
})

describe("the probe", () => {
  it("connects to a stdio server", () => {
    expect(report.ok, "a stdio server connects").toBe(true)
  })

  it("reports the server's name and version", () => {
    expect(report.serverInfo?.name, "it reports the server's name").toBe("fixture")
    expect(report.serverInfo?.version, "and its version").toBe("9.9.9")
  })

  it("keeps the title and the website", () => {
    expect(report.serverInfo?.title, "it keeps the title").toBe("Fixture server")
    expect(report.serverInfo?.websiteUrl, "and the website").toBe("https://example.com/fixture")
  })

  it("keeps the server's own description", () => {
    expect(report.serverInfo?.description, "it keeps the server's own description").toBe(
      "Echoes text and adds numbers."
    )
  })

  it("reports the negotiated protocol version", () => {
    expect(typeof report.protocolVersion, "it reports the negotiated protocol version").toBe(
      "string"
    )
    expect(report.protocolVersion?.length, "and one that is not empty").toBeGreaterThan(0)
  })

  it("reports the capabilities", () => {
    expect(report.capabilities?.tools, "it reports the capabilities").toBeDefined()
  })

  it("reads every page of the tool list", () => {
    expect(report.tools?.map((tool) => tool.name), "it reads every page of the tool list").toEqual([
      "echo",
      "sum",
    ])
  })

  it("keeps a tool's input schema and its output schema", () => {
    expect(
      (report.tools?.[0]?.inputSchema as { properties?: Record<string, unknown> } | undefined)
        ?.properties?.message,
      "it keeps a tool's input schema"
    ).toBeDefined()
    expect(
      (report.tools?.[1]?.outputSchema as { required?: string[] } | undefined)?.required?.[0],
      "it keeps a tool's output schema"
    ).toBe("total")
  })

  it("prefers the data URI icon", () => {
    expect(report.icon?.src, "it prefers the data URI icon").toMatch(/^data:image\/svg\+xml/)
  })

  it("keeps the instructions whole", () => {
    expect(report.instructions, "it keeps the instructions whole").toMatch(/^mark=/)
    expect(report.instructions?.length, "and every byte of them").toBeGreaterThan(2049)
  })

  it("keeps the server's stderr", () => {
    expect(report.stderr, "it keeps the server's stderr").toContain("fixture: ready")
  })

  it("reports how long it took", () => {
    expect(typeof report.ms, "it reports how long it took").toBe("number")
    expect(report.ms, "as a span").toBeGreaterThanOrEqual(0)
  })
})

describe("environment expansion", () => {
  beforeAll(() => {
    process.env.CTX_HUB_TEST_MARK = "expanded"
  })

  it("lets a set variable reach the child", async () => {
    const expanded = await probeDeclaration({
      declaration: stdio({ MARK: "${CTX_HUB_TEST_MARK}" }),
    })
    expect(expanded.instructions, "a set variable reaches the child").toMatch(/^mark=expanded/)
  })

  it("lets a default fill a missing variable in", async () => {
    const fallback = await probeDeclaration({
      declaration: stdio({ MARK: `\${${MISSING}:-fallback}` }),
    })
    expect(fallback.instructions, "a default fills a missing variable in").toMatch(/^mark=fallback/)
  })

  it("fails as env for an unset variable, naming it", async () => {
    const missing = await probeDeclaration({ declaration: stdio({ MARK: `\${${MISSING}}` }) })
    expect(missing.ok, "an unset variable fails as env").toBe(false)
    expect(missing.error?.kind, "as an env failure").toBe("env")
    expect(missing.error?.params?.name, "and the failure names the variable").toBe(MISSING)
  })
})

describe("failures", () => {
  it("fails as spawn for a command that does not exist", async () => {
    const gone = await probeDeclaration({
      declaration: { transport: "stdio", command: "ctx-hub-no-such-command", args: [], env: {} },
    })
    expect(gone.ok, "a command that does not exist fails as spawn").toBe(false)
    expect(gone.error?.kind, "as a spawn failure").toBe("spawn")
  })

  it("fails as spawn for a server that exits at once, keeping its stderr", async () => {
    const died = await probeDeclaration({ declaration: stdio({ CTX_HUB_FIXTURE_FAIL: "1" }) })
    expect(died.ok, "a server that exits at once fails as spawn").toBe(false)
    expect(died.error?.kind, "as a spawn failure").toBe("spawn")
    expect(died.stderr, "and its stderr is kept").toContain("failing as asked")
  })

  it("fails as network for an endpoint that refuses", async () => {
    const offline = await probeDeclaration({
      declaration: { transport: "http", url: "http://127.0.0.1:1/mcp", headers: {} },
      timeoutMs: 5_000,
    })
    expect(offline.ok, "an endpoint that refuses fails as network").toBe(false)
    expect(offline.error?.kind, "as a network failure").toBe("network")
  })
})

describe("the cache", () => {
  const target = { name: "fixture", declaration: stdio(), scope: "workspace" as const }
  let home: string
  let file: string
  let cache: ReturnType<typeof createProbeCache>
  let entry: ReturnType<typeof cacheEntryOf>

  beforeAll(async () => {
    home = await mkdtemp(path.join(os.tmpdir(), "hub-mcp-cache-"))
    cache = createProbeCache({ home })
    file = path.join(cache.root, "cache.json")
    entry = cacheEntryOf(target, report, 1234)
    await cache.record("fixture", entry, ["fixture"])
  })

  afterAll(async () => {
    await rm(home, { recursive: true, force: true })
  })

  it("answers for a name it holds, and misses for one it does not", async () => {
    expect((await cache.compare(["fixture"])).fixture?.at, "a recorded answer comes back").toBe(1234)
    expect((await cache.compare(["fixture"])).fixture?.probe, "and carries the probe version").toBe(
      PROBE_VERSION
    )
    /* A name is what an answer is asked for by: the declaration, the scope and
       the workspace it was probed in are not consulted, so a server whose
       files moved since keeps the answer it has until a person checks again. */
    expect((await cache.compare(["other"])).other, "a name with no answer misses").toBeNull()
  })

  it("writes a versioned document holding the fixture", async () => {
    const document = JSON.parse(await readFile(file, "utf8")) as {
      version: number
      servers: Record<string, unknown>
    }
    expect(document.version, "the document is versioned").toBe(2)
    expect(document.servers, "and holds the fixture").toHaveProperty("fixture")
  })

  it("keeps a second name while it is listed, and prunes it once unlisted", async () => {
    const stray = cacheEntryOf({ declaration: stdio(), scope: "global" }, report, 99)
    await cache.record("stray", stray, ["fixture", "stray"])
    expect((await cache.compare(["stray"])).stray?.at, "a second name is kept while it is listed").toBe(
      99
    )
    await cache.record("fixture", entry, ["fixture"])
    expect((await cache.compare(["stray"])).stray, "an unlisted name is pruned").toBeNull()
  })

  it("drops an answer an older probe wrote, a document it cannot read, and an entry of the wrong shape", async () => {
    await writeFile(
      file,
      JSON.stringify({ version: 2, servers: { fixture: { ...entry, probe: PROBE_VERSION - 1 } } }),
      "utf8"
    )
    expect(
      (await cache.compare(["fixture"])).fixture,
      "an answer an older probe wrote misses"
    ).toBeNull()

    await writeFile(file, "{ not json", "utf8")
    expect(
      (await cache.compare(["fixture"])).fixture,
      "a document this build cannot read is dropped"
    ).toBeNull()

    await writeFile(file, JSON.stringify({ version: 2, servers: { fixture: { probe: "x" } } }), "utf8")
    expect(
      (await cache.compare(["fixture"])).fixture,
      "an entry of the wrong shape is dropped"
    ).toBeNull()
  })

  it("reads back an entry of the right shape", async () => {
    await writeFile(file, JSON.stringify({ version: 2, servers: { fixture: entry } }), "utf8")
    expect(
      (await cache.compare(["fixture"])).fixture?.at,
      "an entry of the right shape reads back"
    ).toBe(1234)
  })
})

describe("the records file", () => {
  const document = [
    { name: "github", mcpServers: { github: { command: "npx" } }, description: "", tags: ["vcs"] },
  ]
  let home: string
  let file: string
  let records: ReturnType<typeof createRecordStore>

  beforeAll(async () => {
    home = await mkdtemp(path.join(os.tmpdir(), "hub-mcp-records-"))
    file = path.join(home, "mcp", "mcp.json")
    records = createRecordStore({ home })
  })

  afterAll(async () => {
    await rm(home, { recursive: true, force: true })
  })

  it("reads none from a hub with no records file", async () => {
    expect(await records.read(), "a hub with no records file reads none").toBeNull()
  })

  it("reads a saved document back", async () => {
    await records.save(document)
    expect(await records.read(), "a saved document reads back").toEqual(document)
  })

  it("sits at <home>/mcp/mcp.json", async () => {
    const text = await readFile(file, "utf8")
    expect(text, "it sits at <home>/mcp/mcp.json, newline and all").toMatch(/\n$/)
    expect((JSON.parse(text) as { name: string }[])[0]?.name, "holding the record written").toBe(
      "github"
    )
  })

  it("refuses a records file that is not JSON, rather than guessing at one", async () => {
    await writeFile(file, "{ not json", "utf8")
    await expect(
      createRecordStore({ home }).read(),
      "a records file that is not JSON is refused, not guessed at"
    ).rejects.toThrow()
  })
})

describe("the state document earlier builds kept the records in", () => {
  let home: string
  let legacy: string
  let adopted: { mcpServers?: Record<string, unknown> }[]

  beforeAll(async () => {
    home = await mkdtemp(path.join(os.tmpdir(), "hub-mcp-state-"))
    legacy = path.join(home, "state", "mcp.json")
    await mkdir(path.dirname(legacy), { recursive: true })
    await writeFile(
      legacy,
      JSON.stringify([
        {
          name: "playwright",
          declaration: {
            transport: "stdio",
            command: "npx",
            args: ["@playwright/mcp"],
            env: {},
          },
          description: "",
          tags: ["browser"],
        },
      ]),
      "utf8"
    )
    adopted = (await createRecordStore({ home }).read()) as {
      mcpServers?: Record<string, unknown>
    }[]
  })

  afterAll(async () => {
    await rm(home, { recursive: true, force: true })
  })

  it("carries the records into the file and takes the state document away", async () => {
    expect(
      adopted[0]?.mcpServers?.playwright,
      "a state document's records are carried into the file"
    ).toBeDefined()
    expect(
      JSON.parse(await readFile(path.join(home, "mcp", "mcp.json"), "utf8")),
      "the carried records land in the file"
    ).toHaveLength(1)
    expect(await exists(legacy), "the state document is gone once they are safe").toBe(false)
  })
})

describe("the wire", () => {
  it("reads a cache, a probe, a records and a save call", () => {
    expect(readMcpCall({ action: "cache", names: ["github"] }).action, "a cache call reads").toBe(
      "cache"
    )
    expect(
      readMcpCall({
        action: "probe",
        declaration: { transport: "http", url: "https://x/mcp" },
        scope: "workspace",
      }).action,
      "a probe call reads"
    ).toBe("probe")
    expect(readMcpCall({ action: "records" }).action, "a records call reads").toBe("records")
    expect(
      readMcpCall({ action: "save-records", records: [] }).action,
      "a save call carries its records"
    ).toBe("save-records")
  })

  it("refuses an unknown action, a save with no records, a bad scope and the rest", () => {
    expect(() => readMcpCall({ action: "nope" }), "an unknown action is refused").toThrow()
    expect(() => readMcpCall({ action: "save-records" }), "a save call without records is refused").toThrow()
    expect(
      () =>
        readMcpCall({
          action: "probe",
          declaration: { transport: "stdio", command: "c" },
          scope: "elsewhere",
        }),
      "a bad scope is refused"
    ).toThrow()
    expect(
      () => readMcpCall({ action: "probe", declaration: { transport: "stdio" }, scope: "global" }),
      "a stdio declaration without a command is refused"
    ).toThrow()
    expect(() => readMcpCall({ action: "cache" }), "a cache call without names is refused").toThrow()
  })

  it("keeps only the names it was handed", () => {
    expect(
      (readMcpCall({ action: "cache", names: ["github", 7, ""] }) as { names: string[] }).names,
      "and the names it does carry are the ones kept"
    ).toEqual(["github"])
  })
})
