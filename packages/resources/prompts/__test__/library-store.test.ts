/**
 * The prompt library as a service: that a form can find it, and that a form
 * with no library to read is not a failure.
 *
 * The first of those is the whole point of it being a service — a form's startup
 * asks for it by name and starts it before anything is drawn, and a class that
 * holds a catalog but never registers is one nobody can ask. That is a mistake
 * worth a test rather than a comment, because everything else still compiles and
 * the page simply draws an empty library forever.
 */
import { Context } from "@deepseek-ai/cordis"
import { describe, expect, it } from "vitest"

import { PROMPT_LIBRARY_SERVICE, PromptLibrary } from "../src/library-store.ts"

describe("the prompt library a form starts", () => {
  it("is under the name the form reads it by", () => {
    const ctx = new Context()
    new PromptLibrary(ctx)
    expect(ctx.get(PROMPT_LIBRARY_SERVICE)).toBeInstanceOf(PromptLibrary)
  })

  it("reads nothing, and reports nothing, when this form has no library", async () => {
    const ctx = new Context()
    const library = new PromptLibrary(ctx)
    await library.load()
    /* No `hub.prompts` was provided, so there is nothing to reach: the page
       draws an empty library rather than a failure about one it never had. */
    expect(library.store()).toBeNull()
    expect(library.state()).toMatchObject({
      status: "ready",
      value: { rows: [], tags: [], root: "" },
      failure: null,
    })
  })

  it("reads again for a reload, which is what a page asks for after a write", async () => {
    let reads = 0
    const ctx = new Context()
    ctx.provide("hub.prompts", {
      list: async () => {
        reads += 1
        return { items: [], total: 0, tags: [], root: "/somewhere" }
      },
    })
    const library = new PromptLibrary(ctx)

    await library.load()
    expect(reads).toBe(1)
    expect(library.state().value?.root).toBe("/somewhere")

    /* A page opening again is not a reason to read; a write is. */
    await library.load()
    expect(reads).toBe(1)
    await library.reload()
    expect(reads).toBe(2)
  })
})
