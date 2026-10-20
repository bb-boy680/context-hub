/**
 * The variable rows a global search offers: names and groups only, so a value
 * never reaches a result.
 */
import { describe, expect, it } from "vitest"

import { searchVariables } from "../src/search.ts"
import type { VariableDocument } from "../src/store.ts"

const document: VariableDocument = {
  version: 1,
  groups: ["通用", "cloud"],
  variables: [
    {
      name: "ANTHROPIC_API_KEY",
      group: "cloud",
      value: "sk-secret",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      name: "AWS_REGION",
      group: "cloud",
      value: "us-east-1",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
}

describe("searching the environment variables", () => {
  it("matches a name or a group, ignoring case", () => {
    expect(searchVariables(document, "anthropic").map((one) => one.title)).toEqual([
      "ANTHROPIC_API_KEY",
    ])
    expect(searchVariables(document, "CLOUD").map((one) => one.title)).toEqual([
      "ANTHROPIC_API_KEY",
      "AWS_REGION",
    ])
  })

  it("shows the group as the note and never the value", () => {
    const [row] = searchVariables(document, "anthropic")
    expect(row).toMatchObject({ title: "ANTHROPIC_API_KEY", description: "cloud" })
    expect(JSON.stringify(row)).not.toContain("sk-secret")
  })

  it("opens the page filtered by the clicked row's own name", () => {
    expect(searchVariables(document, "anthropic")[0]?.path).toBe(
      "/variables?q=ANTHROPIC_API_KEY"
    )
  })

  it("returns nothing for an empty query", () => {
    expect(searchVariables(document, "")).toEqual([])
  })
})
