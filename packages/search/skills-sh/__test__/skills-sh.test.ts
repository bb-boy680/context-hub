/**
 * Behaviour of skills.sh as a skill registry.
 *
 * Everything here runs against canned answers instead of the site: this package
 * is a translation of two HTTP responses into rows and descriptions, and the
 * two facts that decide it — that the search route carries nothing but identity,
 * and that the description only exists in the skill's own page — are exactly
 * what a stubbed port can hold still.
 */
import { describe, expect, it } from "vitest"

import type { RemoteSkill, SkillRegistry } from "@context-hub/extensions"

import { skillsShExtension } from "../src/index.ts"

const SEARCH = "https://skills.sh/api/search"
const SITE = "https://www.skills.sh"

/** What the host's network port is stood in for with, and what it was asked. */
function fakeNet(answers: Record<string, { status: number; body: string }>) {
  const asked: string[] = []
  return {
    asked,
    net: {
      async request(url: string) {
        asked.push(url)
        const reply = answers[url]
        if (reply === undefined) throw new Error(`no canned answer for ${url}`)
        return reply
      },
    },
  }
}

/** Run the extension's `apply` over a stand-in context, and hand back what it registered. */
function applied(net: unknown) {
  const logs: string[] = []
  let registry: SkillRegistry | undefined
  skillsShExtension.apply?.({
    host: {
      net,
      log: (level: string, message: string) => logs.push(`${level}: ${message}`),
    },
    skillRegistries: {
      register: (given: SkillRegistry) => {
        registry = given
      },
    },
  } as never)
  if (registry === undefined) throw new Error("the extension registered nothing")
  return { registry, logs }
}

const page = (skills: unknown) => ({ status: 200, body: JSON.stringify({ skills }) })

describe("a form that cannot reach the network", () => {
  it("registers nothing and says why", () => {
    const logs: string[] = []
    let registered = false
    skillsShExtension.apply?.({
      host: { net: null, log: (level: string, message: string) => logs.push(`${level}: ${message}`) },
      skillRegistries: {
        register: () => {
          registered = true
        },
      },
    } as never)
    expect(registered, "the dialog keeps its own preview rather than failing a search").toBe(false)
    expect(logs.join(" ")).toContain("cannot reach the network")
  })
})

describe("search", () => {
  const asked = (query: string, offset: number, limit: number) =>
    `${SEARCH}?q=${encodeURIComponent(query)}&limit=${Math.min(offset + limit + 1, 200)}`

  it("asks the route for one row past the window, which is what proves a next page", async () => {
    const { net, asked: urls } = fakeNet({ [asked("pdf", 0, 10)]: page([]) })
    const { registry } = applied(net)
    await registry.search({ query: "pdf", offset: 0, limit: 10 })
    expect(urls).toEqual([asked("pdf", 0, 10)])
  })

  it("asks for no more than the route will answer", async () => {
    const { net, asked: urls } = fakeNet({ [asked("pdf", 0, 500)]: page([]) })
    await applied(net).registry.search({ query: "pdf", offset: 0, limit: 500 })
    expect(urls[0]).toContain("limit=200")
  })

  it("reads a row out of each usable entry and drops the ones the install path could not use", async () => {
    const entries = [
      { id: "owner/repo/one", source: "owner/repo", skillId: "one", name: "One", installs: 12 },
      /* No source: nothing to fetch it from. */
      { skillId: "no-source", name: "No source" },
      /* A name but no id and no name field, which is not an entry. */
      { source: "owner/repo" },
      /* The route also lists the same skill under a display name. */
      { source: "owner/repo", name: "two" },
    ]
    const { net } = fakeNet({ [asked("q", 0, 10)]: page(entries) })
    const answer = await applied(net).registry.search({ query: "q", offset: 0, limit: 10 })
    expect(answer.items.map((one: RemoteSkill) => one.name)).toEqual(["one", "two"])
    expect(answer.items[0]?.source).toBe("owner/repo")
    expect(answer.items[0]?.package).toBe("owner/repo")
    expect(answer.items[0]?.installs).toBe(12)
    /* A row with no count does not carry one rather than carrying a zero. */
    expect(answer.items[1]?.installs).toBeUndefined()
  })

  it("returns the window it was asked for, and says whether a page follows it", async () => {
    const entries = Array.from({ length: 4 }, (_one, index) => ({
      source: "owner/repo",
      skillId: `s${index}`,
    }))
    const { net } = fakeNet({ [asked("q", 1, 2)]: page(entries) })
    /* Four rows came back for a limit of two asked at 1, so one row past the
       window is the fourth — which is the evidence a next page exists. */
    const answer = await applied(net).registry.search({ query: "q", offset: 1, limit: 2 })
    expect(answer.items.map((one: RemoteSkill) => one.name)).toEqual(["s1", "s2"])
    expect(answer.hasMore).toBe(true)
  })

  it("says no page follows when the answer stops at the window", async () => {
    const { net } = fakeNet({
      [asked("q", 0, 2)]: page([{ source: "owner/repo", skillId: "s0" }]),
    })
    const answer = await applied(net).registry.search({ query: "q", offset: 0, limit: 2 })
    expect(answer.hasMore).toBe(false)
  })

  it("answers nothing for a response with no list in it", async () => {
    const { net } = fakeNet({ [asked("q", 0, 10)]: { status: 200, body: '{"total":0}' } })
    const answer = await applied(net).registry.search({ query: "q", offset: 0, limit: 10 })
    expect(answer.items).toEqual([])
    expect(answer.hasMore).toBe(false)
  })

  it("shows the route's own refusal rather than a status line", async () => {
    const { net } = fakeNet({
      [asked("q", 0, 10)]: { status: 400, body: '{"error":"Query must be at least 2 characters"}' },
    })
    await expect(
      applied(net).registry.search({ query: "q", offset: 0, limit: 10 })
    ).rejects.toThrow(/at least 2 characters/)
  })

  it("falls back to the status when the refusal says nothing", async () => {
    const { net } = fakeNet({ [asked("q", 0, 10)]: { status: 503, body: "<html>down</html>" } })
    await expect(
      applied(net).registry.search({ query: "q", offset: 0, limit: 10 })
    ).rejects.toThrow(/skills\.sh answered 503/)
  })
})

