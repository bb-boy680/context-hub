/**
 * Behaviour of the MCP module's own layer: the registry agent extensions
 * register into, the record store, and the merge of records with what the client
 * files hold.
 *
 * Nothing here touches a disk or names a client. A provider is a stub that
 * answers from an in-memory file, which is the point: the module owns the
 * catalog and the screen, and every client is somebody else's plugin.
 */
import { Context } from "@deepseek-ai/cordis"
import { beforeAll, describe, expect, it } from "vitest"

import type { PlaceFiles } from "@context-hub/core/place-files"
import type { ExtensionIcon } from "@context-hub/extensions"

import { buildCatalog, placesOf, scanPlaces } from "../src/catalog.ts"
import type { McpScan, ScannedPlace } from "../src/catalog.ts"
import { McpError } from "../src/contract.ts"
import type {
  McpDeclaration,
  McpEntry,
  McpPlace,
  McpProvider,
  McpRemoteDeclaration,
  McpStdioDeclaration,
} from "../src/contract.ts"
import type { McpCacheEntry } from "../src/probe.ts"
import { McpService } from "../src/provider.ts"
import { documentOf, readRecords, recordsFromState, upsert } from "../src/records.ts"
import { toolTree } from "../src/schema-tree.ts"
import type { McpServer } from "../src/types.ts"

/** A stand-in for the icon a contributing extension declares. */
const MARK: ExtensionIcon = () => null

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
  { id: "a-global", label: "A", scope: "global", file: ".a.json", switchable: false },
  { id: "a-project", label: "A", scope: "workspace", file: ".a.json", switchable: true },
]

/* A second client, whose workspace place is declared before its global one: the
   scope decides where each lands, never the order its extension wrote. */
const OTHER: McpPlace[] = [
  { id: "c-project", label: "C", scope: "workspace", file: ".c.json", switchable: false },
  { id: "c-global", label: "C", scope: "global", file: ".c.json", switchable: false },
]

/* Written with the declaration's own type rather than `as const`: a readonly
   `args` is not the `string[]` a declaration promises. */
const STDIO: McpStdioDeclaration = {
  transport: "stdio",
  command: "npx",
  args: ["-y", "@x/github"],
  env: {},
}
const OWN: McpStdioDeclaration = {
  transport: "stdio",
  command: "npx",
  args: ["-y", "@x/ours"],
  env: {},
}

/** A declaration is a union of how the server is reached; this asks for one half. */
const stdioOf = (
  declaration: McpDeclaration | null | undefined
): McpStdioDeclaration | undefined =>
  declaration != null && declaration.transport === "stdio" ? declaration : undefined

/* The client files a scan reads: nothing here ever writes one. */
const files = memory({})
const entries = {
  "a-global": [{ name: "github", declaration: STDIO, enabled: true }],
  "a-project": [
    { name: "github", declaration: STDIO, enabled: false },
    { name: "odd", declaration: null, enabled: true },
  ],
}

const records = [
  { name: "github", declaration: STDIO, description: "Their server", tags: ["vcs"] },
  { name: "ours", declaration: OWN, description: "", tags: [] },
]

let service: McpService
/** Every place the fixture client declares, as the page lists them. */
let places: ScannedPlace[]
/** A clean scan of the fixture files. */
let read: McpScan
/** A second scan, where two files disagree about github's endpoint. */
let split: McpScan

beforeAll(async () => {
  /* A bare context is enough: the service publishes itself on construction, and
     what is under test is the registry it holds, not the kernel around it. */
  service = new McpService(new Context())
  places = placesOf([provider({ id: "b", places: PLACES, entries: {} })], () => MARK)
  read = await scanPlaces(
    placesOf([provider({ id: "a", places: PLACES, entries })], () => MARK),
    files,
    () => undefined
  )
  split = await scanPlaces(
    placesOf(
      [
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
      ],
      () => MARK
    ),
    files,
    () => undefined
  )
})

describe("the service", () => {
  it("carries the toolkit and a TOML reader for a client that needs one", () => {
    expect(typeof service.tools.editJson, "it carries the toolkit").toBe("function")
    expect(typeof service.tools.parseToml, "and a TOML reader for a client that needs one").toBe(
      "function"
    )
  })
})

