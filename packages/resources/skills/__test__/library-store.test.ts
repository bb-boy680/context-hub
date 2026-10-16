/**
 * The skill library as a service: that a form can find it, which places it
 * reads, and that a form with no library to read is not a failure.
 *
 * The first of those is the whole point of it being a service — a form's startup
 * asks for it by name and starts it before anything is drawn, and a class that
 * holds a catalog but never registers is one nobody can ask. That is a mistake
 * worth a test rather than a comment, because everything else still compiles and
 * the page simply draws an empty library forever.
 */
import { Context } from "@deepseek-ai/cordis"
import { describe, expect, it } from "vitest"

import { SKILL_LIBRARY_SERVICE, SkillLibrary } from "../src/library-store.ts"
import { SkillService, type SkillPlace } from "../src/provider.ts"
import type { PlaceSkillsView, SkillPage } from "../src/store.ts"

/** One place an agent reads skills in, as its extension declares it. */
function place(id: string, scope: "workspace" | "global"): SkillPlace {
  return { id, labelKey: `${id}.tab`, icon: () => null, scope, dir: `.${id}/skills`, order: 10 }
}

/** A library that answers with one empty page and one empty place view. */
function libraryOver() {
  const asked: string[] = []
  const store = {
    root: "host",
    list: async (): Promise<SkillPage> => {
      asked.push("list")
      return {
        items: [],
        total: 0,
        counts: { all: 0, builtin: 0, local: 0, registry: 0 },
        revision: 1,
        root: "/somewhere",
      }
    },
    tags: async () => ["demo"],
    placeSkills: async (ref: { dir: string }): Promise<PlaceSkillsView | null> => {
      asked.push(ref.dir)
      return { root: `/there/${ref.dir}`, display: ref.dir, skills: [] }
    },
    /* The library watches its store for changes of its own; this one has none
       to report, which is what the browser's store does too. */
    subscribe: () => () => undefined,
  }
  return { store, asked }
}

describe("the skill library a form starts", () => {
  it("is under the name the form reads it by", () => {
    const ctx = new Context()
    new SkillLibrary(ctx)
    expect(ctx.get(SKILL_LIBRARY_SERVICE)).toBeInstanceOf(SkillLibrary)
  })

  it("reads the catalog and every place the chosen agents make readable", async () => {
    const { store, asked } = libraryOver()
    const ctx = new Context()
    ctx.provide("hub.skills", store as never)
    const registry = new SkillService(ctx)
    registry.register({ id: "hub.target.one", places: [place("one", "global")] })
    /* Nothing has chosen that agent, so its machine-wide place is not read; the
       workspace place of another module is, whatever is chosen. */
    registry.register({ id: "hub.target.two", places: [place("two", "workspace")] })

    const library = new SkillLibrary(ctx)
    await library.load()

    expect(asked).toContain("list")
    expect(asked).toContain(".two/skills")
    expect(asked, "a machine-wide place was read without its agent being chosen").not.toContain(
      ".one/skills"
    )
    expect(library.state().value?.tags).toEqual(["demo"])
  })

  it("reads nothing, and reports nothing, when this form has no library", async () => {
    const ctx = new Context()
    const library = new SkillLibrary(ctx)
    await library.load()
    expect(library.store()).toBeNull()
    expect(library.state()).toMatchObject({ status: "ready", value: { page: null }, failure: null })
  })

  it("does not read again merely because a load is asked for twice", async () => {
    const { store, asked } = libraryOver()
    const ctx = new Context()
    ctx.provide("hub.skills", store as never)
    const library = new SkillLibrary(ctx)

    await Promise.all([library.load(), library.load()])
    expect(asked.filter((one) => one === "list")).toHaveLength(1)
  })
})
