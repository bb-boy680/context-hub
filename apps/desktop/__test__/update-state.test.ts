import { describe, expect, it } from "vitest"

import {
  applyUpdateEvent,
  initialUpdateState,
  type UpdateState,
} from "../src/update-state.ts"

describe("applyUpdateEvent", () => {
  it("carries a version from availability through the download", () => {
    let state = initialUpdateState
    state = applyUpdateEvent(state, { type: "available", version: "1.2.3" })
    expect(state).toEqual({ status: "available", version: "1.2.3" })

    state = applyUpdateEvent(state, { type: "downloading" })
    expect(state).toEqual({ status: "downloading", version: "1.2.3", percent: 0 })

    state = applyUpdateEvent(state, { type: "progress", percent: 42 })
    expect(state).toEqual({ status: "downloading", version: "1.2.3", percent: 42 })

    state = applyUpdateEvent(state, { type: "downloaded", version: "1.2.3" })
    expect(state).toEqual({ status: "ready", version: "1.2.3" })
  })

  it("clamps and rounds download progress", () => {
    const base: UpdateState = {
      status: "downloading",
      version: "1.2.3",
      percent: 0,
    }
    expect(applyUpdateEvent(base, { type: "progress", percent: 140 }).percent).toBe(100)
    expect(applyUpdateEvent(base, { type: "progress", percent: -5 }).percent).toBe(0)
    expect(applyUpdateEvent(base, { type: "progress", percent: 42.4 }).percent).toBe(42)
    expect(applyUpdateEvent(base, { type: "progress", percent: 42.6 }).percent).toBe(43)
  })

  it("returns to an available version so a failed download can be retried", () => {
    const state: UpdateState = {
      status: "downloading",
      version: "1.2.3",
      percent: 10,
    }
    expect(applyUpdateEvent(state, { type: "failed" })).toEqual({
      status: "available",
      version: "1.2.3",
    })
  })

  it("drops back to idle when no version was known", () => {
    expect(applyUpdateEvent(initialUpdateState, { type: "failed" })).toEqual({
      status: "idle",
    })
    expect(
      applyUpdateEvent(
        { status: "available", version: "1.2.3" },
        { type: "none" }
      )
    ).toEqual({ status: "idle" })
  })
})
