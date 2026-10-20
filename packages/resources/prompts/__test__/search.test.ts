/**
 * The prompt rows a global search offers: the page's filter also reads the
 * body, so a search finds a prompt by the words inside it.
 */
import { describe, expect, it } from "vitest"

import type { PromptLibraryValue } from "../src/library-store.ts"
import { searchPrompts } from "../src/search.ts"
import type { StoredPrompt } from "../src/store.ts"

function prompt(overrides: Partial<StoredPrompt> = {}): StoredPrompt {
  return {
    id: "p1",
    name: "changelog",
    description: "Write a changelog entry",
    prompt: "# Rewrite the change as a sentence",
    tags: ["docs"],
    assets: ["assets/changelog.png"],
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

const value: PromptLibraryValue = {
  rows: [
    prompt(),
    prompt({ id: "p2", name: "review", description: "", prompt: "Review it", assets: [] }),
  ],
  tags: ["docs"],
  root: "/library",
}

const assetUrl = (ref: string) => `/assets/${ref}`

describe("searching the prompts", () => {
  it("finds a prompt by its body as well as its title", () => {
    expect(searchPrompts(value, "rewrite", assetUrl).map((one) => one.title)).toEqual([
      "changelog",
    ])
  })

  it("carries a picture and omits a note the row does not have", () => {
    const [withPicture] = searchPrompts(value, "changelog", assetUrl)
    expect(withPicture?.avatar).toBe("/assets/assets/changelog.png")

    const [withoutNote] = searchPrompts(value, "review", assetUrl)
    expect(withoutNote?.description).toBeUndefined()
  })

  it("opens the page filtered by the clicked row's own name", () => {
    expect(searchPrompts(value, "rewrite", assetUrl)[0]?.path).toBe(
      "/prompts?q=changelog"
    )
  })

  it("returns nothing for an empty query", () => {
    expect(searchPrompts(value, " ", assetUrl)).toEqual([])
  })
})
