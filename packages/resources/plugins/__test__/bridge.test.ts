/**
 * The plugin bridge's two ends, driven against each other over a real socket.
 *
 * The host half has 136 cases of its own (`library.test.ts`), all of them against
 * the disk library directly. Nothing reached the wire: the route, the action and
 * every parameter name are spelled once by the handler and once by the client,
 * and a name renamed on one side is a refusal the detail pane catches and draws
 * as an empty panel — "this feature does not work" and "this pack has nothing"
 * become the same picture (`docs/memory.md`, the `?action=files&id=` incident).
 *
 * So this mounts the real handler on a real `createHubServer` with a temporary
 * hub home, and asks for every action. The installer tools go through
 * `createRemotePluginTools`, so those calls drive the real client; the reads a
 * panel makes are written out here by hand, because the strings that build them
 * live inside `library.ts` and only become separable once the page's read moves
 * out of its hook.
 */
import { mkdtempSync, promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createHubServer, type HubListener } from "@context-hub/core/host/server"

import { createPluginHandler } from "../handlers.ts"
import { PLUGIN_ROUTE } from "../src/contract.ts"
import { createRemotePluginTools } from "../src/tools.ts"

/** A program no machine has, so the "is it there" question answers no. */
const MISSING = "context-hub-no-such-program-xyz"

/** One pack, as a folder a person picked: paths relative, bytes base64. */
const PACK = "check-pack"
const README = "# check pack\n\nMade by the bridge check.\n"
/** A pack is a directory carrying a manifest; without one it is not a pack. */
const MANIFEST = JSON.stringify({ name: PACK, version: "0.0.1", description: "A fixture." })
const FILES = [
  { path: "README.md", base64: Buffer.from(README, "utf8").toString("base64") },
  {
    path: ".claude-plugin/plugin.json",
    base64: Buffer.from(MANIFEST, "utf8").toString("base64"),
  },
  {
    path: "skills/one/SKILL.md",
    base64: Buffer.from("---\nname: one\ndescription: The first.\n---\n\nBody.\n", "utf8").toString(
      "base64"
    ),
  },
]

let home: string
let listener: HubListener
let base: string

/*
 * A real directory, made while this file is being read rather than in a hook:
 * the table below names it, and a table is built before any hook runs.
 */
const folder = mkdtempSync(path.join(tmpdir(), "context-hub-plugin-bridge-folder-"))

