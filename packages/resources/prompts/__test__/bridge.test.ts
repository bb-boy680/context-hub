/**
 * The prompt bridge's two ends, driven against each other over a real socket.
 *
 * Every other test in this package reaches the disk store directly. Nothing
 * reached the *wire*: the handler and `remote-store.ts` each spell the route,
 * the action and every parameter name themselves, and a name that drifts on one
 * side is a 400 the pane catches and draws as an empty library — "this feature
 * does not work" and "this package has nothing" become the same picture
 * (`docs/memory.md`, the `?action=files&id=` incident).
 *
 * So this mounts the real handler on a real `createHubServer`, with a temporary
 * hub home, and makes every call **through the package's own client**. A name
 * that drifts fails here instead of in a browser.
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createHubServer, type HubListener } from "@context-hub/core/host/server"

import { createPromptHandler } from "../handlers.ts"
import { createRemotePromptStore } from "../src/remote-store.ts"
import { PROMPT_ROUTE, type PromptStore } from "../src/store.ts"

/**
 * What a refusal from a name that drifted reads like, on either end.
 *
 * A row that supplies its own parameters can only meet one of these if the two
 * ends disagree: the handler is looking for a name the client did not send, or
 * the path it was sent is not the one it answers on.
 */
const DRIFT =
  /missing |unknown route|unknown action|unsupported method|not found|cannot (GET|POST|PATCH|PUT|DELETE)/i

/** One call the bridge must answer, and what its answer must carry. */
interface Call {
  label: string
  run: (store: PromptStore) => Promise<unknown>
  /** Keys the answer must carry; empty means the answer is not inspected. */
  keys: readonly string[]
}

const CALLS: readonly Call[] = [
  {
    label: "the whole library",
    run: (store) => store.list(),
    keys: ["items", "total", "tags", "root"],
  },
  {
    label: "adding one",
    run: (store) =>
      store.create({ name: "a bridge", description: "made by the check", prompt: "Say it." }),
    keys: ["id", "name", "description", "prompt", "tags"],
  },
  {
    label: "changing one",
    run: async (store) => {
      const made = await store.create({
        name: "before",
        description: "made by the check",
        prompt: "Say it.",
      })
      return store.update(made.id, { name: "after", tags: ["one"] })
    },
    keys: ["id", "name", "tags"],
  },
  {
    label: "taking one out",
    run: async (store) => {
      const made = await store.create({
        name: "doomed",
        description: "made by the check",
        prompt: "Say it.",
      })
      await store.remove(made.id)
      return { ok: true }
    },
    keys: ["ok"],
  },
  {
    label: "recording a pasted address",
    run: async (store) => {
      const made = await store.create({
        name: "picture",
        description: "made by the check",
        prompt: "Say it.",
      })
      return store.addAssetSource(made.id, "https://example.invalid/one.png")
    },
    keys: ["ref", "kind"],
  },
  {
    label: "uploading bytes",
    run: async (store) => {
      const made = await store.create({
        name: "upload",
        description: "made by the check",
        prompt: "Say it.",
      })
      return store.putAsset(made.id, new File([new Uint8Array([1, 2, 3])], "one.png"))
    },
    keys: ["ref", "kind"],
  },
  {
    label: "dropping an uploaded file",
    run: async (store) => {
      const made = await store.create({
        name: "drop",
        description: "made by the check",
        prompt: "Say it.",
      })
      const asset = await store.putAsset(made.id, new File([new Uint8Array([4, 5])], "two.png"))
      await store.deleteAsset(made.id, asset.ref)
      return { ok: true }
    },
    keys: ["ok"],
  },
]

let home: string
let listener: HubListener
let store: PromptStore

beforeAll(async () => {
  home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-prompt-bridge-"))
  const server = createHubServer({
    middlewares: [createPromptHandler({ home })],
    log: () => undefined,
  })
  listener = await server.listen()
  store = createRemotePromptStore(`${listener.url}${PROMPT_ROUTE}`)
})

afterAll(async () => {
  await listener.close()
  await fs.rm(home, { recursive: true, force: true })
})

describe("every call the page makes", () => {
  it.each(CALLS)("$label is answered", async (call) => {
    let answer: unknown
    try {
      answer = await call.run(store)
    } catch (error) {
      const said = error instanceof Error ? error.message : String(error)
      expect(said, `the two ends disagree about this call: ${said}`).not.toMatch(DRIFT)
      throw error
    }
    if (call.keys.length === 0) return
    expect(answer, "the answer is not a JSON object").toBeTypeOf("object")
    expect(Object.keys(answer as object)).toEqual(expect.arrayContaining([...call.keys]))
  })
})

describe("a request this bridge does not own", () => {
  it("is passed on rather than answered here", async () => {
    /* Nothing else is mounted, so the server's own 404 is the proof it was not
       claimed: a handler that owns every path would answer its unknown-route
       refusal instead. */
    const response = await fetch(`${listener.url}/hub/something-else`)
    const body = (await response.json()) as { error?: string }
    expect(response.status).toBe(404)
    expect(body.error).not.toMatch(/unknown route/)
  })

  it("is not claimed by a path that merely starts with the route", async () => {
    /* `/hub/promptsX` is not this route. Matching by prefix would read "X" as a
       row id and answer, which is how a stray path hides. */
    const response = await fetch(`${listener.url}${PROMPT_ROUTE}X`)
    expect(response.status).toBe(404)
  })
})
