/**
 * The shims a plugin module's `import React from "react"` lands on.
 *
 * The export lists are static, so they can drift from React without a type
 * error. This suite compares them with the installed package, checks the import
 * map points at the shims, and checks the kernel publishes the instances the
 * shims read.
 */
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import * as React from "react"
import * as ReactDOM from "react-dom"
import * as JsxDevRuntime from "react/jsx-dev-runtime"
import * as JsxRuntime from "react/jsx-runtime"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  REACT_DOM_EXPORTS,
  RUNTIME_FILES,
} from "@context-hub/core/host/extension-runtime"

import { installExtensionRuntime } from "../src/lib/extension-runtime.ts"

/** Names a plugin may import: everything except interop and internal keys. */
function publicKeys(value: object): string[] {
  return Object.keys(value)
    .filter((key) => key !== "default" && key !== "module.exports" && !key.startsWith("__"))
    .sort()
}

const temporary: string[] = []
let at = ""

beforeAll(async () => {
  at = await fs.mkdtemp(path.join(tmpdir(), "hub-extension-runtime-"))
  temporary.push(at)
  const shared = globalThis as typeof globalThis & Record<string, unknown>
  shared.__CONTEXT_HUB_REACT__ = React
  shared.__CONTEXT_HUB_REACT_DOM__ = ReactDOM
  shared.__CONTEXT_HUB_REACT_JSX_RUNTIME__ = JsxRuntime
  shared.__CONTEXT_HUB_REACT_JSX_DEV_RUNTIME__ = JsxDevRuntime
})

afterAll(async () => {
  for (const dir of temporary.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

async function load(name: string): Promise<Record<string, unknown>> {
  const file = path.join(at, name)
  await fs.writeFile(file, RUNTIME_FILES[name] ?? "")
  return (await import(pathToFileURL(file).href)) as Record<string, unknown>
}

describe("the React shims", () => {
  it("export the same public names as this build's React", async () => {
    const shim = await load("react.js")
    expect(publicKeys(shim)).toEqual(publicKeys(React))
    expect(shim.default).toBe(React)
  })

  it("expose the JSX runtime and the development runtime", async () => {
    expect(publicKeys(await load("jsx-runtime.js"))).toEqual(publicKeys(JsxRuntime))
    expect(publicKeys(await load("jsx-dev-runtime.js"))).toEqual(publicKeys(JsxDevRuntime))
  })

  it("expose the react-dom names a plugin may use", async () => {
    const shim = await load("react-dom.js")
    expect(shim.default).toBe(ReactDOM)
    for (const name of REACT_DOM_EXPORTS) {
      expect(shim[name]).toBe((ReactDOM as unknown as Record<string, unknown>)[name])
    }
  })
})

describe("the import map", () => {
  it("maps every React name to the shim this build serves", async () => {
    const html = await fs.readFile(new URL("../index.html", import.meta.url), "utf8")
    const match = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html)
    expect(match).not.toBeNull()
    const map = JSON.parse(match?.[1] ?? "{}") as { imports?: Record<string, string> }
    expect(map.imports).toEqual({
      react: "/hub/extensions/_runtime/react.js",
      "react/jsx-runtime": "/hub/extensions/_runtime/jsx-runtime.js",
      "react/jsx-dev-runtime": "/hub/extensions/_runtime/jsx-dev-runtime.js",
      "react-dom": "/hub/extensions/_runtime/react-dom.js",
    })
    for (const target of Object.values(map.imports ?? {})) {
      expect(RUNTIME_FILES[path.basename(target)]).toBeDefined()
    }
  })
})

describe("installExtensionRuntime", () => {
  it("publishes the instances the shims read", () => {
    installExtensionRuntime()
    const shared = globalThis as Record<string, unknown>
    expect(shared.__CONTEXT_HUB_REACT__).toBe(React)
    expect(shared.__CONTEXT_HUB_REACT_DOM__).toBe(ReactDOM)
    expect(shared.__CONTEXT_HUB_REACT_JSX_RUNTIME__).toBe(JsxRuntime)
    expect(shared.__CONTEXT_HUB_REACT_JSX_DEV_RUNTIME__).toBe(JsxDevRuntime)
  })
})