/** One call the bridge must answer, and what its answer must carry. */
interface Call {
  label: string
  path: string
  init?: RequestInit
  /** Keys the answer must carry; empty means the answer is not inspected. */
  keys: readonly string[]
  /** A refusal this call meets on purpose, and what that refusal says. */
  refuses?: RegExp
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

const CALLS: readonly Call[] = [
  { label: "the whole library", path: "?action=list", keys: ["root", "plugins", "missing"] },
  {
    label: "how many of its pictures are remote",
    path: "?action=asset-stats",
    keys: ["remote", "localized"],
  },
  {
    label: "one pack's files, by name",
    path: `?action=files&name=${PACK}`,
    keys: [],
  },
  {
    label: "one pack's files, by directory",
    path: `?action=files&dir=${encodeURIComponent(folder)}`,
    keys: [],
  },
  {
    label: "one file's text, by name",
    path: `?action=file&name=${PACK}&path=README.md`,
    keys: ["text"],
  },
  {
    label: "one file's text, by directory",
    path: `?action=file&dir=${encodeURIComponent(folder)}&path=README.md`,
    keys: ["text"],
  },
  {
    label: "what one pack carries, by name",
    path: `?action=contents&name=${PACK}`,
    keys: ["skills", "commands", "mcp"],
  },
  {
    label: "what one pack carries, by directory",
    path: `?action=contents&dir=${encodeURIComponent(folder)}`,
    keys: ["skills", "commands", "mcp"],
  },
  {
    label: "one of a pack's own pictures",
    path: `?action=raw&dir=${encodeURIComponent(folder)}&path=README.md`,
    keys: [],
  },
  { label: "one pack's tags", path: "", init: post({ action: "tags", name: PACK, tags: ["one"] }), keys: ["root", "plugins"] },
  {
    label: "one pack's pictures",
    path: "",
    init: post({ action: "asset-add", name: PACK, sources: ["https://example.invalid/one.png"] }),
    keys: ["root", "plugins"],
  },
  {
    label: "checking every pack for updates",
    path: "",
    init: post({ action: "check-updates" }),
    keys: ["checked", "outdated", "modified"],
  },
  {
    label: "checking one pack for updates",
    path: "",
    init: post({ action: "check-update", name: PACK }),
    keys: [],
    /* A pack collected from a folder on this machine has no source to ask, and
       the contract says so rather than inventing an answer. The call is here
       anyway: it is the `name` parameter and the action name that are under
       test, and a name that drifted would be refused as a missing one. */
    refuses: /cannot be asked about/,
  },
  {
    label: "writing the marketplace indexes",
    path: "",
    init: post({ action: "sync-marketplace" }),
    keys: ["root"],
  },
]

beforeAll(async () => {
  home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-plugin-bridge-home-"))
  /* The same pack on disk, so the reads that answer "by directory" have one to
     read: those ask about a pack an agent keeps in place rather than one the
     hub holds. */
  await fs.mkdir(path.join(folder, ".claude-plugin"), { recursive: true })
  await fs.writeFile(path.join(folder, "README.md"), README, "utf8")
  await fs.writeFile(path.join(folder, ".claude-plugin", "plugin.json"), MANIFEST, "utf8")
  const server = createHubServer({
    middlewares: [createPluginHandler({ home })],
    log: () => undefined,
  })
  listener = await server.listen()
  base = listener.url

  const collected = await ask(post({ action: "add-folder", name: PACK, files: FILES }))
  expect(collected.status, `the fixture pack could not be collected: ${collected.raw}`).toBe(200)
})

afterAll(async () => {
  await listener.close()
  await fs.rm(home, { recursive: true, force: true })
  await fs.rm(folder, { recursive: true, force: true })
})

/** One request, with its body kept for the failure message. */
async function ask(init?: RequestInit, query = ""): Promise<{
  status: number
  body: unknown
  raw: string
}> {
  const response = await fetch(`${base}${PLUGIN_ROUTE}${query}`, init)
  const raw = await response.text()
  let body: unknown = null
  try {
    body = JSON.parse(raw) as unknown
  } catch {
    /* `?action=raw` answers bytes, which is a real answer and not a failure. */
  }
  return { status: response.status, body, raw }
}

describe("every call the page makes", () => {
  it.each(CALLS)("$label is answered", async (call) => {
    const answer = await ask(call.init, call.path)

    if (call.refuses !== undefined) {
      expect(answer.status, `it answered instead of refusing: ${answer.raw}`).toBe(400)
      expect(String((answer.body as { error?: string }).error)).toMatch(call.refuses)
      return
    }

    /* Not 404 (no such route) and not 405 (wrong method): either would mean the
       two ends disagree about how this call is made. */
    expect(answer.status, `the bridge refused it: ${answer.raw}`).not.toBe(404)
    expect(answer.status, `the bridge refused it: ${answer.raw}`).not.toBe(405)
    expect(answer.status, `the bridge refused it: ${answer.raw}`).toBe(200)
    if (call.keys.length === 0) return
    expect(Object.keys(answer.body as object)).toEqual(expect.arrayContaining([...call.keys]))
  })
})

describe("the tools an installer is handed", () => {
  const tools = () => createRemotePluginTools(base)

  it("names where the library is", async () => {
    expect(await tools().root()).not.toBe("")
  })

  it("answers whether a program is on this machine", async () => {
    expect(await tools().has(MISSING)).toBe(false)
  })

  it("reads what a pack says about itself", async () => {
    /* The client calls this argument `directory` and sends it as `path`; the
       handler reads `path`. Renaming either end to match the other is the
       likeliest way to break it, and this is what would say so. */
    const described = await tools().describe(folder, PACK)
    expect(Object.keys(described)).toEqual(
      expect.arrayContaining(["name", "version", "description"])
    )
  })

  it("runs a program and hands back what it printed", async () => {
    /* A real one, so this proves the arguments reached it as a list rather than
       as one string that was re-parsed. */
    expect(await tools().run(process.execPath, ["--version"])).toMatch(/^v\d+/)
  })
})

describe("a request this bridge does not own", () => {
  it("is passed on rather than answered here", async () => {
    expect((await fetch(`${base}/hub/something-else`)).status).toBe(404)
  })

  it("is not claimed by a path that merely starts with the route", async () => {
    /* `/hub/pluginsX` is not this route. It answers nothing but its own actions
       on one exact path, and this says so if that ever changes. */
    expect((await fetch(`${base}${PLUGIN_ROUTE}X`)).status).toBe(404)
  })
})
