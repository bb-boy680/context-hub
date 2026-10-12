/**
 * Behaviour check for probing: the fixture stdio server the probe must read
 * correctly, the error vocabulary it must classify, the cache's answer rules —
 * what a name it holds an answer for gets back, and what misses — plus the
 * cache's prune and read-back rules.
 *
 * The probe runs real processes and hits a real (closed) port, so this is an
 * end-to-end check of the module and not of a stub.
 *
 * Run from the package: `node scripts/check-probe.ts`
 */
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import type { McpDeclaration } from "../src/declaration.ts"
import { PROBE_VERSION, cacheEntryOf, createProbeCache } from "../src/host/cache.ts"
import { probeDeclaration } from "../src/host/probe.ts"
import { createRecordStore } from "../src/host/records.ts"
import { readMcpCall } from "../src/probe.ts"

let failures = 0
let checked = 0

function check(what: string, ok: boolean, detail?: unknown) {
  checked += 1
  if (ok) {
    console.log(`  ok   ${what}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${what}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`)
}

/** Whether running `work` threw, which is what a refused wire call must do. */
function throws(work: () => unknown): boolean {
  try {
    work()
    return false
  } catch {
    return true
  }
}

/** Whether running `work` rejected, which is what a refused read must do. */
async function rejects(work: () => Promise<unknown>): Promise<boolean> {
  try {
    await work()
    return false
  } catch {
    return true
  }
}

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
delete process.env[MISSING]

async function main(): Promise<void> {
  console.log("the probe")

  const report = await probeDeclaration({ declaration: stdio() })
  check("a stdio server connects", report.ok, report.ok ? undefined : report.error)
  check(
    "it reports the server's name and version",
    report.serverInfo?.name === "fixture" && report.serverInfo.version === "9.9.9",
    report.serverInfo
  )
  check(
    "it keeps the title and the website",
    report.serverInfo?.title === "Fixture server" &&
      report.serverInfo?.websiteUrl === "https://example.com/fixture"
  )
  check(
    "it keeps the server's own description",
    report.serverInfo?.description === "Echoes text and adds numbers.",
    report.serverInfo
  )
  check(
    "it reports the negotiated protocol version",
    typeof report.protocolVersion === "string" && report.protocolVersion.length > 0,
    report.protocolVersion
  )
  check("it reports the capabilities", report.capabilities?.tools !== undefined)
  check(
    "it reads every page of the tool list",
    report.tools?.map((tool) => tool.name).join(",") === "echo,sum",
    report.tools?.map((tool) => tool.name)
  )
  check(
    "it keeps a tool's input schema",
    (report.tools?.[0]?.inputSchema as { properties?: Record<string, unknown> } | undefined)
      ?.properties?.message !== undefined
  )
  check(
    "it keeps a tool's output schema",
    (report.tools?.[1]?.outputSchema as { required?: string[] } | undefined)?.required?.[0] === "total"
  )
  check("it prefers the data URI icon", report.icon?.src.startsWith("data:image/svg+xml") === true, report.icon)
  check(
    "it keeps the instructions whole",
    report.instructions?.startsWith("mark=") === true && (report.instructions?.length ?? 0) > 2049,
    report.instructions?.length
  )
  check("it keeps the server's stderr", report.stderr?.includes("fixture: ready") === true, report.stderr)
  check("it reports how long it took", typeof report.ms === "number" && report.ms >= 0)

  console.log("environment expansion")

  process.env.CTX_HUB_TEST_MARK = "expanded"
  const expanded = await probeDeclaration({ declaration: stdio({ MARK: "${CTX_HUB_TEST_MARK}" }) })
  check("a set variable reaches the child", expanded.instructions?.startsWith("mark=expanded") === true)
  const fallback = await probeDeclaration({
    declaration: stdio({ MARK: `\${${MISSING}:-fallback}` }),
  })
  check("a default fills a missing variable in", fallback.instructions?.startsWith("mark=fallback") === true)
  const missing = await probeDeclaration({ declaration: stdio({ MARK: `\${${MISSING}}` }) })
  check("an unset variable fails as env", missing.ok === false && missing.error?.kind === "env", missing.error)
  check("and the failure names the variable", missing.error?.params?.name === MISSING, missing.error?.params)

  console.log("failures")

  const gone = await probeDeclaration({
    declaration: { transport: "stdio", command: "ctx-hub-no-such-command", args: [], env: {} },
  })
  check("a command that does not exist fails as spawn", gone.ok === false && gone.error?.kind === "spawn", gone.error)

  const died = await probeDeclaration({ declaration: stdio({ CTX_HUB_FIXTURE_FAIL: "1" }) })
  check("a server that exits at once fails as spawn", died.ok === false && died.error?.kind === "spawn", died.error)
  check("and its stderr is kept", died.stderr?.includes("failing as asked") === true, died.stderr)

  const offline = await probeDeclaration({
    declaration: { transport: "http", url: "http://127.0.0.1:1/mcp", headers: {} },
    timeoutMs: 5_000,
  })
  check(
    "an endpoint that refuses fails as network",
    offline.ok === false && offline.error?.kind === "network",
    offline.error
  )

  console.log("the cache")

  const target = { name: "fixture", declaration: stdio(), scope: "workspace" as const }
  const home = await mkdtemp(path.join(os.tmpdir(), "hub-mcp-cache-"))
  try {
    const cache = createProbeCache({ home })
    const entry = cacheEntryOf(target, report, 1234)
    await cache.record("fixture", entry, ["fixture"])
    check("a recorded answer comes back", (await cache.compare(["fixture"])).fixture?.at === 1234)
    check("and carries the probe version", (await cache.compare(["fixture"])).fixture?.probe === PROBE_VERSION)
    /* A name is what an answer is asked for by: the declaration, the scope and
       the workspace it was probed in are not consulted, so a server whose
       files moved since keeps the answer it has until a person checks again. */
    check("a name with no answer misses", (await cache.compare(["other"])).other === null)

    const file = path.join(cache.root, "cache.json")
    const document = JSON.parse(await readFile(file, "utf8")) as {
      version: number
      servers: Record<string, unknown>
    }
    check("the document is versioned", document.version === 2)
    check("and holds the fixture", "fixture" in document.servers)

    const stray = cacheEntryOf({ declaration: stdio(), scope: "global" }, report, 99)
    await cache.record("stray", stray, ["fixture", "stray"])
    check("a second name is kept while it is listed", (await cache.compare(["stray"])).stray?.at === 99)
    await cache.record("fixture", entry, ["fixture"])
    check("an unlisted name is pruned", (await cache.compare(["stray"])).stray === null)

    await writeFile(
      file,
      JSON.stringify({ version: 2, servers: { fixture: { ...entry, probe: PROBE_VERSION - 1 } } }),
      "utf8"
    )
    check("an answer an older probe wrote misses", (await cache.compare(["fixture"])).fixture === null)
    await writeFile(file, "{ not json", "utf8")
    check("a document this build cannot read is dropped", (await cache.compare(["fixture"])).fixture === null)
    await writeFile(file, JSON.stringify({ version: 2, servers: { fixture: { probe: "x" } } }), "utf8")
    check("an entry of the wrong shape is dropped", (await cache.compare(["fixture"])).fixture === null)
    await writeFile(file, JSON.stringify({ version: 2, servers: { fixture: entry } }), "utf8")
    check("an entry of the right shape reads back", (await cache.compare(["fixture"])).fixture?.at === 1234)
  } finally {
    await rm(home, { recursive: true, force: true })
  }

  console.log("the records file")

  const recordsHome = await mkdtemp(path.join(os.tmpdir(), "hub-mcp-records-"))
  try {
    const records = createRecordStore({ home: recordsHome })
    check("a hub with no records file reads none", (await records.read()) === null)

    const document = [
      { name: "github", mcpServers: { github: { command: "npx" } }, description: "", tags: ["vcs"] },
    ]
    await records.save(document)
    check(
      "a saved document reads back",
      JSON.stringify(await records.read()) === JSON.stringify(document)
    )
    const file = path.join(recordsHome, "mcp", "mcp.json")
    check(
      "it sits at <home>/mcp/mcp.json",
      (await readFile(file, "utf8")).endsWith("\n") && JSON.parse(await readFile(file, "utf8"))[0].name === "github"
    )

    await writeFile(file, "{ not json", "utf8")
    check(
      "a records file that is not JSON is refused, not guessed at",
      await rejects(() => createRecordStore({ home: recordsHome }).read())
    )
  } finally {
    await rm(recordsHome, { recursive: true, force: true })
  }

  /* The state document earlier builds kept the records in. */
  const stateHome = await mkdtemp(path.join(os.tmpdir(), "hub-mcp-state-"))
  try {
    const legacy = path.join(stateHome, "state", "mcp.json")
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
    const adopted = (await createRecordStore({ home: stateHome }).read()) as {
      mcpServers?: Record<string, unknown>
    }[]
    check(
      "a state document's records are carried into the file",
      adopted[0]?.mcpServers?.playwright !== undefined,
      adopted
    )
    check(
      "the carried records land in the file",
      JSON.parse(await readFile(path.join(stateHome, "mcp", "mcp.json"), "utf8")).length === 1
    )
    check("the state document is gone once they are safe", !(await exists(legacy)))
  } finally {
    await rm(stateHome, { recursive: true, force: true })
  }

  console.log("the wire")

  check(
    "a cache call reads",
    readMcpCall({ action: "cache", names: ["github"] }).action === "cache"
  )
  check(
    "a probe call reads",
    readMcpCall({ action: "probe", declaration: { transport: "http", url: "https://x/mcp" }, scope: "workspace" })
      .action === "probe"
  )
  check("an unknown action is refused", throws(() => readMcpCall({ action: "nope" })))
  check("a records call reads", readMcpCall({ action: "records" }).action === "records")
  check(
    "a save call carries its records",
    readMcpCall({ action: "save-records", records: [] }).action === "save-records"
  )
  check("a save call without records is refused", throws(() => readMcpCall({ action: "save-records" })))
  check(
    "a bad scope is refused",
    throws(() =>
      readMcpCall({ action: "probe", declaration: { transport: "stdio", command: "c" }, scope: "elsewhere" })
    )
  )
  check(
    "a stdio declaration without a command is refused",
    throws(() => readMcpCall({ action: "probe", declaration: { transport: "stdio" }, scope: "global" }))
  )
  check("a cache call without names is refused", throws(() => readMcpCall({ action: "cache" })))
  check(
    "and the names it does carry are the ones kept",
    JSON.stringify(
      (readMcpCall({ action: "cache", names: ["github", 7, ""] }) as { names: string[] }).names
    ) === '["github"]'
  )

  console.log(`\n${checked - failures}/${checked} checks passed`)
  if (failures > 0) process.exitCode = 1
}

await main()
