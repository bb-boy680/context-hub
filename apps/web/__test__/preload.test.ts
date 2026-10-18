/**
 * The reads a startup starts: the list is written out, so a library added to it
 * is the only way it is read before a page opens. This pins the five that exist
 * today — the four asset libraries and the environment variables — because a
 * missing name here is invisible until someone opens a page that reads it.
 */
import { describe, expect, it } from "vitest"

import { PRELOADED } from "../src/lib/preload.ts"

describe("the startup reads", () => {
  it("starts every shared library, including the variables", () => {
    expect(PRELOADED).toEqual([
      "catalog.skills",
      "catalog.prompts",
      "catalog.mcp",
      "catalog.plugins",
      "catalog.variables",
    ])
  })
})
