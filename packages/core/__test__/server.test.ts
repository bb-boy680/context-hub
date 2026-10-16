/**
 * Behaviour of the hub's own server: it mounts bridges and a static root on a
 * real listener with an OS-assigned port and asserts the contract. The bound
 * port and origin are reported back, bridges are tried in order and the first to
 * answer wins, a request no bridge claims falls to the static root, a route with
 * no extension reaches the landing document while a missing file does not, the
 * static root never serves outside itself, a wildcard address is refused, and a
 * bridge that throws or answers nothing is reported instead of leaving the
 * request hanging.
 *
 * The port is always 0 — the OS assigns one — so these listeners never collide
 * with a running dev server or with each other.
 */
import { promises as fs } from "node:fs"
import { connect } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { sendJson, type HubMiddleware } from "../src/host/http.ts"
import { createHubServer, type HubListener } from "../src/host/server.ts"

/** One request written by hand, so a path the URL parser would normalise survives. */
function rawRequest(port: number, line: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, "127.0.0.1")
    let text = ""
    socket.setEncoding("utf8")
    socket.on("connect", () => {
      socket.write(`${line}\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`)
    })
    socket.on("data", (chunk: string) => {
      text += chunk
    })
    socket.on("end", () => resolve(text))
    socket.on("error", reject)
  })
}

function statusOf(response: string): number {
  return Number(/^HTTP\/1\.[01] (\d+)/.exec(response)?.[1] ?? 0)
}

/** Run one case against a listener of its own, closed however the case ends. */
async function withServer(
  middlewares: readonly HubMiddleware[],
  run: (port: number) => Promise<void>
): Promise<void> {
  const server = createHubServer({ middlewares, log: () => undefined })
  const up = await server.listen()
  try {
    await run(up.port)
  } finally {
    await up.close()
  }
}

const base = await fs.mkdtemp(path.join(tmpdir(), "context-hub-server-"))
const dist = path.join(base, "dist")
await fs.mkdir(path.join(dist, "assets"), { recursive: true })
await fs.writeFile(path.join(dist, "index.html"), "<!doctype html><title>hub</title>", "utf8")
await fs.writeFile(path.join(dist, "assets", "app.js"), "export default 1\n", "utf8")
/* A file beside the root, to be reached for and never served. */
const secret = "this must never be served"
await fs.writeFile(path.join(base, "secret.txt"), secret, "utf8")

afterAll(async () => {
  await fs.rm(base, { recursive: true, force: true })
})

/* An address that would expose this host is refused before anything binds. */
describe("an address that would expose this host", () => {
  it.each(["0.0.0.0", "::", "*", ""])("refuses %j", (host) => {
    expect(() => createHubServer({ middlewares: [], host })).toThrow()
  })
})

describe("the chain", () => {
  const seen: string[] = []
  const first: HubMiddleware = (request, response, next) => {
    seen.push("first")
    const url = new URL(request.url ?? "/", "http://localhost")
    if (!url.pathname.startsWith("/hub/demo")) {
      next()
      return
    }
    sendJson(response, 200, { answered: "first", path: url.pathname })
  }
  const second: HubMiddleware = (_request, _response, next) => {
    seen.push("second")
    next()
  }

  let listener: HubListener

  beforeAll(async () => {
    const server = createHubServer({
      middlewares: [first, second],
      static: { root: dist },
      log: () => undefined,
    })
    listener = await server.listen()
  })

  afterAll(async () => {
    await listener.close()
  })

  const at = (suffix: string) => `${listener.url}${suffix}`

  it("comes back on a real port, named by its origin", () => {
    expect(listener.port).toBeGreaterThan(0)
    expect(listener.url).toBe(`http://127.0.0.1:${listener.port}`)
  })

  /* A bridge answers its own route, and the one after it is not consulted. */
  it("answers the route a bridge claims, and stops there", async () => {
    const answered = await fetch(at("/hub/demo/one"))
    expect(answered.status).toBe(200)
    expect((await answered.json()) as { answered?: string }).toMatchObject({ answered: "first" })
    expect(seen, "the bridge after the one that answered was run").toEqual(["first"])
  })

  /* Anything else passes down the chain to the static root. */
  it("sends an unclaimed path to the static root", async () => {
    const landing = await fetch(at("/"))
    expect(landing.status).toBe(200)
    expect(await landing.text()).toContain("<title>hub")
  })

  it("serves a static file, labelled from its extension", async () => {
    const asset = await fetch(at("/assets/app.js"))
    expect(asset.status).toBe(200)
    expect(asset.headers.get("content-type")).toBe("text/javascript; charset=utf-8")
  })

  /* The app is served by a client router, so a path with no extension is a route. */
  it("answers a route with no extension with the landing document", async () => {
    const route = await fetch(at("/skills"))
    expect(route.status).toBe(200)
    expect(await route.text()).toContain("<title>hub")
  })

  it("answers a missing file as missing, not as markup", async () => {
    expect((await fetch(at("/assets/gone.js"))).status).toBe(404)
  })

  it("refuses a write to the static root", async () => {
    expect((await fetch(at("/"), { method: "POST" })).status).toBe(405)
  })

  describe("the root is never escaped", () => {
    const ATTEMPTS = [
      "GET /../secret.txt HTTP/1.1",
      "GET /..%2fsecret.txt HTTP/1.1",
      "GET /%2e%2e%2fsecret.txt HTTP/1.1",
      "GET /assets/../../secret.txt HTTP/1.1",
    ]

    it.each(ATTEMPTS)("refuses %s", async (line) => {
      const response = await rawRequest(listener.port, line)
      expect(statusOf(response)).not.toBe(200)
      expect(response, "the file outside the root was served").not.toContain(secret)
    })

    /* The reach for it is answered, so the refusal is a decision and not a miss. */
    it("answers the escape as forbidden", async () => {
      const reached = await rawRequest(listener.port, "GET /..%2fsecret.txt HTTP/1.1")
      expect(statusOf(reached)).toBe(403)
    })
  })
})

describe("a bridge that fails", () => {
  it("is answered as a failure, and its reason is reported", async () => {
    await withServer(
      [
        () => {
          throw new Error("a bridge blew up")
        },
      ],
      async (port) => {
        const response = await fetch(`http://127.0.0.1:${port}/anything`)
        expect(response.status).toBe(500)
        expect((await response.json()) as { error?: string }).toMatchObject({
          error: "a bridge blew up",
        })
      }
    )
  })

  it("answers once even when the request is passed on twice", async () => {
    await withServer(
      [
        (_request, _response, next) => {
          /* Passes the request on twice: the chain must not run twice. */
          next()
          next()
        },
        (_request, response) => {
          sendJson(response, 200, { ok: true })
        },
      ],
      async (port) => {
        expect((await fetch(`http://127.0.0.1:${port}/x`)).status).toBe(200)
      }
    )
  })

  it("is not left hanging when it answers nothing and passes nothing on", async () => {
    await withServer(
      [
        () => {
          /* Answers nothing and passes nothing on. */
        },
      ],
      async (port) => {
        expect((await fetch(`http://127.0.0.1:${port}/x`)).status).toBe(500)
      }
    )
  })

  it("says so when there is no bridge and no static root", async () => {
    await withServer([], async (port) => {
      expect((await fetch(`http://127.0.0.1:${port}/x`)).status).toBe(404)
    })
  })
})