describe("describe", () => {
  const skill: RemoteSkill = { name: "one", source: "owner/repo" }

  it("reads the skill's own page, and unescapes what the page escaped", async () => {
    const { net } = fakeNet({
      [`${SITE}/owner/repo/one`]: {
        status: 200,
        body: '<meta name="description" content="Reads &quot;PDFs&quot; &amp; more &lt;fast&gt;">',
      },
    })
    expect(await applied(net).registry.describe?.(skill)).toEqual({
      description: 'Reads "PDFs" & more <fast>',
    })
  })

  it("answers nothing when the page carries no description", async () => {
    const { net } = fakeNet({
      [`${SITE}/owner/repo/one`]: { status: 200, body: "<html><title>one</title></html>" },
    })
    expect(await applied(net).registry.describe?.(skill)).toEqual({})
  })

  /* A page is asked for once per row on screen, and a row can be revisited. */
  it("asks once for a skill that comes round again", async () => {
    const { net, asked: urls } = fakeNet({
      [`${SITE}/owner/repo/one`]: {
        status: 200,
        body: '<meta name="description" content="Once">',
      },
    })
    const { registry } = applied(net)
    const first = await registry.describe?.(skill)
    const second = await registry.describe?.(skill)
    expect(urls).toHaveLength(1)
    expect(first).toEqual({ description: "Once" })
    expect(second).toEqual({ description: "Once" })
  })

  /* A page that carried none is remembered as such, so a row with no description
     does not re-ask every time it is drawn. */
  it("remembers a page that carried none", async () => {
    const { net, asked: urls } = fakeNet({
      [`${SITE}/owner/repo/one`]: { status: 200, body: "<html></html>" },
    })
    const { registry } = applied(net)
    await registry.describe?.(skill)
    expect(await registry.describe?.(skill)).toEqual({})
    expect(urls).toHaveLength(1)
  })

  it("answers nothing for a row with no source, without asking anything", async () => {
    const { net, asked: urls } = fakeNet({})
    expect(await applied(net).registry.describe?.({ name: "one" })).toEqual({})
    expect(urls).toEqual([])
  })

  it("shows the page's own refusal", async () => {
    const { net } = fakeNet({ [`${SITE}/owner/repo/one`]: { status: 404, body: "not here" } })
    await expect(applied(net).registry.describe?.(skill)).rejects.toThrow(/skills\.sh answered 404/)
  })
})
