import { describe, expect, it } from "vitest"

import { failureText } from "../src/failure.ts"

const t = (key: string) => key

describe("failureText", () => {
  it("names a proxy timeout in the reader's language", () => {
    expect(failureText(new Error("The operation was aborted due to timeout"), t)).toBe(
      "market.state.timeout"
    )
  })

  it("keeps another failure's own words", () => {
    expect(failureText(new Error("skills.sh answered 429"), t)).toBe("skills.sh answered 429")
  })
})
