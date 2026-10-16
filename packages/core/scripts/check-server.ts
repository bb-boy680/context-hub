/**
 * Behaviour check for the hub's own server. It mounts a bridge and a static
 * root on a real listener with an OS-assigned port and asserts the contract:
 * the bound port and origin are reported back, bridges are tried in order and
 * the first to answer wins, a request no bridge claims falls to the static
 * root, a route with no extension reaches the landing document while a missing
 * file does not, the static root never serves outside itself, a wildcard
 * address is refused, and a bridge that throws or answers nothing is reported
 * instead of leaving the request hanging.
 *
 * Run from the package: `node scripts/check-server.ts`
 */
import { promises as fs } from "node:fs"
import { connect } from "node:net"
import { tmpdir } from "node:os"
import path from "node:path"

import { sendJson, type HubMiddleware } from "../src/host/http.ts"
import { createHubServer, type HubListener } from "../src/host/server.ts"

let failures = 0

function check(what: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`  ok   ${what}`)
    return
  }
  failures += 1
  console.log(`  FAIL ${what}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`)
}

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

const base = await fs.mkdtemp(path.join(tmpdir(), "context-hub-server-"))
const dist = path.join(base, "dist")
await fs.mkdir(path.join(dist, "assets"), { recursive: true })
await fs.writeFile(path.join(dist, "index.html"), "<!doctype html><title>hub</title>", "utf8")
await fs.writeFile(path.join(dist, "assets", "app.js"), "export default 1\n", "utf8")
/* A file beside the root, to be reached for and never served. */
const secret = "this must never be served"
await fs.writeFile(path.join(base, "secret.txt"), secret, "utf8")
console.log(`static root: ${dist}`)

/* ── An address that would expose this host is refused before anything binds ── */

for (const host of ["0.0.0.0", "::", "*", ""]) {
  let refused = ""
  try {
    createHubServer({ middlewares: [], host })
  } catch (error) {
    refused = error instanceof Error ? error.message : String(error)
  }
  check(`binding every interface is refused: ${JSON.stringify(host)}`, refused !== "", refused)
}

/* ── The chain: bridges in order, then the static root ── */

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

let listener: HubListener | null = null
try {
  const server = createHubServer({
    middlewares: [first, second],
    static: { root: dist },
    log: () => undefined,
  })
  listener = await server.listen()

  check("port 0 comes back as a real port", listener.port > 0, listener.port)
  check(
    "the origin names the bound loopback address",
    listener.url === `http://127.0.0.1:${listener.port}`,
    listener.url
  )

  const at = (suffix: string) => `${listener?.url ?? ""}${suffix}`

  /* A bridge answers its own route, and the one after it is not consulted. */
  const answered = await fetch(at("/hub/demo/one"))
  check("a bridge answers the route it claims", answered.status === 200, answered.status)
  check(
    "the body is the bridge's own",
    (await answered.json() as { answered?: string }).answered === "first"
  )
  check("the bridge after the one that answered was not run", seen.join(",") === "first", seen)

  /* Anything else passes down the chain to the static root. */
  const landing = await fetch(at("/"))
  check("an unclaimed path reaches the static root", landing.status === 200, landing.status)
  check("the landing document is served", (await landing.text()).includes("<title>hub"))

  const asset = await fetch(at("/assets/app.js"))
  check("a static file is served", asset.status === 200, asset.status)
  check(
    "and is labelled from its extension",
    asset.headers.get("content-type") === "text/javascript; charset=utf-8",
    asset.headers.get("content-type")
  )

  /* The app is served by a client router, so a path with no extension is a route. */
  const route = await fetch(at("/skills"))
  check("a route with no extension reaches the landing document", route.status === 200, route.status)
  check("and it is the landing document", (await route.text()).includes("<title>hub"))

  const missingFile = await fetch(at("/assets/gone.js"))
  check("a missing file is answered as missing, not as markup", missingFile.status === 404, missingFile.status)

  const notGet = await fetch(at("/"), { method: "POST" })
  check("a write to the static root is refused", notGet.status === 405, notGet.status)

  /* ── The root is never escaped ── */

  const attempts = [
    "GET /../secret.txt HTTP/1.1",
    "GET /..%2fsecret.txt HTTP/1.1",
    "GET /%2e%2e%2fsecret.txt HTTP/1.1",
    "GET /assets/../../secret.txt HTTP/1.1",
  ]
  for (const line of attempts) {
    const response = await rawRequest(listener.port, line)
    const status = statusOf(response)
    check(`escaping the root is refused: ${line}`, status !== 200, status)
    check(`and the file outside it is not served: ${line}`, !response.includes(secret), status)
  }

  /* The reach for it is answered, so the refusal is a decision and not a miss. */
  const reached = await rawRequest(listener.port, "GET /..%2fsecret.txt HTTP/1.1")
  check("the escape is refused as forbidden", statusOf(reached) === 403, statusOf(reached))
} finally {
  await listener?.close()
}

/* ── A bridge that fails is reported, not left hanging ── */

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

await withServer(
  [
    () => {
      throw new Error("a bridge blew up")
    },
  ],
  async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/anything`)
    check("a bridge that throws is answered as a failure", response.status === 500, response.status)
    check(
      "and its reason is reported",
      ((await response.json()) as { error?: string }).error === "a bridge blew up"
    )
  }
)

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
    const response = await fetch(`http://127.0.0.1:${port}/x`)
    check("a bridge that passes on twice still answers once", response.status === 200, response.status)
  }
)

await withServer(
  [
    () => {
      /* Answers nothing and passes nothing on. */
    },
  ],
  async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/x`)
    check("a bridge that answers nothing is not left hanging", response.status === 500, response.status)
  }
)

await withServer([], async (port) => {
  const response = await fetch(`http://127.0.0.1:${port}/x`)
  check("a host with no bridge and no root says so", response.status === 404, response.status)
})

await fs.rm(base, { recursive: true, force: true })
console.log(failures === 0 ? "\nall checks passed" : `\n${failures} check(s) failed`)
process.exitCode = failures === 0 ? 0 : 1
