/**
 * The core bridge's routes, driven against a real socket.
 *
 * `server.test.ts` covers the *shell* — the port, the chain, the static root,
 * what happens when a bridge throws. Its bridges are stand-ins. This one mounts
 * the real handlers on a temporary hub home and asks each route for what it
 * answers, so a route that stops being reachable, or a body field renamed on one
 * side of the wire, fails here rather than in a browser.
 *
 * The three routes that carry a name in the path (`files`, `extensions`,
 * `state`) stay in that shape: a name is an address, and nothing here wraps it
 * in an action. What is asserted for them is reachability and the refusal shape,
 * which is what `docs/memory.md`'s `?action=files&id=` incident was missing.
 *
 * `net` is exercised as a refusal. It fetches only public `https`, and a suite
 * that reaches the network is a suite that fails when the network does — the
 * refusal still proves the route read the `url` it was sent.
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createHubServer, type HubListener } from "@context-hub/core/host/server"

import {
  createAboutHandler,
  createAssetHandler,
  createExtensionHandler,
  createNetHandler,
  createStateHandler,
} from "../handlers.ts"
import { ABOUT_ROUTE } from "../src/about.ts"
import { ASSET_ROUTE } from "../src/assets.ts"
import { EXTENSION_ROUTE } from "../src/plugins.ts"
import { NET_ROUTE, createRemoteNet } from "../src/net.ts"
import { STATE_ROUTE } from "../src/state.ts"
import { displayPath } from "../src/host/home.ts"

const PACK_ID = "check.plugin"
const MANIFEST = JSON.stringify({ id: PACK_ID, name: "Check", version: "0.0.1" })
const BYTES = "the bytes this route serves\n"

let home: string
let listener: HubListener
let base: string

beforeAll(async () => {
  home = await fs.mkdtemp(path.join(tmpdir(), "context-hub-core-bridge-"))
  /* The fixtures come first: the extension store migrates the old directory as
     it is constructed, so one built before these exist would move nothing. */
  await fs.mkdir(path.join(home, "assets"), { recursive: true })
  await fs.writeFile(path.join(home, "assets", "check.txt"), BYTES, "utf8")
  await fs.mkdir(path.join(home, "extensions", PACK_ID), { recursive: true })
  await fs.writeFile(path.join(home, "extensions", PACK_ID, "plugin.json"), MANIFEST, "utf8")
  await fs.writeFile(path.join(home, "extensions", PACK_ID, "index.js"), "export default 1\n", "utf8")

  const server = createHubServer({
    middlewares: [
      createAssetHandler({ home }),
      createStateHandler({ home, log: () => undefined }),
      createAboutHandler({ version: "9.9.9", home }),
      createExtensionHandler({ home }),
      createNetHandler(),
    ],
    log: () => undefined,
  })
  listener = await server.listen()
  base = listener.url
})

afterAll(async () => {
  await listener.close()
  await fs.rm(home, { recursive: true, force: true })
})

const at = (route: string) => `${base}${route}`

describe("the about read", () => {
  it("names this build and this machine's hub home", async () => {
    const response = await fetch(at(ABOUT_ROUTE))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      version: "9.9.9",
      home: displayPath(home),
    })
  })

  it("does not answer for a path that merely starts with it", async () => {
    const response = await fetch(at(`${ABOUT_ROUTE}X`))
    expect(response.status).toBe(404)
  })
})

describe("the state documents", () => {
  it("are listed, written and read back", async () => {
    const before = await fetch(at(STATE_ROUTE))
    expect(before.status).toBe(200)
    expect(await before.json()).toBeTypeOf("object")

    const held = { skills: true, "zh-cn": false }
    const written = await fetch(at(`${STATE_ROUTE}/extensions`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(held),
    })
    expect(written.status).toBe(200)
    expect(await written.json()).toEqual({ ok: true })

    const after = (await (await fetch(at(STATE_ROUTE))).json()) as Record<string, unknown>
    expect(after.extensions).toEqual(held)
  })
})

describe("a stored file", () => {
  it("is served as the bytes it is", async () => {
    /* The reference a stored asset carries already starts with `assets/`, and
       the route resolves it against the hub home. */
    const response = await fetch(at(`${ASSET_ROUTE}/assets/check.txt`))
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(BYTES)
  })

  it("is refused as missing, not as markup", async () => {
    const response = await fetch(at(`${ASSET_ROUTE}/assets/gone.txt`))
    expect(response.status).toBe(404)
  })
})

describe("the installed extensions", () => {
  it("are listed by id", async () => {
    const response = await fetch(at(EXTENSION_ROUTE))
    expect(response.status).toBe(200)
    expect((await response.json()) as { ids?: string[] }).toMatchObject({ ids: [PACK_ID] })
  })

  it("answer for their own manifest", async () => {
    const response = await fetch(at(`${EXTENSION_ROUTE}/${PACK_ID}`))
    expect(response.status).toBe(200)
    expect((await response.json()) as { id?: string }).toMatchObject({ id: PACK_ID })
  })

  it("serve a file inside them", async () => {
    const response = await fetch(at(`${EXTENSION_ROUTE}/${PACK_ID}/index.js`))
    expect(response.status).toBe(200)
    expect(await response.text()).toContain("export default")
  })
})

describe("the network proxy", () => {
  it("reads the url it was sent, and refuses this one", async () => {
    /* Through the client the hub's own extensions use, so the body it builds is
       what is under test rather than one written out here. `https` so the
       refusal is the host policy rather than the scheme check. */
    await expect(createRemoteNet(base).request("https://127.0.0.1/")).rejects.toThrow(/127\.0\.0\.1/)
  })

  it("refuses a body that is not JSON", async () => {
    /* No client can send this one, so it is written out. */
    const response = await fetch(at(NET_ROUTE), { method: "POST", body: "not json" })
    expect(response.status).toBe(400)
    expect(((await response.json()) as { error?: string }).error).toContain("not JSON")
  })

  it("refuses an action it does not have", async () => {
    const response = await fetch(at(NET_ROUTE), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "post", url: "https://example.invalid/" }),
    })
    expect(response.status).toBe(400)
    expect(((await response.json()) as { error?: string }).error).toContain("unknown action")
  })
})

describe("a request a route does not own", () => {
  it.each([`${STATE_ROUTE}X`, `${EXTENSION_ROUTE}X`, `${NET_ROUTE}X`, "/hub/something-else"])(
    "is passed on rather than answered: %s",
    async (route) => {
      /* Matching by prefix would read the stray tail as a name — `state` as a
         document called `X`, `workspaces` as a workspace called `X` — and answer
         about something that was never asked for. */
      expect((await fetch(at(route))).status).toBe(404)
    }
  )
})
