/**
 * Behaviour check for the MCP module's own layer: the registry agent
 * extensions register into, the record store, and the merge of records with
 * what the client files hold.
 *
 * Nothing here touches a disk or names a client. A provider is a stub that
 * answers from an in-memory file, which is the point: the module owns the
 * catalog and the screen, and every client is somebody else's plugin.
 *
 * Run from the package: `node scripts/check-mcp.ts`
 */
import { McpError } from "../src/contract.ts"
import type { ExtensionIcon } from "@workspace/extensions"
import type { McpEntry, McpPlace, McpProvider } from "../src/contract.ts"
import type { PlaceFiles } from "@workspace/core/place-files"

import { RECORDS_KEY, buildCatalog, placesOf, readRecords, scanPlaces, upsert } from "../src/catalog.ts"
import type { McpCacheEntry } from "../src/probe.ts"
import { createMcpService } from "../src/registry.ts"
import { toolTree } from "../src/schema-tree.ts"

/** A stand-in for the icon a contributing extension declares. */
const MARK: ExtensionIcon = () => null

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

/** A client file held in memory, with the roots an edit would resolve against. */
function memory(files: Record<string, string>): PlaceFiles {
  const key = (place: { scope: string; file: string }) => `${place.scope}:${place.file}`
  return {
    async read(place) {
      return files[key(place)] ?? null
    },
    async write(place, text) {
      files[key(place)] = text
    },
    async remove(place) {
      delete files[key(place)]
    },
    async workspace() {
      return "D:/ws"
    },
  }
}

/** A client that answers from a table of entries, which is all this layer needs. */
function provider(options: {
  id: string
  places: McpPlace[]
  entries: Record<string, McpEntry[]>
  failing?: string[]
}): McpProvider {
  return {
    id: options.id,
    places: options.places,
    async read(_io, place) {
      if ((options.failing ?? []).includes(place)) throw new McpError("stub.error.read", { place })
      return options.entries[place] ?? []
    },
    async install() {},
    async uninstall() {},
  }
}

const PLACES: McpPlace[] = [
  { id: "a-global", label: "A", scope: "global", file: ".a.json", order: 30 },
  { id: "a-project", label: "A", scope: "workspace", file: ".a.json", order: 10 },
]

const STDIO = { transport: "stdio", command: "npx", args: ["-y", "@x/github"], env: {} } as const
const OWN = { transport: "stdio", command: "npx", args: ["-y", "@x/ours"], env: {} } as const