describe("the registry", () => {
  it("starts with nothing registered", () => {
    expect(service.providers(), "it starts with nothing registered").toEqual([])
  })

  /* Registration order is the order the page lists providers in, and a
     disposer gives back exactly the provider it was handed. */
  it("lists what was registered, in order, and gives one back on dispose", () => {
    const stop = service.register(provider({ id: "a", places: PLACES, entries: {} }))
    expect(service.providers(), "a registered provider is listed").toHaveLength(1)

    service.register(provider({ id: "b", places: PLACES, entries: {} }))
    expect(service.providers()[1]?.id, "a second one joins it in order").toBe("b")

    stop()
    expect(service.providers(), "its disposer takes it back out").toHaveLength(1)
    expect(service.providers()[0]?.id, "leaving the one it did not register").toBe("b")
  })
})

describe("places", () => {
  it("lists every global place before the workspace ones", () => {
    expect(places[0]?.place.id, "global places come first").toBe("a-global")
    expect(places[1]?.place.id, "the workspace place follows it").toBe("a-project")
  })

  it("reads as a person would see it, with a workspace path left relative", () => {
    expect(places[0]?.place.path, "a place reads as a person would see it").toBe("~/.a.json")
    expect(places[1]?.place.path, "a workspace place keeps its relative path").toBe(".a.json")
  })

  it("carries the client's own switch, whatever it says", () => {
    expect(places[0]?.place.switchable, "a client with no switch is marked as such").toBe(false)
    expect(places[1]?.place.switchable, "one that has a switch is marked too").toBe(true)
  })

  it("keeps the registry's order within each scope", () => {
    const merged = placesOf(
      [
        provider({ id: "b", places: PLACES, entries: {} }),
        provider({ id: "c", places: OTHER, entries: {} }),
      ],
      () => MARK
    )
    expect(merged.map((entry) => entry.place.id), "each scope keeps the registry's order").toEqual([
      "a-global",
      "c-global",
      "a-project",
      "c-project",
    ])
  })
})

describe("scanning", () => {
  let scan: McpScan

  beforeAll(async () => {
    scan = await scanPlaces(
      placesOf(
        [provider({ id: "a", places: PLACES, entries, failing: ["a-project"] })],
        () => MARK
      ),
      files,
      () => undefined
    )
  })

  it("reports a file that cannot be read against its place", () => {
    expect(scan.problems, "a file that cannot be read is reported").toHaveLength(1)
    expect(scan.problems[0]?.place, "and it is named by the place it failed in").toBe("a-project")
  })

  it("names the failure by the extension's own key", () => {
    expect(scan.problems[0]?.failure.key, "and it is named by the extension's own key").toBe(
      "stub.error.read"
    )
    expect(
      scan.problems[0]?.failure.params?.place,
      "it carries what the extension said about the place"
    ).toBe("a-project")
  })

  it("reads the other file", () => {
    expect(scan.entries.get("a-global"), "the other file is read").toHaveLength(1)
  })

  it("reports nothing for a clean scan", () => {
    expect(read.problems, "a clean scan reports nothing").toEqual([])
  })
})

