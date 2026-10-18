import { describe, expect, it } from "vitest"

import { isShutdownMessage } from "../shutdown.ts"

describe("isShutdownMessage", () => {
  it("reads the utility process event shape", () => {
    expect(isShutdownMessage({ data: { type: "shutdown" } })).toBe(true)
  })

  it("reads a plain object", () => {
    expect(isShutdownMessage({ type: "shutdown" })).toBe(true)
  })

  it("ignores another message type", () => {
    expect(isShutdownMessage({ data: { type: "other" } })).toBe(false)
  })

  it("ignores values that are not a message", () => {
    expect(isShutdownMessage(null)).toBe(false)
    expect(isShutdownMessage("shutdown")).toBe(false)
    expect(isShutdownMessage({})).toBe(false)
  })
})