async function main(): Promise<void> {
  console.log("the service")

  const service = createMcpService()
  check("it carries the toolkit", typeof service.tools.editJson === "function")
  check("and a TOML reader for a client that needs one", typeof service.tools.parseToml === "function")

  console.log("the registry")

  const registry = service.registry
  check("it starts with nothing registered", registry.providers().length === 0)
  const first = provider({ id: "a", places: PLACES, entries: {} })
  const stop = registry.register(first)
  check("a registered provider is listed", registry.providers().length === 1)
  const second = provider({ id: "b", places: PLACES, entries: {} })
  registry.register(second)
  check("a second one joins it in order", registry.providers()[1]?.id === "b")
  stop()
  check(
    "its disposer takes it back out",
    registry.providers().length === 1 && registry.providers()[0]?.id === "b"
  )

  console.log("places")

  const places = placesOf([provider({ id: "b", places: PLACES, entries: {} })], () => MARK)
  check("global places come first", places[0]?.place.id === "a-global", places.map((entry) => entry.place.id))
  check("each scope is ranked by its own order", places[1]?.place.id === "a-project")
  check("a place reads as a person would see it", places[0]?.place.path === "~/.a.json")
  check("a workspace place keeps its relative path", places[1]?.place.path === ".a.json")
  check("a client with no switch is marked as such", places[0]?.place.switchable === false)
  check(
    "one that has a switch is marked too",
    placesOf([{ ...provider({ id: "c", places: PLACES, entries: {} }), async setEnabled() {} }], () => MARK)[0]?.place
      .switchable === true
  )

  console.log("scanning")

  const files = memory({})
  const entries = {
    "a-global": [{ name: "github", declaration: STDIO, enabled: true }],
    "a-project": [
      { name: "github", declaration: STDIO, enabled: false },
      { name: "odd", declaration: null, enabled: true },
    ],
  }
  const scan = await scanPlaces(
    placesOf([provider({ id: "a", places: PLACES, entries, failing: ["a-project"] })], () => MARK),
    files,
    () => undefined
  )
  check(
    "a file that cannot be read is reported",
    scan.problems.length === 1 && scan.problems[0]?.place === "a-project",
    scan.problems
  )
  check("and it is named by the extension's own key", scan.problems[0]?.failure.key === "stub.error.read")
  check("it carries what the extension said about the place", scan.problems[0]?.failure.params?.place === "a-project")
  check("the other file is read", scan.entries.get("a-global")?.length === 1)

  const read = await scanPlaces(
    placesOf([provider({ id: "a", places: PLACES, entries })], () => MARK),
    files,
    () => undefined
  )
  check("a clean scan reports nothing", read.problems.length === 0)

  console.log("the catalog")

  const records = [
    { name: "github", declaration: STDIO, description: "Their server", tags: ["vcs"] },
    { name: "ours", declaration: OWN, description: "", tags: [] },
  ]
  const catalog = buildCatalog(records, read, places, [], 1_700_000_000_000)
  const github = catalog.servers.find((server) => server.name === "github")
  check("a recorded server is a row", github !== undefined)
  check("a discovered server is a row too", catalog.servers.some((server) => server.name === "ours"))
  check("a name only a file knows is a row as well", catalog.servers.some((server) => server.name === "odd"))
  check("rows are ordered by name", catalog.servers.map((server) => server.name).join(",") === "github,odd,ours")
  check("the record's sentence reaches the row", github?.description === "Their server")
  check("its first tag is the row's tag", github?.tag === "vcs")
  check("a name that reads as a brand gets its mark", github?.mark === "github")
  check("one that does not stays generic", catalog.servers.find((server) => server.name === "ours")?.mark === "generic")
  check("both places count as installs", github?.installed === 2)
  check("the scopes it is declared in are known", github?.places.join(",") === "global,workspace")
  check(
    "an entry that cannot be read makes the row unreadable",
    catalog.servers.find((server) => server.name === "odd")?.unreadable === 1
  )
  check("and that row is not ready", catalog.servers.find((server) => server.name === "odd")?.status === "failed")
  check("a row nobody declares yet has no installs", catalog.servers.find((server) => server.name === "ours")?.installed === 0)
  check("the scan's time travels with it", catalog.scannedAt === 1_700_000_000_000)
  check("the record's declaration is what the row shows", github?.declaration === "npx -y @x/github", github?.declaration)
  check("a row's detail keeps the declaration a form edits", github?.detail.declaration?.command === "npx")

  /* Two files that disagree about the endpoint: the row says so. */
  const split = await scanPlaces(
    placesOf([
      provider({
        id: "a",
        places: PLACES,
        entries: {
          "a-global": [{ name: "github", declaration: STDIO, enabled: true }],
          "a-project": [
            {
              name: "github",
              declaration: { transport: "http", url: "https://x/mcp", headers: {} },
              enabled: true,
            },
          ],
        },
      }),
    ], () => MARK),
    files,
    () => undefined
  )
  const conflicted = buildCatalog([], split, places, [], 1).servers[0]
  check("copies that differ are counted", conflicted?.conflicts === 2, conflicted?.conflicts)
  check("and the row fails", conflicted?.status === "failed")
  check("a row with no record still shows a declaration", conflicted?.declaration !== "")

  /* What a row says about the server: the record's sentence, else what the
     probe heard the server say about itself. */
  console.log("the description a row shows")

  const probed = (fields: Partial<McpCacheEntry>): Record<string, McpCacheEntry | null> => ({
    github: {
      ok: true,
      ms: 1,
      at: 1,
      probe: 1,
      fingerprint: "sha256:x",
      target: "npx",
      scope: "workspace",
      ...fields,
    },
  })
  const rowDescription = (description: string, fields: Partial<McpCacheEntry>) =>
    buildCatalog(
      [{ name: "github", declaration: STDIO, description, tags: [] }],
      split,
      places,
      [],
      1,
      probed(fields)
    ).servers[0]?.description

  const described = { serverInfo: { name: "github", version: "1", description: "The server's own sentence" } }
  check("the recorded sentence wins over the server's", rowDescription("Written here", described) === "Written here")
  check("the server's own description fills in", rowDescription("", described) === "The server's own sentence")
  check("the instructions fill in when nothing else does", rowDescription("", { instructions: "A hint" }) === "A hint")
  check("and with nothing to say the row stays empty", rowDescription("", {}) === "")

  console.log("the tool tree")

  const tree = toolTree({
    name: "sum",
    title: "Sum",
    description: "Adds two numbers.",
    inputSchema: {
      type: "object",
      description: "what goes in",
      properties: { message: { type: "string", title: "The message" } },
      required: ["message"],
    },
    outputSchema: {
      type: "object",
      properties: { total: { type: "number", description: "The sum" } },
    },
  })
  check("the input schema's own sentence is kept", tree.inputDescription === "what goes in")
  check("a field's title stands in for its missing description", tree.input[0]?.description === "The message")
  check("a field's description wins over a title", tree.output[0]?.description === "The sum")
  check(
    "a schema that says nothing about itself is an empty sentence",
    toolTree({ name: "x", inputSchema: { type: "object", properties: {} } }).outputDescription === ""
  )

  console.log("the records a form stores")

  check("an empty document holds none", readRecords(null).length === 0)
  check("something that is not a list holds none", readRecords({ servers: [] }).length === 0)
  check(
    "a value that is not a record is left out",
    readRecords([{ name: "x" }, "nope", null, { name: "ok", declaration: STDIO }]).length === 1
  )
  check(
    "a record's missing fields are filled in",
    JSON.stringify(readRecords([{ name: "ok", declaration: STDIO }])[0]) ===
      JSON.stringify({ name: "ok", declaration: STDIO, description: "", tags: [] })
  )
  check("the key it lives under is the module's own", RECORDS_KEY === "mcp")
  check(
    "adding a record replaces the one with its name",
    upsert([{ name: "a", declaration: STDIO, description: "old", tags: [] }], {
      name: "a",
      declaration: STDIO,
      description: "new",
      tags: [],
    }).length === 1
  )
  check(
    "and a new name is added beside it",
    upsert([{ name: "a", declaration: STDIO, description: "", tags: [] }], {
      name: "b",
      declaration: STDIO,
      description: "",
      tags: [],
    }).length === 2
  )

  console.log(`\n${checked - failures}/${checked} checks passed`)
  if (failures > 0) process.exitCode = 1
}

await main()