describe("the catalog", () => {
  let catalog: ReturnType<typeof buildCatalog>
  let github: McpServer | undefined
  let odd: McpServer | undefined
  let ours: McpServer | undefined

  beforeAll(() => {
    catalog = buildCatalog(records, read, places, [], 1_700_000_000_000)
    const byName = (name: string) => catalog.servers.find((server) => server.name === name)
    github = byName("github")
    odd = byName("odd")
    ours = byName("ours")
  })

  it("makes a row of a recorded server", () => {
    expect(github, "a recorded server is a row").toBeDefined()
  })

  it("makes a row of a discovered server and of a name only a file knows", () => {
    const names = catalog.servers.map((server) => server.name)
    expect(names, "a discovered server is a row too").toContain("ours")
    expect(names, "a name only a file knows is a row as well").toContain("odd")
  })

  it("orders the rows by name", () => {
    expect(catalog.servers.map((server) => server.name), "rows are ordered by name").toEqual([
      "github",
      "odd",
      "ours",
    ])
  })

  it("carries the record's own sentence onto the row", () => {
    expect(github?.description, "the record's sentence reaches the row").toBe("Their server")
  })

  it("marks a record as the hub's own and a file-only name as not", () => {
    expect(github?.stored, "a record puts the server in the hub's own library").toBe(true)
    expect(odd?.stored, "a name only a file knows is not in it").toBe(false)
  })

  it("takes the first tag, and the mark a brand name earns", () => {
    expect(github?.tag, "its first tag is the row's tag").toBe("vcs")
    expect(github?.mark, "a name that reads as a brand gets its mark").toBe("github")
    expect(ours?.mark, "one that does not stays generic").toBe("generic")
  })

  it("counts both places as installs, each naming the file holding it", () => {
    expect(github?.installed, "both places count as installs").toBe(2)
    expect(
      github?.detail.installs.map((install) => install.place),
      "each install names the file holding it"
    ).toEqual(["a-global", "a-project"])
  })

  it("counts an entry that cannot be read and fails the row", () => {
    expect(odd?.unreadable, "an entry that cannot be read makes the row unreadable").toBe(1)
    expect(odd?.status, "and that row is not ready").toBe("failed")
  })

  it("leaves a row nobody declares yet with no installs", () => {
    expect(ours?.installed, "a row nobody declares yet has no installs").toBe(0)
  })

  it("carries the scan's time with it", () => {
    expect(catalog.scannedAt, "the scan's time travels with it").toBe(1_700_000_000_000)
  })

  it("shows the record's declaration, and keeps the one a form edits in the detail", () => {
    expect(github?.declaration, "the record's declaration is what the row shows").toBe(
      "npx -y @x/github"
    )
    expect(
      stdioOf(github?.detail.declaration)?.command,
      "a row's detail keeps the declaration a form edits"
    ).toBe("npx")
  })

  /* Two files that disagree about the endpoint: the row says so. */
  describe("two files that disagree about the endpoint", () => {
    let conflicted: McpServer | undefined

    beforeAll(() => {
      conflicted = buildCatalog([], split, places, [], 1).servers[0]
    })

    it("counts the copies, fails the row, and still shows a declaration", () => {
      expect(conflicted?.conflicts, "copies that differ are counted").toBe(2)
      expect(conflicted?.status, "and the row fails").toBe("failed")
      expect(conflicted?.declaration, "a row with no record still shows a declaration").not.toBe("")
    })
  })
})

/* What a row says about the server: the record's sentence, else what the probe
   heard the server say about itself. */
