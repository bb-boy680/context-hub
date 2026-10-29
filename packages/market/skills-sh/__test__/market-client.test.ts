import { describe, expect, it } from "vitest"

import type { NetPort, NetResponse } from "@context-hub/extensions"

import {
  createMarketClient,
  MarketHttpError,
  marketSkillUrl,
} from "../src/apis/index.ts"

function fakeNet(answers: Record<string, NetResponse>) {
  const asked: string[] = []
  const net: NetPort = {
    async request(url) {
      asked.push(url)
      const reply = answers[url]
      if (reply === undefined) throw new Error(`no answer for ${url}`)
      return reply
    },
  }
  return { asked, net }
}

const ORIGIN = "https://skills.sh"

describe("createMarketClient", () => {
  it("parses a ranking page and keeps only valid rows", async () => {
    const url = `${ORIGIN}/api/skills/all-time/0`
    const { net, asked } = fakeNet({
      [url]: {
        status: 200,
        body: JSON.stringify({
          skills: [
            {
              source: "vercel-labs/skills",
              skillId: "find-skills",
              name: "find-skills",
              installs: 12,
              weeklyInstalls: [1, 2, 3],
              isOfficial: true,
            },
            { source: "", name: "broken" },
            { source: "a/b", skillId: "c", name: "c", installs: "no" },
          ],
          total: 9,
          hasMore: true,
        }),
      },
    })
    const page = await createMarketClient(net).rank("all-time", 0)
    expect(asked).toEqual([url])
    expect(page.total).toBe(9)
    expect(page.hasMore).toBe(true)
    expect(page.rows).toHaveLength(2)
    expect(page.rows[0]?.weeklyInstalls).toEqual([1, 2, 3])
    expect(page.rows[0]?.isOfficial).toBe(true)
    expect(page.rows[1]?.installs).toBe(0)
  })

  it("retries a timeout once and keeps the second answer", async () => {
    const url = `${ORIGIN}/api/skills/all-time/0`
    let calls = 0
    const net: NetPort = {
      async request(target) {
        expect(target).toBe(url)
        calls += 1
        if (calls === 1) throw new Error("The operation was aborted due to timeout")
        return {
          status: 200,
          body: JSON.stringify({ skills: [], total: 0, hasMore: false }),
        }
      },
    }
    const page = await createMarketClient(net).rank("all-time", 0)
    expect(page.rows).toEqual([])
    expect(calls).toBe(2)
  })

  it("does not retry a failure that is not a timeout", async () => {
    let calls = 0
    const net: NetPort = {
      async request() {
        calls += 1
        throw new Error("network down")
      },
    }
    await expect(createMarketClient(net).rank("hot", 0)).rejects.toThrow("network down")
    expect(calls).toBe(1)
  })

  it("refuses a page that is not data", async () => {
    const url = `${ORIGIN}/api/skills/hot/0`
    const { net } = fakeNet({ [url]: { status: 200, body: "<html>" } })
    await expect(createMarketClient(net).rank("hot", 0)).rejects.toThrow(
      "skills.sh answered a page instead of data"
    )
  })

  it("answers an upstream error with the API's own words", async () => {
    const url = `${ORIGIN}/api/search?q=find&limit=200`
    const { net } = fakeNet({
      [url]: { status: 429, body: JSON.stringify({ message: "slow down" }) },
    })
    await expect(createMarketClient(net).search("find")).rejects.toMatchObject({
      status: 429,
      message: "skills.sh answered 429",
    })
    await expect(createMarketClient(net).search("find")).rejects.toBeInstanceOf(MarketHttpError)
  })

  it("enforces the two-character search floor and encodes the query", async () => {
    const { net, asked } = fakeNet({
      [`${ORIGIN}/api/search?q=a%20b&limit=200`]: {
        status: 200,
        body: JSON.stringify({ skills: [] }),
      },
    })
    await expect(createMarketClient(net).search("a")).rejects.toThrow("two characters")
    const page = await createMarketClient(net).search("a b")
    expect(page.rows).toEqual([])
    expect(asked).toEqual([`${ORIGIN}/api/search?q=a%20b&limit=200`])
  })

  it("reads a preview and drops an unsafe path", async () => {
    const url = `${ORIGIN}/api/download/vercel-labs/skills/find-skills`
    const { net } = fakeNet({
      [url]: {
        status: 200,
        body: JSON.stringify({
          files: [
            { path: "SKILL.md", contents: "# Skill" },
            { path: "../escape", contents: "no" },
            { path: "/abs", contents: "no" },
            { path: "references/x.md", contents: "x" },
          ],
          hash: "abc",
        }),
      },
    })
    const bundle = await createMarketClient(net).download("vercel-labs/skills", "find-skills")
    expect(bundle?.hash).toBe("abc")
    expect(bundle?.files.map((file) => file.path)).toEqual([
      "SKILL.md",
      "references/x.md",
    ])
  })

  it("turns a missing preview into null, not an error", async () => {
    const url = `${ORIGIN}/api/download/uizze.sh/ios-design`
    const { net } = fakeNet({ [url]: { status: 404, body: "not found" } })
    await expect(createMarketClient(net).download("uizze.sh", "ios-design")).resolves.toBeNull()
  })

  it("refuses a source that could climb out of its URL", async () => {
    const { net } = fakeNet({})
    await expect(createMarketClient(net).download("../evil", "x")).rejects.toThrow(
      "parent directory"
    )
    await expect(createMarketClient(net).download("a/b", "../x")).rejects.toThrow(
      "single name"
    )
  })

  it("parses an audit and keeps an open risk level", async () => {
    const url = `${ORIGIN}/api/v1/skills/audit/vercel-labs/skills/find-skills`
    const { net } = fakeNet({
      [url]: {
        status: 200,
        body: JSON.stringify({
          id: "vercel-labs/skills/find-skills",
          source: "vercel-labs/skills",
          slug: "find-skills",
          audits: [
            {
              provider: "Snyk",
              slug: "snyk",
              status: "warn",
              summary: "Risk: MEDIUM",
              auditedAt: "2026-10-01T00:00:00Z",
              riskLevel: "MEDIUM",
            },
            { provider: "", slug: "", status: "pass", summary: "", auditedAt: "" },
          ],
        }),
      },
    })
    const audit = await createMarketClient(net).audit("vercel-labs/skills", "find-skills")
    expect(audit?.audits).toHaveLength(1)
    expect(audit?.audits[0]?.riskLevel).toBe("MEDIUM")
    expect(audit?.audits[0]?.status).toBe("warn")
  })

  it("reads the generated summary out of the skill page", async () => {
    const url = "https://www.skills.sh/vercel-labs/skills/find-skills"
    const { net, asked } = fakeNet({
      [url]: {
        status: 200,
        body: '<div class="uppercase">Summary</div><div class="prose"><p>Hi</p></div>',
      },
    })
    await expect(
      createMarketClient(net).summary("vercel-labs/skills", "find-skills")
    ).resolves.toBe("<p>Hi</p>")
    expect(asked).toEqual([url])
  })

  it("builds the site URL for both source shapes", () => {
    expect(marketSkillUrl("vercel-labs/skills", "find-skills", true)).toBe(
      "https://www.skills.sh/vercel-labs/skills/find-skills"
    )
    expect(marketSkillUrl("uizze.sh", "ios-design", true)).toBe(
      "https://www.skills.sh/site/uizze.sh/ios-design"
    )
  })
})
