import { describe, expect, it } from "vitest"

import { summaryHtml } from "../src/apis/summary.ts"

/** The shape skills.sh renders: a heading, then the prose block it belongs to. */
function page(prose: string): string {
  return [
    `<script>self.__next_f.push([1,"{\\"children\\":\\"Summary\\"}"])</script>`,
    `<div class="uppercase">Summary</div>`,
    `<div class="mb-8 rounded-lg"><div class="p-6">`,
    `<div class="prose prose-invert max-w-none">${prose}</div>`,
    `</div></div>`,
    `<div class="prose">The skill readme, not the summary</div>`,
  ].join("")
}

describe("summaryHtml", () => {
  it("reads the prose block under the summary heading", () => {
    const body = "<p><strong>Short summary</strong></p><ul><li>One</li></ul>"
    expect(summaryHtml(page(body))).toBe(body)
  })

  it("counts nested divs so the block ends where it should", () => {
    const body = '<div class="callout"><p>Inside</p></div><p>After</p>'
    expect(summaryHtml(page(body))).toBe(body)
  })

  it("returns null when the page has no summary heading", () => {
    expect(summaryHtml('<div class="prose"><p>Only the readme</p></div>')).toBeNull()
  })

  it("returns null when the prose block is empty", () => {
    expect(summaryHtml(page("  "))).toBeNull()
  })
})
