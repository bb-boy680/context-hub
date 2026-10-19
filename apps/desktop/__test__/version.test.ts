import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

function manifest(relative: string): { version?: unknown } {
  return JSON.parse(readFileSync(new URL(relative, import.meta.url), "utf8")) as {
    version?: unknown
  }
}

describe("desktop version", () => {
  it("mirrors the root version so the dev app reports the same number", () => {
    const root = manifest("../../../package.json")
    const desktop = manifest("../package.json")
    expect(root.version).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)
    expect(desktop.version).toBe(root.version)
  })
})
