/**
 * Reading a market index over the network.
 *
 * The reader is deliberately narrow: HTTPS in production, no redirects, a
 * deadline, a size cap and strict UTF-8. The tests use a loopback server, so
 * `allowHttp` and `allowPrivate` are the only switches they need.
 */
import { promises as fs } from "node:fs"
import { createServer, type Server } from "node:http"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { createMarketReader, fetchMarketIndex } from "../src/host/extension-market.ts"

const INDEX = JSON.stringify({ format: 1, title: "Test", plugins: [] })

let server: Server
let base = ""
let hits = 0
let status = 200
let body: string | Buffer = INDEX
let redirect = false

beforeAll(async () => {
  server = createServer((_request, response) => {
    hits += 1
    if (redirect) {
      response.writeHead(302, { Location: "/elsewhere" })
      response.end()
      return
    }
    response.writeHead(status, { "Content-Type": "application/json" })
    response.end(body)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (address === null || typeof address === "string") throw new Error("the server has no port")
  base = `http://127.0.0.1:${String(address.port)}/marketplace.json`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)))
  })
})

beforeEach(() => {
  hits = 0
  status = 200
  body = INDEX
  redirect = false
})

const OPTIONS = { allowHttp: true, allowPrivate: true } as const

describe("fetchMarketIndex", () => {
  it("reads and validates a document", async () => {
    const index = await fetchMarketIndex(base, OPTIONS)
    expect(index).toEqual({ format: 1, title: "Test", plugins: [] })
  })

  it("points a local index at the checkout that holds the plugin path", async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), "hub-local-index-"))
    try {
      await fs.mkdir(path.join(dir, "plugins", "demo.one"), { recursive: true })
      const version = (at: string) => ({
        version: "1.0.0",
        engines: { contextHub: ">=0.0.1 <0.7.0" },
        source: { type: "git", url: "https://github.com/example/repo", path: at },
      })
      await fs.writeFile(
        path.join(dir, "marketplace.json"),
        JSON.stringify({
          format: 1,
          title: "Local",
          plugins: [
            {
              id: "demo.one",
              title: "One",
              description: "One",
              icon: "https://example.test/one.svg",
              author: "Test",
              versions: [version("plugins/demo.one")],
            },
            {
              id: "demo.two",
              title: "Two",
              description: "Two",
              icon: "https://example.test/two.svg",
              author: "Test",
              versions: [version("plugins/demo.two")],
            },
          ],
        })
      )

      const index = await fetchMarketIndex(dir)
      expect(index.plugins[0]?.versions[0]?.source.url).toBe(path.resolve(dir))
      expect(index.plugins[1]?.versions[0]?.source.url).toBe(
        "https://github.com/example/repo"
      )
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  it("refuses a non-success answer", async () => {
    status = 404
    await expect(fetchMarketIndex(base, OPTIONS)).rejects.toThrow(/answered 404/)
  })

  it("refuses a redirect", async () => {
    redirect = true
    await expect(fetchMarketIndex(base, OPTIONS)).rejects.toThrow(/redirected/)
  })

  it("refuses a body over the limit", async () => {
    await expect(fetchMarketIndex(base, { ...OPTIONS, maxBytes: 10 })).rejects.toThrow(
      /larger than 10 bytes/
    )
  })

  it("refuses JSON that is not an index", async () => {
    body = "{"
    await expect(fetchMarketIndex(base, OPTIONS)).rejects.toThrow(/is not JSON/)
  })

  it("refuses bytes that are not UTF-8", async () => {
    body = Buffer.from([0xff, 0xfe])
    await expect(fetchMarketIndex(base, OPTIONS)).rejects.toThrow(/is not UTF-8/)
  })

  it("refuses a loopback index unless the caller opts in", async () => {
    await expect(fetchMarketIndex(base, { allowHttp: true })).rejects.toThrow(/not a public host/)
  })

  it("reads an index from a local directory", async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), "hub-local-market-"))
    try {
      await fs.writeFile(
        path.join(dir, "marketplace.json"),
        JSON.stringify({
          format: 1,
          title: "Local",
          plugins: [
            {
              id: "demo.local",
              title: "Local",
              description: "Local",
              icon: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
              author: "Test",
              versions: [
                {
                  version: "1.0.0",
                  engines: { contextHub: ">=0.0.1 <0.7.0" },
                  source: { type: "git", url: dir },
                },
              ],
            },
          ],
        })
      )
      expect((await fetchMarketIndex(dir)).plugins[0]?.id).toBe("demo.local")
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })

  it("refuses a local directory with no index", async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), "hub-local-market-"))
    try {
      await expect(fetchMarketIndex(dir)).rejects.toThrow(/there is no/)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  })
})

describe("createMarketReader", () => {
  it("reuses a successful document until it expires or is refreshed", async () => {
    const reader = createMarketReader({ ...OPTIONS, cacheTtlMs: 60_000 })
    await reader.read(base)
    await reader.read(base)
    expect(hits).toBe(1)
    await reader.read(base, true)
    expect(hits).toBe(2)
  })

  it("shares one request between concurrent readers", async () => {
    const reader = createMarketReader({ ...OPTIONS, cacheTtlMs: 60_000 })
    await Promise.all([reader.read(base), reader.read(base)])
    expect(hits).toBe(1)
  })

  it("does not cache a failure", async () => {
    status = 500
    const reader = createMarketReader({ ...OPTIONS, cacheTtlMs: 60_000 })
    await expect(reader.read(base)).rejects.toThrow(/answered 500/)
    status = 200
    await expect(reader.read(base)).resolves.toMatchObject({ format: 1 })
    expect(hits).toBe(2)
  })
})