describe("the description a row shows", () => {
  const probed = (fields: Partial<McpCacheEntry>): Record<string, McpCacheEntry | null> => ({
    github: {
      ok: true,
      ms: 1,
      at: 1,
      probe: 1,
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

  const described = {
    serverInfo: { name: "github", version: "1", description: "The server's own sentence" },
  }

  it("prefers the sentence written in the hub", () => {
    expect(
      rowDescription("Written here", described),
      "the recorded sentence wins over the server's"
    ).toBe("Written here")
  })

  it("fills in from the server's own description", () => {
    expect(rowDescription("", described), "the server's own description fills in").toBe(
      "The server's own sentence"
    )
  })

  it("fills in from the instructions when nothing else does, and stays empty with nothing to say", () => {
    expect(
      rowDescription("", { instructions: "A hint" }),
      "the instructions fill in when nothing else does"
    ).toBe("A hint")
    expect(rowDescription("", {}), "and with nothing to say the row stays empty").toBe("")
  })
})

describe("the tool tree", () => {
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

  it("keeps the input schema's own sentence", () => {
    expect(tree.inputDescription, "the input schema's own sentence is kept").toBe("what goes in")
  })

  it("lets a field's title stand in for its missing description", () => {
    expect(tree.input[0]?.description, "a field's title stands in for its missing description").toBe(
      "The message"
    )
  })

  it("lets a field's description win over its title", () => {
    expect(tree.output[0]?.description, "a field's description wins over a title").toBe("The sum")
  })

  it("reads a schema that says nothing about itself as an empty sentence", () => {
    expect(
      toolTree({ name: "x", inputSchema: { type: "object", properties: {} } }).outputDescription,
      "a schema that says nothing about itself is an empty sentence"
    ).toBe("")
  })
})

describe("the records a form stores", () => {
  const REMOTE: McpRemoteDeclaration = {
    transport: "sse",
    url: "https://mcp.example.com/sse",
    headers: { Authorization: "Bearer x" },
  }
  const record = { name: "github", declaration: STDIO, description: "", tags: ["vcs"] }
  const stored = documentOf(record)

  it("stores a record under its own name", () => {
    expect(Object.keys(stored.mcpServers)[0], "a record is stored under its own name").toBe("github")
  })

  it("writes the entry in the shape a client file holds", () => {
    expect(
      stored.mcpServers.github,
      "the entry is the shape a client file holds"
    ).toEqual({ command: "npx", args: ["-y", "@x/github"] })
  })

  it("carries the notes around the entry", () => {
    expect(stored.description, "the notes around it travel with it").toBe("")
    expect(stored.tags, "the entry's tags travel too").toEqual(["vcs"])
  })

  it("reads back the record it was written from", () => {
    expect(readRecords([stored])[0], "reading it back gives the record").toEqual(record)
  })

  it("keeps sse a transport of its own, so it does not read back as http", () => {
    expect(
      readRecords([documentOf({ name: "x", declaration: REMOTE, description: "", tags: [] })])[0]
        ?.declaration.transport,
      "an sse server names its transport, so it does not read back as http"
    ).toBe("sse")
  })

  it("reads a client's own spelling of a remote server", () => {
    expect(
      readRecords([
        { name: "x", mcpServers: { x: { type: "streamable-http", url: "https://a/b" } } },
      ])[0]?.declaration.transport,
      "a client's own spelling of a remote server reads too"
    ).toBe("http")
  })

  it("holds nothing for a document that is empty or is not a record", () => {
    expect(readRecords(null), "an empty document holds none").toHaveLength(0)
    expect(readRecords({ servers: [] }), "something that is not a record holds none").toHaveLength(0)
    expect(
      readRecords([{ name: "x" }, "nope", null, stored]),
      "a value that is not a record is left out"
    ).toHaveLength(1)
  })

  it("leaves out an entry keyed under another name", () => {
    expect(
      readRecords([{ name: "a", mcpServers: { b: { command: "npx" } } }]),
      "an entry keyed under another name is left out"
    ).toHaveLength(0)
  })

  it("reads a file holding one server as that one object", () => {
    expect(readRecords(stored), "a file with one server may be that one object").toHaveLength(1)
  })

  it("fills in a record's missing fields", () => {
    expect(readRecords([{ name: "ok", mcpServers: { ok: STDIO } }])[0], "a record's missing fields are filled in").toEqual(
      { name: "ok", declaration: STDIO, description: "", tags: [] }
    )
  })

  it("carries over records an earlier build kept in the state document", () => {
    expect(
      recordsFromState([{ name: "ok", declaration: REMOTE, description: "d", tags: ["t"] }])[0]
        ?.declaration.transport,
      "records an earlier build kept in the state document are carried over"
    ).toBe("sse")
  })

  it("carries nothing from a state entry that names no declaration", () => {
    expect(
      recordsFromState([{ name: "ok" }, "nope", null]),
      "a state entry that names no declaration carries nothing"
    ).toHaveLength(0)
  })

  it("replaces the record with the same name and adds a new one beside it", () => {
    expect(
      upsert([{ name: "a", declaration: STDIO, description: "old", tags: [] }], {
        name: "a",
        declaration: STDIO,
        description: "new",
        tags: [],
      }),
      "adding a record replaces the one with its name"
    ).toHaveLength(1)
    expect(
      upsert([{ name: "a", declaration: STDIO, description: "", tags: [] }], {
        name: "b",
        declaration: STDIO,
        description: "",
        tags: [],
      }),
      "and a new name is added beside it"
    ).toHaveLength(2)
  })
})
