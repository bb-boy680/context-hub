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
import { selectablePlaces } from "../src/library.ts"
import { SKILLS_ID } from "../src/extension.ts"
import { SkillService, type SkillPlace } from "../src/provider.ts"
import type { PlaceSkillsView, SkillPage } from "../src/store.ts"

/** One place an agent reads skills in, as its extension declares it. */
function place(id: string, scope: "workspace" | "global"): SkillPlace {
  return { id, labelKey: `${id}.tab`, icon: () => null, scope, dir: `.${id}/skills` }
}

/**
 * The workspace list as a form provides it, holding one choice.
 *
 * Only the two members the library reads are here: which agents are chosen, and
 * the notification that they changed.
 */
function formWorkspaces(agents: string[]) {
  return {
    current: () => ({ folders: [], current: null, agents }),
    subscribe: () => () => undefined,
    refresh: async () => undefined,
  }
}

/** A library that answers with one empty page and one empty place view. */function libraryOver() {
  const asked: string[] = []
  const store = {
    root: "host",
    list: async (): Promise<SkillPage> => {
      asked.push("list")
      return {
        items: [],
        total: 0,
        counts: { all: 0, builtin: 0, local: 0, registry: 0 },
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
  it("reads the shared place without offering it as an agent target", async () => {
    const { store, asked } = libraryOver()
    const ctx = new Context()
    const chosen = ["hub.target.codex", "hub.target.claude"]
    ctx.provide("hub.skills", store as never)
    ctx.provide("hub.workspaces", formWorkspaces(chosen) as never)
    const registry = new SkillService(ctx)
    registry.register({
      id: SKILLS_ID,
      shared: true,
      places: [{ ...place("workspace", "workspace"), dir: ".agents/skills" }],
    })
    registry.register({
      id: "hub.target.codex",
      places: [
        { ...place("codex-workspace", "workspace"), dir: ".agents/skills" },
        place("codex-global", "global"),
      ],
    })
    registry.register({ id: "hub.target.claude", places: [place("claude-workspace", "workspace")] })
    registry.register({ id: "hub.target.other", places: [place("other", "workspace")] })

    const library = new SkillLibrary(ctx)
    await library.load()

    expect(asked).toContain(".agents/skills")
    expect(library.state().value?.held.workspace).toMatchObject({ display: ".agents/skills" })
    expect(selectablePlaces(registry.providers(), chosen).map((target) => target.id)).toEqual([
      "codex-workspace", "codex-global", "claude-workspace",
    ])
    expect(selectablePlaces(registry.providers(), [])).toEqual([])
  })

  it("全局扫描只请求全局位置，普通工作区仍读取两种作用域", async () => {
    const { store, asked } = libraryOver()
    const ctx = new Context()
    let global = true
    const listeners = new Set<() => void>()
    ctx.provide("hub.skills", store as never)
    ctx.provide("hub.workspaces", {
      current: () => ({ current: "home", agents: ["agent"], folders: [{ id: "home", default: global }] }),
      refresh: async () => undefined,
      subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) },
    } as never)
    const registry = new SkillService(ctx)
    registry.register({ id: SKILLS_ID, shared: true, places: [place("shared", "workspace")] })
    registry.register({ id: "agent", places: [place("project", "workspace"), place("user", "global")] })
    const library = new SkillLibrary(ctx)
    await library.load()
    expect(asked).toEqual(["list", ".user/skills"])
    expect(Object.keys(library.state().value!.held)).toEqual(["user"])
    expect(selectablePlaces(registry.providers(), ["agent"], true).map((one) => one.id)).toEqual(["user"])

    global = false
    for (const listener of listeners) listener()
    expect(library.state().value!.held).toEqual({})
    await library.load()
    expect(Object.keys(library.state().value!.held)).toEqual(["shared", "project", "user"])

    global = true
    for (const listener of listeners) listener()
    expect(library.state().value!.held).toEqual({})
    await library.load()
    expect(Object.keys(library.state().value!.held)).toEqual(["user"])
  })

  it("切换后不发布延迟返回的旧工作区扫描", async () => {
    const { store } = libraryOver()
    const ctx = new Context()
    let global = false
    const listeners = new Set<() => void>()
    let entered!: () => void
    const started = new Promise<void>((resolve) => { entered = resolve })
    let finish!: (view: PlaceSkillsView | null) => void
    const delayed = new Promise<PlaceSkillsView | null>((resolve) => { finish = resolve })
    ctx.provide("hub.skills", { ...store, placeSkills: async ({ scope }: { scope: string }) => {
      if (scope === "workspace") { entered(); return delayed }
      return null
    } } as never)
    ctx.provide("hub.workspaces", {
      current: () => ({ current: "home", agents: ["agent"], folders: [{ id: "home", default: global }] }),
      refresh: async () => undefined,
      subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) },
    } as never)
    new SkillService(ctx).register({ id: "agent", places: [place("project", "workspace"), place("user", "global")] })
    const library = new SkillLibrary(ctx)
    const running = library.load()
    await started
    global = true
    const publications: string[][] = []
    library.subscribe(() => publications.push(Object.keys(library.state().value?.held ?? {})))
    for (const listener of listeners) listener()
    finish({ root: "/project", display: "/project", skills: [] })
    await running
    expect(publications.some((ids) => ids.includes("project"))).toBe(false)
    expect(Object.keys(library.state().value!.held)).toEqual(["user"])
  })

  it("is under the name the form reads it by", () => {
    const ctx = new Context()
    new SkillLibrary(ctx)
    expect(ctx.get(SKILL_LIBRARY_SERVICE)).toBeInstanceOf(SkillLibrary)
  })

  it("reads the catalog, the module's own place, and both scopes of the chosen agent", async () => {
    const { store, asked } = libraryOver()
    const ctx = new Context()
    ctx.provide("hub.skills", store as never)
    ctx.provide("hub.workspaces", formWorkspaces(["hub.target.two"]) as never)
    const registry = new SkillService(ctx)
    registry.register({
      id: "hub.skill.catalog",
      shared: true,
      places: [place("shared", "workspace")],
    })
    /* Chosen, so both of its scopes are read: the workspace one and the
       machine-wide one are the same agent's files. */
    registry.register({
      id: "hub.target.two",
      places: [place("two", "workspace"), place("two-global", "global")],
    })
    /* Nobody chose this one, so neither of its places is read. */
    registry.register({
      id: "hub.target.one",
      places: [place("one", "workspace"), place("one-global", "global")],
    })

    const library = new SkillLibrary(ctx)
    await library.load()

    expect(asked).toContain("list")
    expect(asked).toContain(".shared/skills")
    expect(asked).toContain(".two/skills")
    expect(asked).toContain(".two-global/skills")
    expect(asked, "an un-chosen agent's workspace place was read").not.toContain(".one/skills")
    expect(asked, "an un-chosen agent's machine-wide place was read").not.toContain(
      ".one-global/skills"
    )
    expect(library.state().value?.tags).toEqual(["demo"])
  })

  it("reads no agent's place when no agent is chosen", async () => {
    const { store, asked } = libraryOver()
    const ctx = new Context()
    ctx.provide("hub.skills", store as never)
    ctx.provide("hub.workspaces", formWorkspaces([]) as never)
    const registry = new SkillService(ctx)
    registry.register({ id: "hub.skill.catalog", shared: true, places: [place("shared", "workspace")] })
    registry.register({
      id: "hub.target.two",
      places: [place("two", "workspace"), place("two-global", "global")],
    })

    await new SkillLibrary(ctx).load()

    /* The catalog is this hub's own; the only place read is the shared one. */
    expect(asked).toEqual(["list", ".shared/skills"])
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
