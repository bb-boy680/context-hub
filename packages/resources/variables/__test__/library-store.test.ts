/**
 * The variable library as a service: that a form can find it, that a form with
 * no library is not a failure, and that a write's own answer is what the shared
 * read publishes.
 *
 * The startup asks for the service by name before anything is drawn, so a class
 * that registers nothing would leave both the page and the global search with
 * an empty library forever — and every check still green.
 */
import { Context } from "@deepseek-ai/cordis"
import { describe, expect, it } from "vitest"

import { VARIABLE_LIBRARY_SERVICE, VariableLibrary } from "../src/library-store.ts"
import type { VariableDocument, VariableStore } from "../src/store.ts"

/** One document holding a single variable under the default group. */
function documentWith(name: string): VariableDocument {
  return {
    version: 1,
    groups: ["通用"],
    variables: [{ name, group: "通用", value: "value", updatedAt: "2026-01-01T00:00:00.000Z" }],
  }
}

/** A store whose every answer names the action it took, so the test can tell them apart. */
function fakeStore(reads: { count: number }): VariableStore {
  return {
    read: async () => {
      reads.count += 1
      return documentWith("READ")
    },
    create: async () => documentWith("CREATED"),
    update: async () => documentWith("UPDATED"),
    remove: async () => documentWith("REMOVED"),
    createGroup: async () => documentWith("GROUP"),
    renameGroup: async () => documentWith("RENAMED"),
    removeGroup: async () => documentWith("REMOVED_GROUP"),
  }
}

describe("the variable library a form starts", () => {
  it("is under the name the form reads it by", () => {
    const ctx = new Context()
    new VariableLibrary(ctx)
    expect(ctx.get(VARIABLE_LIBRARY_SERVICE)).toBeInstanceOf(VariableLibrary)
  })

  it("reads nothing, and reports nothing, when this form has no library", async () => {
    const ctx = new Context()
    const library = new VariableLibrary(ctx)
    await library.load()
    expect(library.store()).toBeNull()
    expect(library.state()).toMatchObject({
      status: "ready",
      value: { document: null },
      failure: null,
    })
  })

  it("publishes the answer a write returned, without reading again", async () => {
    const reads = { count: 0 }
    const ctx = new Context()
    ctx.provide("hub.variables", fakeStore(reads))
    const library = new VariableLibrary(ctx)
    let told = 0
    library.subscribe(() => {
      told += 1
    })

    await library.load()
    expect(library.state().value?.document?.variables[0]?.name).toBe("READ")

    await library.create([{ name: "CREATED", value: "value" }])
    expect(library.state().value?.document?.variables[0]?.name).toBe("CREATED")
    expect(reads.count, "the write's own answer is the next document").toBe(1)
    expect(told, "the change reached the page").toBeGreaterThan(0)
  })
})
