/**
 * The market route over a real socket: what the page sends, what the host
 * reads, and what it refuses.
 *
 * Installation writes files and runs git, so the handler test builds a real
 * repository and passes the index through an injected reader. The page-supplied
 * source is then ignored by construction: the reader is the only source of the
 * install target.
 */
import { execFile } from "node:child_process"
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createHubServer, type HubListener } from "@context-hub/core/host/server"

import { createExtensionMarketHandler } from "../handlers.ts"
import type {
  ExtensionMarketIndex,
  ExtensionMarketPlugin,
  ExtensionMarketVersion,
} from "../src/extension-market.ts"
import { EXTENSION_MARKET_ROUTE } from "../src/plugins.ts"

const ID = "demo.counter"
const MARKET = "https://example.test/marketplace.json"
const MANIFEST = {
  id: ID,
  name: "Demo",
  version: "1.0.0",
  apiVersion: "^0.1",
  entry: "index.js",
}

const temporary: string[] = []
let home = ""
let listener: HubListener
let base = ""
let index: ExtensionMarketIndex

function git(args: readonly string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", [...args], { cwd, windowsHide: true }, (error, stdout, stderr) => {
      if (error === null) {
        resolve(`${String(stdout)}${String(stderr)}`)
        return
      }
      reject(new Error(`${error.message}\n${String(stderr)}`))
    })
  })
}

async function repository(): Promise<{
  repo: string
  dir: string
  version: ExtensionMarketVersion
}> {
  const repo = await fs.mkdtemp(path.join(tmpdir(), "hub-market-handler-repo-"))
  temporary.push(repo)
  const dir = path.join(repo, "plugins", ID)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, "plugin.json"), JSON.stringify(MANIFEST))
  await fs.writeFile(path.join(dir, "index.js"), "export function apply() {}\n")
  await git(["init", "--quiet"], repo)
  await git(["add", "."], repo)
  await git(
    ["-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "--quiet", "-m", "one"],
    repo
  )
  return {
    repo,
    dir,
    version: {
      version: "1.0.0",
      apiVersion: "^0.1",
      source: { type: "git", url: repo, path: `plugins/${ID}` },
    },
  }
}

function pluginOf(version: ExtensionMarketVersion): ExtensionMarketPlugin {
  return {
    id: ID,
    title: "Demo",
    description: "Demo",
    icon: "https://example.test/icon.svg",
    author: "Test",
    permissions: [],
    versions: [version],
  }
}

beforeAll(async () => {
  const source = await repository()
  home = await fs.mkdtemp(path.join(tmpdir(), "hub-market-handler-home-"))
  temporary.push(home)
  index = { format: 1, title: "Test", plugins: [pluginOf(source.version)] }
  const server = createHubServer({
    middlewares: [
      createExtensionMarketHandler({
        home,
        reader: { read: async () => index },
      }),
    ],
    log: () => undefined,
  })
  listener = await server.listen()
  base = listener.url
})

afterAll(async () => {
  await listener.close()
  for (const dir of temporary.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

function post(body: unknown): Promise<Response> {
  return fetch(`${base}${EXTENSION_MARKET_ROUTE}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("the market route", () => {
  it("lists a configured index", async () => {
    const response = await post({ action: "list", url: MARKET })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { index?: ExtensionMarketIndex }
    expect(body.index?.plugins[0]?.id).toBe(ID)
  })

  it("refuses a method other than POST", async () => {
    const response = await fetch(`${base}${EXTENSION_MARKET_ROUTE}`)
    expect(response.status).toBe(405)
  })

  it("does not answer for a path that merely starts with the route", async () => {
    const response = await fetch(`${base}${EXTENSION_MARKET_ROUTE}X`)
    expect(response.status).toBe(404)
  })

  it("refuses an unknown action", async () => {
    const response = await post({ action: "dance" })
    expect(response.status).toBe(400)
  })

  it("refuses an id the index does not list", async () => {
    const response = await post({ action: "install", url: MARKET, id: "other.plugin", version: "1.0.0" })
    expect(response.status).toBe(400)
  })

  it("refuses a version the index does not list", async () => {
    const response = await post({ action: "install", url: MARKET, id: ID, version: "9.9.9" })
    expect(response.status).toBe(400)
  })
})

describe("installing through the route", () => {
  it("installs the version the index names and enables it", async () => {
    const response = await post({
      action: "install",
      url: MARKET,
      id: ID,
      version: "1.0.0",
      /* A page-supplied source must not reach the installer. */
      source: { type: "git", url: "https://evil.test/repo" },
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: ID, version: "1.0.0", enabled: true })
    expect(await fs.readFile(path.join(home, "extensions", ID, "index.js"), "utf8")).toContain(
      "apply"
    )
    expect(await fs.readFile(path.join(home, "state", "extensions.json"), "utf8")).toContain(ID)
  })

  it("removes an installed extension", async () => {
    const response = await post({ action: "remove", id: ID })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    await expect(fs.stat(path.join(home, "extensions", ID))).rejects.toThrow()
    expect(await fs.readFile(path.join(home, "state", "extensions.json"), "utf8")).not.toContain(ID)
  })

  it("refuses to remove an extension that is not installed", async () => {
    const response = await post({ action: "remove", id: ID })
    expect(response.status).toBe(400)
  })
})
