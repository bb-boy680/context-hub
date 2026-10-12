/**
 * Behaviour check for probing: the fixture stdio server the probe must read
 * correctly, the error vocabulary it must classify, the fingerprint's hit and
 * miss rules, and the cache's prune and read-back rules.
 *
 * The probe runs real processes and hits a real (closed) port, so this is an
 * end-to-end check of the module and not of a stub.
 *
 * Run from the package: `node scripts/check-probe.ts`
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import type { McpDeclaration } from "../src/declaration.ts"
import { PROBE_VERSION, cacheEntryOf, createProbeCache, fingerprintOf } from "../src/host/cache.ts"
import { probeDeclaration } from "../src/host/probe.ts"
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

  console.log("the fingerprint")

  const target = { name: "fixture", declaration: stdio(), scope: "workspace" as const, cwd: null }
  check("the same server fingerprints the same", fingerprintOf(target) === fingerprintOf({ ...target }))
  check(
    "a changed argument changes it",
    fingerprintOf(target) !== fingerprintOf({ ...target, declaration: stdio({}, [FIXTURE, "--x"]) })
  )
  check("a changed working directory changes it", fingerprintOf(target) !== fingerprintOf({ ...target, cwd: "D:/ws" }))
  check("another scope changes it", fingerprintOf(target) !== fingerprintOf({ ...target, scope: "global" }))
  const orderA: McpDeclaration = { transport: "stdio", command: "c", args: [], env: { A: "1", B: "2" } }
  const orderB: McpDeclaration = { transport: "stdio", command: "c", args: [], env: { B: "2", A: "1" } }
  check(
    "key order does not change it",
    fingerprintOf({ ...target, declaration: orderA }) === fingerprintOf({ ...target, declaration: orderB })
  )

  console.log("the cache")

  const home = await mkdtemp(path.join(os.tmpdir(), "hub-mcp-cache-"))
  try {
    const cache = createProbeCache({ home })
    const entry = cacheEntryOf(target, report, 1234)
    await cache.record("fixture", entry, ["fixture"])
    check("a recorded answer comes back", (await cache.compare([target])).fixture?.at === 1234)
    check("and carries the probe version", (await cache.compare([target])).fixture?.probe === PROBE_VERSION)
    check(
      "another declaration misses",
      (await cache.compare([{ ...target, declaration: stdio({}, [FIXTURE, "--x"]) }])).fixture === null
    )
    check("another scope misses", (await cache.compare([{ ...target, scope: "global" }])).fixture === null)
    check("an unknown name misses", (await cache.compare([{ ...target, name: "other" }])).other === null)

    const file = path.join(cache.root, "cache.json")
    const document = JSON.parse(await readFile(file, "utf8")) as {
      version: number
      servers: Record<string, unknown>
    }
    check("the document is versioned", document.version === 1)
    check("and holds the fixture", "fixture" in document.servers)

    const stray = cacheEntryOf({ ...target, name: "stray" }, report, 99)
    await cache.record("stray", stray, ["fixture", "stray"])
    check(
      "a second name is kept while it is listed",
      (await cache.compare([{ ...target, name: "stray" }])).stray?.at === 99
    )
    await cache.record("fixture", entry, ["fixture"])
    check("an unlisted name is pruned", (await cache.compare([{ ...target, name: "stray" }])).stray === null)

    await writeFile(file, "{ not json", "utf8")
    check("a document this build cannot read is dropped", (await cache.compare([target])).fixture === null)
    await writeFile(file, JSON.stringify({ version: 1, servers: { fixture: { probe: "x" } } }), "utf8")
    check("an entry of the wrong shape is dropped", (await cache.compare([target])).fixture === null)
    await writeFile(file, JSON.stringify({ version: 1, servers: { fixture: entry } }), "utf8")
    check("an entry of the right shape reads back", (await cache.compare([target])).fixture?.at === 1234)
  } finally {
    await rm(home, { recursive: true, force: true })
  }

  console.log("the wire")

  check(
    "a cache call reads",
    readMcpCall({
      action: "cache",
      servers: [{ name: "x", declaration: { transport: "stdio", command: "c" }, scope: "global" }],
    }).action === "cache"
  )
  check(
    "a probe call reads",
    readMcpCall({ action: "probe", declaration: { transport: "http", url: "https://x/mcp" }, scope: "workspace" })
      .action === "probe"
  )
  check("an unknown action is refused", throws(() => readMcpCall({ action: "nope" })))
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
  check(
    "a query without a name is refused",
    throws(() =>
      readMcpCall({
        action: "cache",
        servers: [{ declaration: { transport: "stdio", command: "c" }, scope: "global" }],
      })
    )
  )

  console.log(`\n${checked - failures}/${checked} checks passed`)
  if (failures > 0) process.exitCode = 1
}

await main()
